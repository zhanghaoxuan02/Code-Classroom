"""
exam-system 插件
考试系统：支持多种题型、在线组卷、JSON 导入导出、自动/人工判卷
题目类型：single(单选) multi(多选) judge(判断) fill(填空) code(代码) operation(实操)
"""

import json
import uuid
import time
import subprocess
import tempfile
import os
import sys
from pathlib import Path
from contextlib import contextmanager

# ================================================================
# 数据库工具（复用主服务的 db_cursor）
# ================================================================

def _get_db_cursor():
    """延迟导入 db_cursor，避免循环依赖"""
    from server import db_cursor
    return db_cursor

def _get_require_auth():
    from server import require_auth
    return require_auth

# ================================================================
# 数据库初始化
# ================================================================

INIT_SQL = """
-- 试卷表
CREATE TABLE IF NOT EXISTS exam_papers (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    time_limit INTEGER DEFAULT 0,
    pass_score INTEGER DEFAULT 60,
    total_score INTEGER DEFAULT 100,
    status TEXT DEFAULT 'draft',
    grading_mode TEXT DEFAULT 'auto',
    allow_review INTEGER DEFAULT 1,
    shuffle_questions INTEGER DEFAULT 0,
    shuffle_options INTEGER DEFAULT 0
);

-- 题目表（全局题库）
CREATE TABLE IF NOT EXISTS exam_questions (
    id TEXT PRIMARY KEY,
    paper_id TEXT,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    options TEXT DEFAULT '[]',
    correct_answer TEXT DEFAULT '',
    score INTEGER DEFAULT 5,
    order_idx INTEGER DEFAULT 0,
    explanation TEXT DEFAULT '',
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(paper_id) REFERENCES exam_papers(id) ON DELETE CASCADE
);

-- 考试安排表（哪些学生可以参加哪次考试）
CREATE TABLE IF NOT EXISTS exam_sessions (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL,
    title TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    allow_late INTEGER DEFAULT 0,
    scope TEXT DEFAULT 'global',
    class_id INTEGER DEFAULT NULL,
    FOREIGN KEY(paper_id) REFERENCES exam_papers(id) ON DELETE CASCADE
);

-- 考试参与者（允许哪些用户参加）
CREATE TABLE IF NOT EXISTS exam_participants (
    session_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY(session_id, user_id),
    FOREIGN KEY(session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE
);

-- 答卷表
CREATE TABLE IF NOT EXISTS exam_submissions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    paper_id TEXT NOT NULL,
    answers TEXT DEFAULT '{}',
    started_at TEXT NOT NULL,
    submitted_at TEXT,
    total_score INTEGER DEFAULT 0,
    graded_score INTEGER DEFAULT 0,
    auto_score INTEGER DEFAULT 0,
    status TEXT DEFAULT 'in_progress',
    graded_by INTEGER,
    graded_at TEXT,
    feedback TEXT DEFAULT '',
    FOREIGN KEY(session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE
);

-- 人工判分明细（仅针对需要人工评分的题目）
CREATE TABLE IF NOT EXISTS exam_manual_scores (
    submission_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    comment TEXT DEFAULT '',
    graded_by INTEGER NOT NULL,
    graded_at TEXT NOT NULL,
    PRIMARY KEY(submission_id, question_id)
);
"""


def _init_db():
    """初始化考试系统数据库表"""
    db_cursor = _get_db_cursor()
    with db_cursor() as cur:
        for stmt in INIT_SQL.split(";"):
            stmt = stmt.strip()
            if stmt:
                cur.execute(stmt)
        # 兼容旧数据库：添加 scope/class_id 字段
        for col_def in [
            "ALTER TABLE exam_sessions ADD COLUMN scope TEXT DEFAULT 'global'",
            "ALTER TABLE exam_sessions ADD COLUMN class_id INTEGER DEFAULT NULL",
        ]:
            try: cur.execute(col_def)
            except Exception: pass
    print("[ExamPlugin] DB tables initialized.")


# ================================================================
# 自动判卷引擎
# ================================================================

def _auto_grade_answer(q_type: str, correct: str, user_answer: str, score: int, content: str = "") -> tuple[int, str]:
    """
    对单道题自动判分。
    返回 (得分, 说明)
    """
    if not user_answer or user_answer.strip() == "":
        return 0, "未作答"

    if q_type == "single":
        # 单选：完全匹配答案字母（不区分大小写）
        if user_answer.strip().upper() == correct.strip().upper():
            return score, "正确"
        return 0, f"答案应为 {correct}"

    elif q_type == "multi":
        # 多选：所有正确选项完全匹配（排序后比较）
        try:
            correct_set = set(json.loads(correct))
            user_set = set(json.loads(user_answer)) if user_answer.startswith("[") else set(user_answer.split(","))
            if correct_set == user_set:
                return score, "正确"
            elif correct_set & user_set == correct_set:
                return 0, "多选了错误选项"
            elif correct_set & user_set:
                return 0, f"漏选：正确答案为 {sorted(correct_set)}"
            return 0, f"完全错误，正确答案为 {sorted(correct_set)}"
        except Exception:
            return 0, "答案格式错误"

    elif q_type == "judge":
        # 判断题：true/false
        correct_val = correct.strip().lower() in ("true", "1", "正确", "是")
        user_val = user_answer.strip().lower() in ("true", "1", "正确", "是")
        if correct_val == user_val:
            return score, "正确"
        return 0, f"正确答案：{'正确' if correct_val else '错误'}"

    elif q_type == "fill":
        # 填空题：精确匹配（去首尾空格）
        if user_answer.strip() == correct.strip():
            return score, "正确"
        # 宽松匹配（不区分大小写）
        if user_answer.strip().lower() == correct.strip().lower():
            return round(score * 0.9), "基本正确（大小写不同）"
        return 0, f"参考答案：{correct}"

    elif q_type == "code":
        # 代码题：如果 correct_answer 是 JSON 格式测试用例则自动测试，否则人工判卷
        try:
            test_cases = json.loads(correct)
            if not isinstance(test_cases, list):
                return None, "人工判卷"
        except Exception:
            return None, "人工判卷"

        if not test_cases:
            return None, "人工判卷"

        passed = 0
        total = len(test_cases)
        details = []
        for tc in test_cases:
            expected = str(tc.get("expected", "")).strip()
            stdin = tc.get("input", "")
            lang = tc.get("lang", "python")
            try:
                got = _run_code(user_answer, lang, stdin, timeout=5)
                if got.strip() == expected:
                    passed += 1
                    details.append(f"✓ 输入:{repr(stdin)} 期望:{repr(expected)}")
                else:
                    details.append(f"✗ 输入:{repr(stdin)} 期望:{repr(expected)} 实际:{repr(got[:50])}")
            except Exception as e:
                details.append(f"✗ 输入:{repr(stdin)} 运行错误:{str(e)[:50]}")

        got_score = round(score * passed / total)
        detail_text = "\n".join(details)
        return got_score, f"通过 {passed}/{total} 测试用例\n{detail_text}"

    elif q_type == "operation":
        # 实际操作题：始终人工判卷
        return None, "人工判卷"

    return 0, "未知题目类型"


def _run_code(code: str, lang: str = "python", stdin: str = "", timeout: int = 5) -> str:
    """简单代码执行（用于自动判卷）"""
    ext_map = {"python": ".py", "javascript": ".js", "c": ".c", "cpp": ".cpp"}
    ext = ext_map.get(lang, ".py")

    with tempfile.TemporaryDirectory() as tmpdir:
        src = os.path.join(tmpdir, "solution" + ext)
        with open(src, "w", encoding="utf-8") as f:
            f.write(code)

        if lang == "python":
            cmd = [sys.executable, src]
        elif lang == "javascript":
            cmd = ["node", src]
        elif lang in ("c", "cpp"):
            out = os.path.join(tmpdir, "solution")
            compiler = "gcc" if lang == "c" else "g++"
            comp = subprocess.run([compiler, "-o", out, src], capture_output=True, timeout=10)
            if comp.returncode != 0:
                raise RuntimeError(comp.stderr.decode()[:200])
            cmd = [out]
        else:
            raise ValueError(f"不支持的语言: {lang}")

        kw = {}
        if sys.platform == "win32":
            kw["creationflags"] = subprocess.CREATE_NO_WINDOW
        result = subprocess.run(
            cmd, input=stdin, capture_output=True, text=True,
            timeout=timeout, **kw
        )
        return result.stdout


# ================================================================
# 插件注册
# ================================================================

def register(app):
    _init_db()

    from fastapi import Request, HTTPException
    from fastapi.responses import JSONResponse

    require_auth = _get_require_auth()
    db_cursor = _get_db_cursor()

    def ok(data=None, message="success"):
        return {"code": 0, "message": message, "data": data}

    def err(msg, status=400):
        raise HTTPException(status_code=status, detail={"code": 1, "message": msg})

    def now():
        return time.strftime("%Y-%m-%dT%H:%M:%S")

    # ────────────────────────────────────────────────────────────
    # 试卷 CRUD
    # ────────────────────────────────────────────────────────────

    @app.get("/api/exam/papers")
    async def list_papers(request: Request, page: int = 1, page_size: int = 20):
        user = require_auth(request)
        with db_cursor() as cur:
            if user["role"] in ("teacher", "admin"):
                cur.execute(
                    "SELECT ep.*, u.username as creator_name FROM exam_papers ep "
                    "LEFT JOIN users u ON ep.created_by=u.id "
                    "ORDER BY ep.created_at DESC LIMIT ? OFFSET ?",
                    (page_size, (page - 1) * page_size)
                )
            else:
                # 学生只能看到有考试安排且自己有权参加的试卷
                cur.execute(
                    "SELECT DISTINCT ep.*, u.username as creator_name "
                    "FROM exam_papers ep "
                    "JOIN exam_sessions es ON es.paper_id=ep.id "
                    "LEFT JOIN exam_participants epa ON epa.session_id=es.id AND epa.user_id=? "
                    "LEFT JOIN users u ON ep.created_by=u.id "
                    "WHERE (epa.user_id IS NOT NULL OR es.id IS NULL) "
                    "AND ep.status='published' "
                    "ORDER BY ep.created_at DESC LIMIT ? OFFSET ?",
                    (user["id"], page_size, (page - 1) * page_size)
                )
            papers = [dict(r) for r in cur.fetchall()]

            cur.execute("SELECT COUNT(*) FROM exam_papers" if user["role"] in ("teacher", "admin") else
                        "SELECT COUNT(DISTINCT ep.id) FROM exam_papers ep "
                        "JOIN exam_sessions es ON es.paper_id=ep.id "
                        "LEFT JOIN exam_participants epa ON epa.session_id=es.id AND epa.user_id=? "
                        "WHERE ep.status='published'",
                        () if user["role"] in ("teacher", "admin") else (user["id"],))
            total = cur.fetchone()[0]

        return ok({"papers": papers, "total": total, "page": page, "page_size": page_size})

    @app.post("/api/exam/papers")
    async def create_paper(request: Request):
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        body = await request.json()
        pid = str(uuid.uuid4())
        with db_cursor() as cur:
            cur.execute(
                "INSERT INTO exam_papers(id,title,description,created_by,created_at,updated_at,"
                "time_limit,pass_score,total_score,status,grading_mode,allow_review,"
                "shuffle_questions,shuffle_options) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    pid, body.get("title", "未命名试卷"), body.get("description", ""),
                    user["id"], now(), now(),
                    int(body.get("time_limit", 0)), int(body.get("pass_score", 60)),
                    int(body.get("total_score", 100)), "draft",
                    body.get("grading_mode", "auto"),
                    1 if body.get("allow_review", True) else 0,
                    1 if body.get("shuffle_questions", False) else 0,
                    1 if body.get("shuffle_options", False) else 0,
                )
            )
        return ok({"id": pid}, "试卷创建成功")

    @app.get("/api/exam/papers/{paper_id}")
    async def get_paper(paper_id: str, request: Request, with_questions: bool = True):
        user = require_auth(request)
        with db_cursor() as cur:
            cur.execute("SELECT * FROM exam_papers WHERE id=?", (paper_id,))
            paper = cur.fetchone()
            if not paper:
                err("试卷不存在", 404)
            paper = dict(paper)

            if with_questions:
                cur.execute(
                    "SELECT * FROM exam_questions WHERE paper_id=? ORDER BY order_idx, created_at",
                    (paper_id,)
                )
                qs = []
                for q in cur.fetchall():
                    qd = dict(q)
                    try:
                        qd["options"] = json.loads(qd["options"])
                    except Exception:
                        qd["options"] = []
                    # 学生不能看到正确答案（除非允许查看）
                    if user["role"] == "student" and not paper.get("allow_review"):
                        qd.pop("correct_answer", None)
                        qd.pop("explanation", None)
                    qs.append(qd)
                paper["questions"] = qs

        return ok(paper)

    @app.put("/api/exam/papers/{paper_id}")
    async def update_paper(paper_id: str, request: Request):
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        body = await request.json()
        with db_cursor() as cur:
            cur.execute("SELECT * FROM exam_papers WHERE id=?", (paper_id,))
            p = cur.fetchone()
            if not p:
                err("试卷不存在", 404)
            if p["created_by"] != user["id"] and user["role"] != "admin":
                err("只能修改自己的试卷", 403)

            fields = ["title", "description", "time_limit", "pass_score", "total_score",
                      "grading_mode", "allow_review", "shuffle_questions", "shuffle_options"]
            updates = {k: body[k] for k in fields if k in body}
            if "status" in body and body["status"] in ("draft", "published", "closed"):
                updates["status"] = body["status"]
            updates["updated_at"] = now()

            set_clause = ", ".join(f"{k}=?" for k in updates)
            cur.execute(f"UPDATE exam_papers SET {set_clause} WHERE id=?",
                        list(updates.values()) + [paper_id])
        return ok(message="更新成功")

    @app.delete("/api/exam/papers/{paper_id}")
    async def delete_paper(paper_id: str, request: Request):
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        with db_cursor() as cur:
            cur.execute("SELECT * FROM exam_papers WHERE id=?", (paper_id,))
            p = cur.fetchone()
            if not p:
                err("试卷不存在", 404)
            if p["created_by"] != user["id"] and user["role"] != "admin":
                err("只能删除自己的试卷", 403)
            cur.execute("DELETE FROM exam_papers WHERE id=?", (paper_id,))
        return ok(message="删除成功")

    # ────────────────────────────────────────────────────────────
    # 试卷导入 / 导出（JSON 格式）
    # ────────────────────────────────────────────────────────────

    @app.post("/api/exam/papers/import")
    async def import_paper(request: Request):
        """从 JSON 文件内容导入试卷"""
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        body = await request.json()
        paper_data = body.get("paper")
        if not paper_data:
            err("缺少 paper 字段")

        pid = str(uuid.uuid4())
        with db_cursor() as cur:
            cur.execute(
                "INSERT INTO exam_papers(id,title,description,created_by,created_at,updated_at,"
                "time_limit,pass_score,total_score,status,grading_mode,allow_review,"
                "shuffle_questions,shuffle_options) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    pid, paper_data.get("title", "导入的试卷"),
                    paper_data.get("description", ""), user["id"], now(), now(),
                    int(paper_data.get("time_limit", 0)),
                    int(paper_data.get("pass_score", 60)),
                    int(paper_data.get("total_score", 100)),
                    "draft",
                    paper_data.get("grading_mode", "auto"),
                    1 if paper_data.get("allow_review", True) else 0,
                    1 if paper_data.get("shuffle_questions", False) else 0,
                    1 if paper_data.get("shuffle_options", False) else 0,
                )
            )
            for idx, q in enumerate(paper_data.get("questions", [])):
                qid = str(uuid.uuid4())
                cur.execute(
                    "INSERT INTO exam_questions(id,paper_id,type,content,options,correct_answer,"
                    "score,order_idx,explanation,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        qid, pid,
                        q.get("type", "single"), q.get("content", ""),
                        json.dumps(q.get("options", []), ensure_ascii=False),
                        str(q.get("correct_answer", "")),
                        int(q.get("score", 5)), idx,
                        q.get("explanation", ""),
                        user["id"], now()
                    )
                )
        return ok({"id": pid}, "导入成功")

    @app.get("/api/exam/papers/{paper_id}/export")
    async def export_paper(paper_id: str, request: Request):
        """导出试卷为 JSON"""
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        with db_cursor() as cur:
            cur.execute("SELECT * FROM exam_papers WHERE id=?", (paper_id,))
            p = cur.fetchone()
            if not p:
                err("试卷不存在", 404)
            paper = dict(p)

            cur.execute("SELECT * FROM exam_questions WHERE paper_id=? ORDER BY order_idx", (paper_id,))
            qs = []
            for q in cur.fetchall():
                qd = dict(q)
                try:
                    qd["options"] = json.loads(qd["options"])
                except Exception:
                    qd["options"] = []
                qs.append(qd)
            paper["questions"] = qs

        paper.pop("id", None)
        paper.pop("created_by", None)
        paper.pop("created_at", None)
        paper.pop("updated_at", None)
        return ok(paper)

    # ────────────────────────────────────────────────────────────
    # 题目 CRUD
    # ────────────────────────────────────────────────────────────

    @app.post("/api/exam/papers/{paper_id}/questions")
    async def add_question(paper_id: str, request: Request):
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        body = await request.json()
        q_type = body.get("type", "single")
        if q_type not in ("single", "multi", "judge", "fill", "code", "operation"):
            err("不支持的题目类型")

        with db_cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM exam_questions WHERE paper_id=?", (paper_id,))
            idx = cur.fetchone()[0]
            qid = str(uuid.uuid4())
            cur.execute(
                "INSERT INTO exam_questions(id,paper_id,type,content,options,correct_answer,"
                "score,order_idx,explanation,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (
                    qid, paper_id, q_type,
                    body.get("content", ""),
                    json.dumps(body.get("options", []), ensure_ascii=False),
                    str(body.get("correct_answer", "")),
                    int(body.get("score", 5)), idx,
                    body.get("explanation", ""),
                    user["id"], now()
                )
            )
        return ok({"id": qid}, "题目添加成功")

    @app.put("/api/exam/questions/{question_id}")
    async def update_question(question_id: str, request: Request):
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        body = await request.json()
        with db_cursor() as cur:
            cur.execute("SELECT * FROM exam_questions WHERE id=?", (question_id,))
            q = cur.fetchone()
            if not q:
                err("题目不存在", 404)

            fields = ["content", "options", "correct_answer", "score", "order_idx", "explanation", "type"]
            updates = {}
            for k in fields:
                if k in body:
                    updates[k] = json.dumps(body[k], ensure_ascii=False) if k == "options" else body[k]
            if not updates:
                err("无需更新")

            set_clause = ", ".join(f"{k}=?" for k in updates)
            cur.execute(f"UPDATE exam_questions SET {set_clause} WHERE id=?",
                        list(updates.values()) + [question_id])
        return ok(message="更新成功")

    @app.delete("/api/exam/questions/{question_id}")
    async def delete_question(question_id: str, request: Request):
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        with db_cursor() as cur:
            cur.execute("DELETE FROM exam_questions WHERE id=?", (question_id,))
        return ok(message="删除成功")

    @app.put("/api/exam/papers/{paper_id}/questions/reorder")
    async def reorder_questions(paper_id: str, request: Request):
        """批量更新题目顺序"""
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        body = await request.json()
        order = body.get("order", [])  # list of question ids
        with db_cursor() as cur:
            for idx, qid in enumerate(order):
                cur.execute("UPDATE exam_questions SET order_idx=? WHERE id=? AND paper_id=?",
                            (idx, qid, paper_id))
        return ok(message="排序更新成功")

    # ────────────────────────────────────────────────────────────
    # 考试安排（Session）
    # ────────────────────────────────────────────────────────────

    @app.get("/api/exam/sessions")
    async def list_sessions(request: Request, paper_id: str = None):
        user = require_auth(request)
        with db_cursor() as cur:
            if user["role"] in ("teacher", "admin"):
                if paper_id:
                    cur.execute(
                        "SELECT es.*, ep.title as paper_title, u.username as creator_name "
                        "FROM exam_sessions es "
                        "JOIN exam_papers ep ON es.paper_id=ep.id "
                        "LEFT JOIN users u ON es.created_by=u.id "
                        "WHERE es.paper_id=? ORDER BY es.created_at DESC", (paper_id,)
                    )
                else:
                    cur.execute(
                        "SELECT es.*, ep.title as paper_title, u.username as creator_name "
                        "FROM exam_sessions es "
                        "JOIN exam_papers ep ON es.paper_id=ep.id "
                        "LEFT JOIN users u ON es.created_by=u.id "
                        "ORDER BY es.created_at DESC"
                    )
            else:
                # 学生：全局考试 + 自己班级的考试 + 手动添加了自己的考试
                cur.execute(
                    "SELECT es.*, ep.title as paper_title, u.username as creator_name, "
                    "sub.id as my_submission_id, sub.status as my_status, sub.graded_score as my_score "
                    "FROM exam_sessions es "
                    "JOIN exam_papers ep ON es.paper_id=ep.id "
                    "LEFT JOIN users u ON es.created_by=u.id "
                    "LEFT JOIN exam_participants epa ON epa.session_id=es.id AND epa.user_id=? "
                    "LEFT JOIN exam_submissions sub ON sub.session_id=es.id AND sub.user_id=? "
                    "LEFT JOIN classes cl ON es.class_id=cl.id "
                    "WHERE (es.scope='global' "
                    "       OR (es.scope='class' AND cl.name=(SELECT class_name FROM users WHERE id=?)) "
                    "       OR (es.scope='personal' AND es.created_by=?) "
                    "       OR epa.user_id IS NOT NULL) "
                    "ORDER BY es.start_time DESC",
                    (user["id"], user["id"], user["id"], user["id"])
                )
            sessions = [dict(r) for r in cur.fetchall()]
            # 为教师添加待批改数量
            if user["role"] in ("teacher", "admin"):
                for s in sessions:
                    cur.execute(
                        "SELECT COUNT(*) as cnt FROM exam_submissions WHERE session_id=? AND status='submitted'",
                        (s["id"],)
                    )
                    row = cur.fetchone()
                    s["pending_grade_count"] = row["cnt"] if row else 0
        return ok({"sessions": sessions})

    @app.post("/api/exam/sessions")
    async def create_session(request: Request):
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        body = await request.json()
        sid = str(uuid.uuid4())
        scope = body.get("scope", "global")
        if scope not in ("global", "class", "personal"): scope = "global"
        class_id = body.get("class_id") or None
        with db_cursor() as cur:
            cur.execute(
                "INSERT INTO exam_sessions(id,paper_id,title,start_time,end_time,created_by,"
                "created_at,status,allow_late,scope,class_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (
                    sid,
                    body.get("paper_id"),
                    body.get("title", "考试"),
                    body.get("start_time"),
                    body.get("end_time"),
                    user["id"], now(),
                    body.get("status", "pending"),
                    1 if body.get("allow_late", False) else 0,
                    scope, class_id,
                )
            )
            # 如果是班级范围，自动加入该班级学生
            if scope == "class" and class_id:
                cur.execute("SELECT id FROM users WHERE class_name=(SELECT name FROM classes WHERE id=?) AND status=1 AND role='student'", (class_id,))
                for row in cur.fetchall():
                    cur.execute("INSERT OR IGNORE INTO exam_participants(session_id,user_id) VALUES(?,?)",
                                (sid, row["id"]))
            else:
                # 添加手动指定的参与者
                for uid in body.get("participant_ids", []):
                    cur.execute("INSERT OR IGNORE INTO exam_participants(session_id,user_id) VALUES(?,?)",
                                (sid, uid))
        return ok({"id": sid}, "考试安排创建成功")

    @app.put("/api/exam/sessions/{session_id}")
    async def update_session(session_id: str, request: Request):
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        body = await request.json()
        with db_cursor() as cur:
            fields = ["title", "start_time", "end_time", "status", "allow_late", "scope", "class_id"]
            updates = {k: body[k] for k in fields if k in body}
            if not updates:
                err("无需更新")
            set_clause = ", ".join(f"{k}=?" for k in updates)
            cur.execute(f"UPDATE exam_sessions SET {set_clause} WHERE id=?",
                        list(updates.values()) + [session_id])
        return ok(message="更新成功")

    @app.delete("/api/exam/sessions/{session_id}")
    async def delete_session(session_id: str, request: Request):
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        with db_cursor() as cur:
            cur.execute("DELETE FROM exam_sessions WHERE id=?", (session_id,))
        return ok(message="删除成功")

    # ────────────────────────────────────────────────────────────
    # 答题（学生）
    # ────────────────────────────────────────────────────────────

    @app.post("/api/exam/sessions/{session_id}/start")
    async def start_exam(session_id: str, request: Request):
        """学生开始考试，创建答卷"""
        user = require_auth(request)
        with db_cursor() as cur:
            cur.execute("SELECT * FROM exam_sessions WHERE id=?", (session_id,))
            session = cur.fetchone()
            if not session:
                err("考试不存在", 404)
            session = dict(session)

            # 检查时间
            n = now()
            if session["start_time"] and n < session["start_time"]:
                err("考试尚未开始")
            if session["end_time"] and n > session["end_time"] and not session["allow_late"]:
                err("考试已结束")
            if session["status"] == "pending":
                err("考试尚未开放")
            if session["status"] == "closed":
                err("考试已关闭")

            # 检查是否已有答卷
            cur.execute(
                "SELECT * FROM exam_submissions WHERE session_id=? AND user_id=?",
                (session_id, user["id"])
            )
            existing = cur.fetchone()
            if existing:
                return ok({"submission_id": existing["id"], "already_started": True})

            # 创建答卷
            sub_id = str(uuid.uuid4())
            cur.execute(
                "INSERT INTO exam_submissions(id,session_id,user_id,paper_id,answers,"
                "started_at,status) VALUES(?,?,?,?,?,?,?)",
                (sub_id, session_id, user["id"], session["paper_id"], "{}", n, "in_progress")
            )
        return ok({"submission_id": sub_id, "already_started": False}, "考试已开始")

    @app.put("/api/exam/submissions/{submission_id}/save")
    async def save_answers(submission_id: str, request: Request):
        """保存答题进度（不提交）"""
        user = require_auth(request)
        body = await request.json()
        with db_cursor() as cur:
            cur.execute("SELECT * FROM exam_submissions WHERE id=? AND user_id=?",
                        (submission_id, user["id"]))
            sub = cur.fetchone()
            if not sub:
                err("答卷不存在", 404)
            if sub["status"] != "in_progress":
                err("答卷已提交")

            answers = json.dumps(body.get("answers", {}), ensure_ascii=False)
            cur.execute("UPDATE exam_submissions SET answers=? WHERE id=?",
                        (answers, submission_id))
        return ok(message="保存成功")

    @app.post("/api/exam/submissions/{submission_id}/submit")
    async def submit_exam(submission_id: str, request: Request):
        """提交答卷并自动判卷"""
        user = require_auth(request)
        body = await request.json()
        with db_cursor() as cur:
            cur.execute("SELECT * FROM exam_submissions WHERE id=? AND user_id=?",
                        (submission_id, user["id"]))
            sub = cur.fetchone()
            if not sub:
                err("答卷不存在", 404)
            if sub["status"] != "in_progress":
                err("答卷已提交，不能重复提交")

            # 保存最终答案
            final_answers = body.get("answers", json.loads(sub["answers"]))
            final_answers_str = json.dumps(final_answers, ensure_ascii=False)

            # 获取试卷所有题目
            cur.execute(
                "SELECT * FROM exam_questions WHERE paper_id=? ORDER BY order_idx",
                (sub["paper_id"],)
            )
            questions = [dict(q) for q in cur.fetchall()]

            # 自动判卷
            auto_total = 0
            needs_manual = []
            for q in questions:
                user_ans = str(final_answers.get(q["id"], ""))
                result_score, comment = _auto_grade_answer(
                    q["type"], q["correct_answer"], user_ans, q["score"], q["content"]
                )
                if result_score is None:
                    needs_manual.append(q["id"])
                else:
                    auto_total += result_score

            status = "submitted" if needs_manual else "graded"
            graded_score = auto_total if not needs_manual else 0

            cur.execute(
                "UPDATE exam_submissions SET answers=?, submitted_at=?, status=?, "
                "auto_score=?, graded_score=? WHERE id=?",
                (final_answers_str, now(), status, auto_total, graded_score, submission_id)
            )

        return ok({
            "auto_score": auto_total,
            "needs_manual_grading": needs_manual,
            "status": status,
            "message": "提交成功，等待人工判卷" if needs_manual else "提交成功，自动判卷完成"
        })

    @app.get("/api/exam/submissions/{submission_id}")
    async def get_submission(submission_id: str, request: Request):
        """获取答卷详情（学生查看自己的，教师/管理员查看所有）"""
        user = require_auth(request)
        with db_cursor() as cur:
            if user["role"] in ("teacher", "admin"):
                cur.execute("SELECT * FROM exam_submissions WHERE id=?", (submission_id,))
            else:
                cur.execute("SELECT * FROM exam_submissions WHERE id=? AND user_id=?",
                            (submission_id, user["id"]))
            sub = cur.fetchone()
            if not sub:
                err("答卷不存在", 404)
            sub = dict(sub)
            try:
                sub["answers"] = json.loads(sub["answers"])
            except Exception:
                sub["answers"] = {}

            # 获取试卷题目（带正确答案）
            show_answer = (user["role"] in ("teacher", "admin")) or sub["status"] == "graded"
            cur.execute(
                "SELECT * FROM exam_questions WHERE paper_id=? ORDER BY order_idx",
                (sub["paper_id"],)
            )
            qs = []
            total_auto = 0
            for q in cur.fetchall():
                qd = dict(q)
                try:
                    qd["options"] = json.loads(qd["options"])
                except Exception:
                    qd["options"] = []
                user_ans = str(sub["answers"].get(qd["id"], ""))
                # 计算本题自动得分
                grade_score, grade_comment = _auto_grade_answer(
                    qd["type"], qd["correct_answer"], user_ans, qd["score"], qd["content"]
                )
                qd["user_answer"] = user_ans
                qd["auto_grade"] = grade_score
                qd["grade_comment"] = grade_comment
                if grade_score is not None:
                    total_auto += grade_score

                # 人工分数
                cur.execute(
                    "SELECT * FROM exam_manual_scores WHERE submission_id=? AND question_id=?",
                    (submission_id, qd["id"])
                )
                ms = cur.fetchone()
                qd["manual_score"] = dict(ms) if ms else None

                if not show_answer:
                    qd.pop("correct_answer", None)
                    qd.pop("explanation", None)
                qs.append(qd)

            sub["questions"] = qs
            sub["calculated_auto_score"] = total_auto

        return ok(sub)

    # ────────────────────────────────────────────────────────────
    # 人工判卷
    # ────────────────────────────────────────────────────────────

    @app.get("/api/exam/sessions/{session_id}/submissions")
    async def list_session_submissions(session_id: str, request: Request):
        """教师查看某次考试的所有答卷"""
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        with db_cursor() as cur:
            cur.execute(
                "SELECT es.*, u.username, u.nickname AS real_name "
                "FROM exam_submissions es "
                "JOIN users u ON es.user_id=u.id "
                "WHERE es.session_id=? "
                "ORDER BY es.submitted_at DESC",
                (session_id,)
            )
            subs = [dict(r) for r in cur.fetchall()]
        return ok({"submissions": subs})

    @app.post("/api/exam/submissions/{submission_id}/grade")
    async def grade_submission(submission_id: str, request: Request):
        """人工判卷：逐题打分"""
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        body = await request.json()
        scores = body.get("scores", {})   # {question_id: {score, comment}}
        feedback = body.get("feedback", "")

        with db_cursor() as cur:
            cur.execute("SELECT * FROM exam_submissions WHERE id=?", (submission_id,))
            sub = cur.fetchone()
            if not sub:
                err("答卷不存在", 404)

            # 获取自动分数
            sub = dict(sub)
            try:
                answers = json.loads(sub["answers"])
            except Exception:
                answers = {}

            cur.execute(
                "SELECT * FROM exam_questions WHERE paper_id=? ORDER BY order_idx",
                (sub["paper_id"],)
            )
            questions = [dict(q) for q in cur.fetchall()]

            auto_total = 0
            manual_total = 0

            for q in questions:
                user_ans = str(answers.get(q["id"], ""))
                grade_score, _ = _auto_grade_answer(
                    q["type"], q["correct_answer"], user_ans, q["score"], q["content"]
                )

                if q["id"] in scores:
                    # 人工打分
                    s = min(int(scores[q["id"]].get("score", 0)), q["score"])
                    c = scores[q["id"]].get("comment", "")
                    cur.execute(
                        "INSERT OR REPLACE INTO exam_manual_scores"
                        "(submission_id,question_id,score,comment,graded_by,graded_at) "
                        "VALUES(?,?,?,?,?,?)",
                        (submission_id, q["id"], s, c, user["id"], now())
                    )
                    manual_total += s
                elif grade_score is not None:
                    auto_total += grade_score
                else:
                    # 人工题未打分，查历史
                    cur.execute(
                        "SELECT score FROM exam_manual_scores WHERE submission_id=? AND question_id=?",
                        (submission_id, q["id"])
                    )
                    existing = cur.fetchone()
                    if existing:
                        manual_total += existing["score"]

            total = auto_total + manual_total
            cur.execute(
                "UPDATE exam_submissions SET graded_score=?, auto_score=?, status='graded', "
                "graded_by=?, graded_at=?, feedback=? WHERE id=?",
                (total, auto_total, user["id"], now(), feedback, submission_id)
            )

        return ok({"total_score": total}, "判卷完成")

    @app.post("/api/exam/submissions/{submission_id}/batch_grade")
    async def batch_auto_grade(submission_id: str, request: Request):
        """对可自动判卷的题目重新跑一遍自动判卷"""
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        with db_cursor() as cur:
            cur.execute("SELECT * FROM exam_submissions WHERE id=?", (submission_id,))
            sub = cur.fetchone()
            if not sub:
                err("答卷不存在", 404)
            sub = dict(sub)
            try:
                answers = json.loads(sub["answers"])
            except Exception:
                answers = {}

            cur.execute(
                "SELECT * FROM exam_questions WHERE paper_id=? ORDER BY order_idx",
                (sub["paper_id"],)
            )
            questions = [dict(q) for q in cur.fetchall()]

            auto_total = 0
            for q in questions:
                user_ans = str(answers.get(q["id"], ""))
                grade_score, _ = _auto_grade_answer(
                    q["type"], q["correct_answer"], user_ans, q["score"]
                )
                if grade_score is not None:
                    auto_total += grade_score

            cur.execute(
                "UPDATE exam_submissions SET auto_score=? WHERE id=?",
                (auto_total, submission_id)
            )

        return ok({"auto_score": auto_total}, "自动判卷完成")

    # ────────────────────────────────────────────────────────────
    # 成绩统计
    # ────────────────────────────────────────────────────────────

    @app.get("/api/exam/sessions/{session_id}/stats")
    async def session_stats(session_id: str, request: Request):
        user = require_auth(request)
        if user["role"] not in ("teacher", "admin"):
            err("无权限", 403)
        with db_cursor() as cur:
            cur.execute(
                "SELECT graded_score, auto_score, status FROM exam_submissions "
                "WHERE session_id=? AND status IN ('submitted','graded')",
                (session_id,)
            )
            rows = cur.fetchall()
            if not rows:
                return ok({"count": 0, "avg": 0, "max": 0, "min": 0, "pass_rate": 0,
                           "distribution": [], "graded_count": 0})

            scores = [r["graded_score"] for r in rows if r["status"] == "graded"]
            pending = [r for r in rows if r["status"] == "submitted"]

            cur.execute("SELECT pass_score FROM exam_papers WHERE id=("
                        "SELECT paper_id FROM exam_sessions WHERE id=?)", (session_id,))
            paper = cur.fetchone()
            pass_score = paper["pass_score"] if paper else 60

            if scores:
                avg_score = round(sum(scores) / len(scores), 1)
                max_score = max(scores)
                min_score = min(scores)
                pass_count = sum(1 for s in scores if s >= pass_score)
                pass_rate = round(pass_count / len(scores) * 100, 1)

                # 分数段分布
                buckets = [0] * 10  # 0-10, 10-20, ..., 90-100
                for s in scores:
                    idx = min(int(s / 10), 9)
                    buckets[idx] += 1
                distribution = [{"range": f"{i*10}-{i*10+10}", "count": c}
                                 for i, c in enumerate(buckets)]
            else:
                avg_score = max_score = min_score = pass_rate = 0
                distribution = []

        return ok({
            "count": len(rows),
            "graded_count": len(scores),
            "pending_count": len(pending),
            "avg": avg_score,
            "max": max_score if scores else 0,
            "min": min_score if scores else 0,
            "pass_rate": pass_rate if scores else 0,
            "distribution": distribution,
        })

    @app.get("/api/exam/my-results")
    async def my_results(request: Request):
        """学生查看自己所有考试成绩"""
        user = require_auth(request)
        with db_cursor() as cur:
            cur.execute(
                "SELECT sub.*, ses.title as session_title, ep.title as paper_title, "
                "ep.pass_score, ep.total_score "
                "FROM exam_submissions sub "
                "JOIN exam_sessions ses ON sub.session_id=ses.id "
                "JOIN exam_papers ep ON sub.paper_id=ep.id "
                "WHERE sub.user_id=? ORDER BY sub.submitted_at DESC",
                (user["id"],)
            )
            results = [dict(r) for r in cur.fetchall()]
        return ok({"results": results})

    print("[ExamPlugin] OK: registered exam-system routes")
    print("[ExamPlugin]   试卷管理: GET/POST /api/exam/papers")
    print("[ExamPlugin]   考试安排: GET/POST /api/exam/sessions")
    print("[ExamPlugin]   答题接口: POST /api/exam/sessions/:id/start")
    print("[ExamPlugin]   提交判卷: POST /api/exam/submissions/:id/submit")
    print("[ExamPlugin]   人工判卷: POST /api/exam/submissions/:id/grade")
    print("[ExamPlugin]   成绩统计: GET  /api/exam/sessions/:id/stats")
