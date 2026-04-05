"""
Code Classroom - Pure Python Backend Server
FastAPI + SQLite + built-in queue + subprocess sandbox
No Docker, no Redis, no MySQL, no Nginx needed.
Just: pip install fastapi uvicorn python-multipart && python server.py
"""

import os
import sys
import json
import time
import uuid
import hashlib
import hmac
import base64
import sqlite3
import shutil
import threading

_alloc_lock = threading.Lock()   # 全局 ID 分配互斥锁，供 _alloc_id() 使用
import subprocess
import tempfile
import traceback
import importlib.util
from datetime import datetime
from pathlib import Path
from contextlib import contextmanager
from functools import wraps
from collections import deque
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ================================================================
# CONFIG
# ================================================================
BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "data" / "classroom.db"
STATIC_DIR = BASE_DIR / "frontend"
UPLOAD_DIR = BASE_DIR / "uploads"
NETDISK_DIR = BASE_DIR / "netdisk"
PLUGIN_DIR = BASE_DIR / "plugins"
LEARNING_DIR = BASE_DIR / "learning"   # 学习中心资源目录
JWT_SECRET = os.getenv("JWT_SECRET", "code_classroom_secret_2024_change_me")
JWT_EXPIRE = 86400 * 7  # 7 days

# Supported languages and their run commands
LANG_CONFIG = {
    "python": {"ext": ".py", "cmd": ["python", "-u"], "check": "python --version"},
    "javascript": {"ext": ".js", "cmd": ["node"], "check": "node --version"},
    "c": {"ext": ".c", "compile": ["gcc", "-o", "{out}", "{src}", "-lm", "-O2"], "run": ["{out}"], "check": "gcc --version"},
    "cpp": {"ext": ".cpp", "compile": ["g++", "-o", "{out}", "{src}", "-lm", "-O2"], "run": ["{out}"], "check": "g++ --version"},
}

AVATAR_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f43f5e","#f97316","#eab308","#22c55e","#14b8a6","#06b6d4","#3b82f6"]

# Ensure directories exist
for _d in (UPLOAD_DIR, NETDISK_DIR, PLUGIN_DIR, LEARNING_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ================================================================
# DATABASE
# ================================================================
def get_db():
    """Get a thread-local database connection."""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

@contextmanager
def db_cursor():
    conn = get_db()
    try:
        cursor = conn.cursor()
        yield cursor
        conn.commit()
    finally:
        conn.close()

def init_db():
    """Initialize database tables and seed data."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    c = conn.cursor()

    # -- Users --
    c.execute("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'student',
        avatar TEXT DEFAULT NULL,
        nickname TEXT DEFAULT NULL,
        student_number TEXT DEFAULT NULL,
        class_name TEXT DEFAULT NULL,
        status INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )""")

    # -- Courses --
    c.execute("""CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT NULL,
        teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status INTEGER NOT NULL DEFAULT 1,
        enroll_password TEXT DEFAULT NULL,
        learning_folder TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )""")
    # 兼容旧数据库：添加新字段（如果已存在则忽略）
    for col_def in [
        "ALTER TABLE courses ADD COLUMN enroll_password TEXT DEFAULT NULL",
        "ALTER TABLE courses ADD COLUMN learning_folder TEXT DEFAULT NULL",
    ]:
        try: c.execute(col_def)
        except Exception: pass

    # -- Course Enrollments --
    c.execute("""CREATE TABLE IF NOT EXISTS course_enrollments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        enrolled_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        UNIQUE(course_id, student_id)
    )""")

    # -- Categories --
    c.execute("""CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0
    )""")
    c.executemany("INSERT OR IGNORE INTO categories(id,name,sort_order) VALUES(?,?,?)", [
        (1,"输入输出",1),(2,"条件判断",2),(3,"循环结构",3),(4,"函数",4),
        (5,"字符串",5),(6,"列表/数组",6),(7,"字典/映射",7),(8,"面向对象",8),(9,"算法",9),(10,"综合练习",10),
    ])

    # -- Exercises --
    c.execute("""CREATE TABLE IF NOT EXISTS exercises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER DEFAULT NULL REFERENCES courses(id) ON DELETE SET NULL,
        category_id INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        difficulty TEXT NOT NULL DEFAULT 'easy',
        language TEXT NOT NULL DEFAULT 'python',
        template_code TEXT DEFAULT NULL,
        test_cases TEXT DEFAULT NULL,
        reference_code TEXT DEFAULT NULL,
        check_code INTEGER NOT NULL DEFAULT 0,
        time_limit INTEGER NOT NULL DEFAULT 10,
        memory_limit INTEGER NOT NULL DEFAULT 256,
        sort_order INTEGER NOT NULL DEFAULT 0,
        status INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )""")
    # 兼容旧数据库：添加新字段
    for col_def in [
        "ALTER TABLE exercises ADD COLUMN reference_code TEXT DEFAULT NULL",
        "ALTER TABLE exercises ADD COLUMN check_code INTEGER NOT NULL DEFAULT 0",
    ]:
        try: c.execute(col_def)
        except Exception: pass

    # -- Code Pool --
    c.execute("""CREATE TABLE IF NOT EXISTS code_pool (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        exercise_id INTEGER DEFAULT NULL REFERENCES exercises(id) ON DELETE SET NULL,
        title TEXT NOT NULL DEFAULT 'Untitled',
        language TEXT NOT NULL DEFAULT 'python',
        code TEXT NOT NULL,
        is_saved INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )""")

    # -- Submissions --
    c.execute("""CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        language TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        stdout TEXT DEFAULT NULL,
        stderr TEXT DEFAULT NULL,
        exit_code INTEGER DEFAULT NULL,
        execution_time INTEGER DEFAULT NULL,
        memory_used INTEGER DEFAULT NULL,
        test_results TEXT DEFAULT NULL,
        score INTEGER DEFAULT NULL,
        submitted_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        executed_at TEXT DEFAULT NULL
    )""")

    # -- Announcements --
    c.execute("""CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER DEFAULT NULL,
        author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )""")

    # -- Classes (班级) --
    c.execute("""CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT NULL,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )""")

    # -- Discussions (班级讨论区) --
    c.execute("""CREATE TABLE IF NOT EXISTS discussions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '综合讨论',
        description TEXT DEFAULT NULL,
        scope TEXT NOT NULL DEFAULT 'global',
        class_id INTEGER DEFAULT NULL REFERENCES classes(id) ON DELETE SET NULL,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )""")
    # 兼容旧数据库
    for col_def in [
        "ALTER TABLE discussions ADD COLUMN scope TEXT NOT NULL DEFAULT 'global'",
        "ALTER TABLE discussions ADD COLUMN class_id INTEGER DEFAULT NULL",
    ]:
        try: c.execute(col_def)
        except Exception: pass

    c.execute("""CREATE TABLE IF NOT EXISTS discussion_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member',
        muted INTEGER NOT NULL DEFAULT 0,
        joined_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        UNIQUE(discussion_id, user_id)
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS discussion_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        file_id INTEGER DEFAULT NULL REFERENCES discussion_files(id) ON DELETE SET NULL,
        parent_id INTEGER DEFAULT NULL REFERENCES discussion_posts(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS discussion_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
        uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        file_path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )""")

    # -- Netdisk (班级网盘) --
    c.execute("""CREATE TABLE IF NOT EXISTS netdisk_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT NULL,
        discussion_id INTEGER DEFAULT NULL REFERENCES discussions(id) ON DELETE CASCADE,
        class_id INTEGER DEFAULT NULL REFERENCES classes(id) ON DELETE SET NULL,
        scope TEXT NOT NULL DEFAULT 'global',
        max_size INTEGER NOT NULL DEFAULT 209715200,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )""")
    # 兼容旧数据库
    for col_def in [
        "ALTER TABLE netdisk_folders ADD COLUMN class_id INTEGER DEFAULT NULL",
        "ALTER TABLE netdisk_folders ADD COLUMN scope TEXT NOT NULL DEFAULT 'global'",
    ]:
        try: c.execute(col_def)
        except Exception: pass

    c.execute("""CREATE TABLE IF NOT EXISTS netdisk_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id INTEGER NOT NULL REFERENCES netdisk_folders(id) ON DELETE CASCADE,
        uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        file_path TEXT NOT NULL,
        download_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )""")

    # -- Tasks (任务系统) --
    c.execute("""CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER DEFAULT NULL REFERENCES courses(id) ON DELETE CASCADE,
        class_id INTEGER DEFAULT NULL REFERENCES classes(id) ON DELETE SET NULL,
        scope TEXT NOT NULL DEFAULT 'global',
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        deadline TEXT DEFAULT NULL,
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )""")
    # 兼容旧数据库
    for col_def in [
        "ALTER TABLE tasks ADD COLUMN class_id INTEGER DEFAULT NULL",
        "ALTER TABLE tasks ADD COLUMN scope TEXT NOT NULL DEFAULT 'global'",
    ]:
        try: c.execute(col_def)
        except Exception: pass

    c.execute("""CREATE TABLE IF NOT EXISTS task_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT DEFAULT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        score INTEGER DEFAULT NULL,
        feedback TEXT DEFAULT NULL,
        submitted_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        graded_at TEXT DEFAULT NULL,
        UNIQUE(task_id, student_id)
    )""")

    # -- System Settings --
    c.execute("""CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )""")
    # Set default site name
    c.execute("INSERT OR IGNORE INTO system_settings(key,value) VALUES('site_name','Code Classroom')")
    c.execute("INSERT OR IGNORE INTO system_settings(key,value) VALUES('register_enabled','1')")
    c.execute("INSERT OR IGNORE INTO system_settings(key,value) VALUES('site_description','在线编程学习平台')")
    c.execute("INSERT OR IGNORE INTO system_settings(key,value) VALUES('default_netdisk_quota','209715200')")

    # -- Blog Posts (博客文章) --
    c.execute("""CREATE TABLE IF NOT EXISTS blog_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        summary TEXT DEFAULT '',
        cover_image TEXT DEFAULT NULL,
        author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
        view_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        published_at TEXT DEFAULT NULL
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS blog_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        blog_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
        uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        file_path TEXT NOT NULL,
        mime_type TEXT DEFAULT 'application/octet-stream',
        download_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )""")

    conn.commit()

    # -- Seed data (only if users table is empty) --
    c.execute("SELECT COUNT(*) FROM users")
    if c.fetchone()[0] == 0:
        seed_db(conn)
        print("[DB] Seed data inserted.")

    conn.close()
    print(f"[DB] Database ready at {DB_PATH}")


def _alloc_id(table: str, cursor) -> int:
    """获取下一个可用 ID（线程安全）：优先回收已软删除行的旧 ID。

    策略：
    1. 找 status=0（软删除）的最小 id，物理删除该行后返回此 id；
    2. 若无 deleted 行，则取 MAX(id)+1 分配新 ID。
    """
    with _alloc_lock:
        # 1) 尝试回收一个已删除的 ID
        cursor.execute(f"SELECT MIN(id) FROM {table} WHERE status=0")
        row = cursor.fetchone()
        if row and row[0] is not None:
            recycled = row[0]
            # 物理删除该软删除行，释放 id 供 INSERT 使用
            cursor.execute(f"DELETE FROM {table} WHERE id=? AND status=0", (recycled,))
            return recycled

        # 2) 无可回收 ID，分配新的
        cursor.execute(f"SELECT COALESCE(MAX(id),0) FROM {table}")
        row = cursor.fetchone()
        return (row[0] or 0) + 1


def _hash_password(password: str) -> str:
    """Simple password hash (SHA256 + salt). Good enough for a teaching platform."""
    salt = uuid.uuid4().hex[:16]
    h = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}${h}"

def _verify_password(password: str, stored: str) -> bool:
    salt, h = stored.split("$", 1)
    return hashlib.sha256((salt + password).encode()).hexdigest() == h

def seed_db(conn):
    c = conn.cursor()
    pw = _hash_password("password123")

    # Users
    users = [
        (1, "admin", "admin@classroom.edu", pw, "admin", "#ef4444", "系统管理员", None, None),
        (2, "teacher_wang", "wang@classroom.edu", pw, "teacher", "#3b82f6", "王老师", None, None),
        (3, "teacher_li", "li@classroom.edu", pw, "teacher", "#22c55e", "李老师", None, None),
        (4, "student_zhang", "zhang@stu.edu", pw, "student", "#6366f1", "小张", "2024001", "CS2401"),
        (5, "student_liu", "liu@stu.edu", pw, "student", "#8b5cf6", "小刘", "2024002", "CS2401"),
        (6, "student_chen", "chen@stu.edu", pw, "student", "#ec4899", "小陈", "2024003", "CS2402"),
        (7, "student_zhao", "zhao@stu.edu", pw, "student", "#f97316", "小赵", "2024004", "CS2402"),
        (8, "student_sun", "sun@stu.edu", pw, "student", "#14b8a6", "小孙", "2024005", "SE2401"),
    ]
    c.executemany("INSERT INTO users(id,username,email,password,role,avatar,nickname,student_number,class_name) VALUES(?,?,?,?,?,?,?,?,?)", users)

    # Courses
    courses = [
        (1, "Python 基础入门", "从零学习 Python：语法、数据结构、函数与面向对象编程", 2),
        (2, "Web 前端开发", "HTML、CSS、JavaScript 基础，网页开发入门", 3),
        (3, "JavaScript 进阶", "异步编程、ES6+ 新特性、模块化开发", 2),
    ]
    c.executemany("INSERT INTO courses(id,name,description,teacher_id) VALUES(?,?,?,?)", courses)

    # Enrollments
    enrollments = [(1,4),(1,5),(1,6),(1,7),(2,4),(2,5),(2,8),(3,6),(3,7),(3,8)]
    c.executemany("INSERT INTO course_enrollments(course_id,student_id) VALUES(?,?)", enrollments)

    # Discussions
    discussions = [
        ("CS2401 班级讨论区", "计算机 2401 班同学交流讨论", 1),
        ("CS2402 班级讨论区", "计算机 2402 班同学交流讨论", 1),
        ("SE2401 班级讨论区", "软件工程 2401 班同学交流讨论", 1),
    ]
    c.executemany("INSERT INTO discussions(title,description,created_by) VALUES(?,?,?)", discussions)

    # Discussion members
    dm = []
    for did in (1, 2, 3):
        dm.append((did, 1, 'admin', 0))
        dm.append((did, 2, 'admin', 0))
        dm.append((did, 3, 'admin', 0))
    for sid in (4, 5):
        dm.append((1, sid, 'member', 0))
    for sid in (6, 7):
        dm.append((2, sid, 'member', 0))
    dm.append((3, 8, 'member', 0))
    c.executemany("INSERT INTO discussion_members(discussion_id,user_id,role,muted) VALUES(?,?,?,?)", dm)

    # Netdisk folders (auto-create for each discussion)
    for did, name in [(1, "CS2401"), (2, "CS2402"), (3, "SE2401")]:
        c.execute("INSERT INTO netdisk_folders(name,description,discussion_id,max_size,created_by) VALUES(?,?,?,?,?)",
                  (f"{name} 班级网盘", f"{name} 共享文件", did, 209715200, 1))
        folder_path = NETDISK_DIR / str(did)
        folder_path.mkdir(parents=True, exist_ok=True)

    # Exercises
    exercises = [
        (1, 1, "Hello World",
         "## 题目说明\n\n请用 Python 输出 `Hello, World!`\n\n> 提示：使用 `print()` 函数",
         "easy", "python", "# 在这里写你的代码\n# 提示：使用 print() 函数\n",
         '[{"input":"","output":"Hello, World!\\n"}]', 5, 128, 1, 2),
        (1, 2, "判断奇偶数",
         "## 题目说明\n\n输入一个整数 n，判断是奇数还是偶数。\n\n**输入：** 一个整数 n\n**输出：** 输出 `even`（偶数）或 `odd`（奇数）",
         "easy", "python", "n = int(input())\n",
         '[{"input":"4","output":"even\\n"},{"input":"7","output":"odd\\n"},{"input":"0","output":"even\\n"}]', 5, 128, 2, 2),
        (1, 2, "成绩等级划分",
         "## 题目说明\n\n输入一个成绩（0-100），输出等级：A（90-100）、B（80-89）、C（70-79）、D（60-69）、F（0-59）",
         "easy", "python", "score = int(input())\n",
         '[{"input":"95","output":"A\\n"},{"input":"82","output":"B\\n"},{"input":"75","output":"C\\n"},{"input":"63","output":"D\\n"},{"input":"45","output":"F\\n"}]', 5, 128, 3, 2),
        (1, 3, "1 到 N 的累加",
         "## 题目说明\n\n计算 1+2+…+n 的结果。\n\n**输入：** 正整数 n（1 ≤ n ≤ 10000）\n**输出：** 累加结果",
         "easy", "python", "n = int(input())\n",
         '[{"input":"5","output":"15\\n"},{"input":"10","output":"55\\n"},{"input":"100","output":"5050\\n"}]', 5, 128, 4, 2),
        (1, 3, "九九乘法表",
         "## 题目说明\n\n输入 n，打印 n×n 乘法表。格式：`1x1=1`，同行数字用空格分隔。",
         "easy", "python", "n = int(input())\n",
         '[{"input":"3","output":"1x1=1 1x2=2 1x3=3\\n2x2=4 2x3=6\\n3x3=9\\n"}]', 5, 128, 5, 2),
        (1, 4, "阶乘",
         "## 题目说明\n\n编写函数 `factorial(n)`，返回 n 的阶乘（n!）。\n\n**输入：** 非负整数（0 ≤ n ≤ 20）",
         "easy", "python", "def factorial(n):\n    pass\n\nn = int(input())\nprint(factorial(n))\n",
         '[{"input":"0","output":"1\\n"},{"input":"5","output":"120\\n"},{"input":"10","output":"3628800\\n"}]', 5, 128, 6, 2),
        (1, 5, "回文字符串判断",
         "## 题目说明\n\n判断一个全小写字符串是否是回文（正着读和反着读一样）。输出 `True` 或 `False`。",
         "medium", "python", "s = input()\n",
         '[{"input":"abcba","output":"True\\n"},{"input":"hello","output":"False\\n"}]', 5, 128, 7, 2),
        (1, 6, "排序去重",
         "## 题目说明\n\n输入一组用空格分隔的整数，去除重复数字后排序输出。",
         "medium", "python", "nums = list(map(int, input().split()))\n",
         '[{"input":"3 1 4 1 5 9 2 6 5","output":"1 2 3 4 5 6 9\\n"}]', 5, 128, 8, 2),
        (1, 9, "斐波那契数列",
         "## 题目说明\n\n输出第 n 个斐波那契数（从第 1 项开始：1, 1, 2, 3, 5, 8…）",
         "medium", "python", "n = int(input())\n",
         '[{"input":"1","output":"1\\n"},{"input":"6","output":"8\\n"},{"input":"10","output":"55\\n"}]', 5, 128, 9, 2),
        (1, 10, "学生成绩管理",
         "## 题目说明\n\n逐行输入\"姓名 成绩\"，遇到 `END` 停止。\n然后输出：平均分、最高分同学姓名、不及格人数。",
         "medium", "python", "students = []\nwhile True:\n    line = input().strip()\n    if line == 'END': break\n    name, score = line.rsplit(' ', 1)\n    students.append((name, int(score)))\n",
         '[{"input":"小明 85\\n小红 92\\n小李 55\\n小王 73\\nEND","output":"76.25\\n小红\\n1\\n"}]', 5, 128, 10, 2),
        (2, 1, "Hello World（JS）",
         "## 题目说明\n\n用 JavaScript 输出 `Hello, World!`",
         "easy", "javascript", "// 在这里写你的代码\n",
         '[{"input":"","output":"Hello, World!\\n"}]', 5, 128, 1, 3),
        (2, 6, "数组最大值",
         "## 题目说明\n\n输入一组用空格分隔的数字，输出最大值。",
         "easy", "javascript", "const input = require('fs').readFileSync('/dev/stdin','utf8').trim();\nconst nums = input.split(/\\s+/).map(Number);\n",
         '[{"input":"3 1 4 1 5 9 2","output":"9\\n"}]', 5, 128, 2, 3),
        (3, 4, "函数柯里化",
         "## 题目说明\n\n实现 `curry(fn)` 函数，使 `curry(add)(1)(2)` 返回 3。",
         "hard", "javascript", "function curry(fn) {\n    // TODO\n}\nconst add = (a,b) => a+b;\nconsole.log(curry(add)(1)(2));\n",
         '[{"input":"","output":"3\\n"}]', 5, 128, 3, 2),
        (None, 9, "两数之和",
         "## 题目说明\n\n给定数组 nums 和目标值 target，找出两个下标使其对应值之和等于 target。",
         "medium", "python", "nums = list(map(int, input().split()))\ntarget = int(input())\n",
         '[{"input":"2 7 11 15\\n9","output":"0 1\\n"}]', 5, 128, 1, 2),
        (None, 9, "冒泡排序",
         "## 题目说明\n\n用冒泡排序算法对输入的整数进行从小到大排序。",
         "easy", "python", "nums = list(map(int, input().split()))\n",
         '[{"input":"5 3 8 1 2","output":"1 2 3 5 8\\n"}]', 5, 128, 2, 2),
    ]
    for e in exercises:
        c.execute("""INSERT INTO exercises(course_id,category_id,title,description,difficulty,language,
            template_code,test_cases,time_limit,memory_limit,sort_order,created_by)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""", e)

    # Sample submissions
    c.execute("INSERT INTO submissions(student_id,exercise_id,code,language,status,stdout,exit_code,execution_time,score) VALUES(?,?,?,?,?,?,?,?,?)",
              (4, 1, 'print("Hello, World!")', "python", "accepted", "Hello, World!\n", 0, 15, 100))

    # Sample code pool
    c.executemany("INSERT INTO code_pool(student_id,exercise_id,title,language,code,is_saved) VALUES(?,?,?,?,?,?)", [
        (4, 1, "Hello World", "python", 'print("Hello, World!")', 1),
        (5, 2, "Odd/Even draft", "python", "n = int(input())\n# TODO", 0),
    ])

    # Announcements
    c.executemany("INSERT INTO announcements(course_id,author_id,title,content,priority) VALUES(?,?,?,?,?)", [
        (1, 2, "欢迎来到 Python 基础课！", "同学们好！\n\n欢迎加入 Python 基础入门课程 🎉\n\n请先完成\"Hello World\"练习熟悉平台操作。有任何问题可以在讨论区提问，老师会及时回复。\n\n祝学习愉快！", 10),
        (None, 1, "平台使用须知", "1. 代码执行有时间和内存限制，请注意优化。\n2. 每道题可以多次提交，系统记录最高分。\n3. 禁止抄袭，请独立完成练习。\n4. 如遇到 bug 或建议，请在讨论区反馈，感谢支持！", 1),
    ])

    # Sample tasks
    c.execute("INSERT INTO tasks(course_id,title,content,deadline,created_by) VALUES(?,?,?,?,?)",
              (1, "Python 基础作业一", "## Python 基础作业\n\n请完成以下任务：\n\n1. 编写一个函数实现 Hello World\n2. 编写一个函数判断奇偶数\n\n**截止时间**: 请在截止日期前提交", "2026-04-15 23:59", 2))

    conn.commit()


# ================================================================
# JWT AUTH
# ================================================================
def jwt_encode(payload: dict) -> str:
    payload["exp"] = int(time.time()) + JWT_EXPIRE
    payload["iat"] = int(time.time())
    h = b64url(json.dumps({"alg":"HS256","typ":"JWT"}))
    p = b64url(json.dumps(payload, separators=(",", ":")))
    s = b64url(hmac.new(JWT_SECRET.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{s}"

def jwt_decode(token: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) != 3: return None
        h, p, s = parts
        expected = b64url(hmac.new(JWT_SECRET.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, s): return None
        data = json.loads(b64dec(p))
        if data.get("exp", 0) < time.time(): return None
        return data
    except: return None

def b64url(data) -> str:
    if isinstance(data, str):
        data = data.encode()
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def b64dec(data: str) -> bytes:
    pad = 4 - len(data) % 4
    if pad != 4: data += "=" * pad
    return base64.urlsafe_b64decode(data)

def require_auth(request: Request):
    auth = request.headers.get("authorization", "")
    token = None
    if auth.startswith("Bearer "):
        token = auth[7:]
    elif request.query_params.get("token"):
        token = request.query_params["token"]
    if not token: raise HTTPException(401, "请先登录")
    user = jwt_decode(token)
    if not user: raise HTTPException(401, "登录已过期，请重新登录")
    return user

def require_role(*roles):
    """Decorator to require specific roles."""
    def decorator(func):
        @wraps(func)
        async def wrapper(request: Request, user=Depends(require_auth), *args, **kwargs):
            if user["role"] not in roles:
                raise HTTPException(403, "无权限")
            return await func(request, user=user, *args, **kwargs)
        return wrapper
    return decorator


# ================================================================
# CODE EXECUTION ENGINE
# ================================================================
def execute_code_sandbox(code: str, language: str, test_input: str = "",
                        time_limit: int = 10, memory_limit: int = 256) -> dict:
    lang = LANG_CONFIG.get(language)
    if not lang:
        return {"stdout": "", "stderr": f"Unsupported language: {language}", "exit_code": -1, "time_ms": 0}

    tmpdir = tempfile.mkdtemp(prefix="cc_sandbox_")
    try:
        ext = lang["ext"]
        src_file = os.path.join(tmpdir, f"code{ext}")
        with open(src_file, "w", encoding="utf-8") as f:
            f.write(code)

        if "compile" in lang:
            out_file = os.path.join(tmpdir, "code.exe" if sys.platform == "win32" else "code")
            compile_cmd = [c.replace("{src}", src_file).replace("{out}", out_file) for c in lang["compile"]]
            try:
                comp = subprocess.run(compile_cmd, capture_output=True, text=True, timeout=10)
                if comp.returncode != 0:
                    return {"stdout": "", "stderr": f"Compile error:\n{comp.stderr}", "exit_code": comp.returncode, "time_ms": 0}
            except subprocess.TimeoutExpired:
                return {"stdout": "", "stderr": "Compilation timed out", "exit_code": -1, "time_ms": 0}
            run_cmd = [c.replace("{out}", out_file) for c in lang["run"]]
        else:
            run_cmd = lang["cmd"] + [src_file]

        start = time.time()
        try:
            kwargs = {}
            if sys.platform == "win32":
                kwargs["creationflags"] = 0x08000000
            proc = subprocess.run(
                run_cmd, input=test_input, capture_output=True, text=True,
                timeout=time_limit + 2, **kwargs,
            )
        except subprocess.TimeoutExpired:
            elapsed = int((time.time() - start) * 1000)
            return {"stdout": "", "stderr": f"Time limit exceeded ({time_limit}s)", "exit_code": -1, "time_ms": elapsed}

        elapsed = int((time.time() - start) * 1000)
        return {
            "stdout": proc.stdout, "stderr": proc.stderr,
            "exit_code": proc.returncode, "time_ms": elapsed,
        }
    except Exception as e:
        return {"stdout": "", "stderr": f"Executor error: {e}", "exit_code": -1, "time_ms": 0}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def judge_submission(code: str, language: str, test_cases: list,
                     time_limit: int = 10, memory_limit: int = 256) -> dict:
    results = []
    passed = 0
    total = len(test_cases)
    max_time = 0
    final_stdout = ""
    final_stderr = ""
    final_status = "accepted"

    for i, tc in enumerate(test_cases):
        r = execute_code_sandbox(code, language, tc.get("input", ""), time_limit, memory_limit)
        max_time = max(max_time, r["time_ms"])
        final_stderr = r["stderr"]

        expected = tc.get("output", "")
        status = "accepted" if r["exit_code"] == 0 and r["stdout"].rstrip() == expected.rstrip() else "wrong_answer"

        if r["exit_code"] != 0:
            if "Time limit" in r["stderr"]:
                status = "time_limit"
            elif "Compile error" in r["stderr"]:
                status = "compile_error"
            else:
                status = "runtime_error"

        results.append({"test": i+1, "status": status, "expected": expected[:200], "actual": r["stdout"][:200], "time_ms": r["time_ms"]})

        if status == "accepted":
            passed += 1
            final_stdout = r["stdout"]
        else:
            if final_status == "accepted":
                final_status = status

    score = int((passed / total) * 100) if total > 0 else 0
    if passed == total:
        final_status = "accepted"
        score = 100

    return {
        "status": final_status, "score": score,
        "stdout": final_stdout, "stderr": final_stderr,
        "exit_code": 0 if final_status == "accepted" else 1,
        "execution_time": max_time, "test_results": results,
    }


# ================================================================
# FASTAPI APP
# ================================================================
app = FastAPI(title="Code Classroom")

# ================================================================
# STATIC FILES
# ================================================================
@app.get("/")
async def serve_index():
    return FileResponse(str(STATIC_DIR / "index.html"),
                        headers={"Cache-Control": "no-cache, no-store, must-revalidate"})

@app.get("/static/{filepath:path}")
async def serve_static(filepath: str):
    f = STATIC_DIR / filepath
    if f.exists() and f.is_file():
        return FileResponse(str(f),
                            headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
    raise HTTPException(404)

@app.get("/plugin-assets/{plugin_name}/{filepath:path}")
async def serve_plugin_asset(plugin_name: str, filepath: str):
    """Serve static assets (JS/CSS/images) from plugin directories."""
    f = PLUGIN_DIR / plugin_name / filepath
    if f.exists() and f.is_file():
        return FileResponse(str(f),
                            headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
    raise HTTPException(404)

@app.get("/api/plugins/nav")
async def get_plugin_nav_items():
    """Return nav items declared by plugins (plugin.json -> nav field)."""
    items = []
    if not PLUGIN_DIR.exists():
        return {"code": 0, "data": items}
    for entry in sorted(PLUGIN_DIR.iterdir()):
        if not entry.is_dir():
            continue
        plugin_json = entry / "plugin.json"
        if not plugin_json.exists():
            continue
        try:
            with open(plugin_json, "r", encoding="utf-8") as f:
                meta = json.load(f)
            # nav: list of {icon, label, page, js, role}
            nav = meta.get("nav", [])
            for item in nav:
                item["_plugin"] = entry.name
                item["_js"] = f"/plugin-assets/{entry.name}/{item.get('js','')}" if item.get("js") else None
                items.append(item)
        except Exception:
            pass
    return {"code": 0, "data": items}

# ================================================================
# AUTH API
# ================================================================
class LoginBody(BaseModel):
    username: str
    password: str

class RegisterBody(BaseModel):
    username: str
    email: str
    password: str
    student_number: str = ""
    class_name: str = ""

@app.post("/api/auth/login")
async def login(body: LoginBody):
    with db_cursor() as c:
        c.execute("SELECT * FROM users WHERE (username=? OR email=?) AND status=1", (body.username, body.username))
        row = c.fetchone()
        if not row or not _verify_password(body.password, row["password"]):
            raise HTTPException(401, "用户名或密码错误")
        c.execute("UPDATE users SET last_login_at=datetime('now','localtime') WHERE id=?", (row["id"],))
        token = jwt_encode({"id": row["id"], "username": row["username"], "role": row["role"]})
        return {"code": 0, "message": "登录成功", "data": {"token": token, "user": dict(row)}}

@app.post("/api/auth/register")
async def register(body: RegisterBody):
    # Check if registration is enabled
    with db_cursor() as c:
        c.execute("SELECT value FROM system_settings WHERE key='register_enabled'")
        row = c.fetchone()
        if row and row["value"] == "0":
            raise HTTPException(403, "注册功能已关闭")

    if len(body.username) < 3: raise HTTPException(400, "用户名至少需要 3 个字符")
    if "@" not in body.email: raise HTTPException(400, "邮箱格式不正确")
    if len(body.password) < 6: raise HTTPException(400, "密码至少需要 6 个字符")
    with db_cursor() as c:
        c.execute("SELECT id FROM users WHERE username=? OR email=?", (body.username, body.email))
        if c.fetchone(): raise HTTPException(400, "用户名或邮箱已被注册")
        avatar = AVATAR_COLORS[hash(body.username) % len(AVATAR_COLORS)]
        c.execute("INSERT INTO users(username,email,password,role,avatar,student_number,class_name) VALUES(?,?,?,'student',?,?,?)",
                  (body.username, body.email, _hash_password(body.password), avatar, body.student_number, body.class_name))
        uid = c.lastrowid
        token = jwt_encode({"id": uid, "username": body.username, "role": "student"})
        return {"code": 0, "message": "注册成功", "data": {"token": token, "user": {
            "id": uid, "username": body.username, "email": body.email, "role": "student",
            "avatar": avatar, "student_number": body.student_number, "class_name": body.class_name
        }}}


# ================================================================
# COURSES API
# ================================================================
@app.get("/api/courses")
async def list_courses(request: Request, user=Depends(require_auth)):
    params = dict(request.query_params)
    page, size = int(params.get("page",1)), int(params.get("page_size",20))
    search = params.get("search","")
    offset = (page-1)*size
    with db_cursor() as c:
        where, binds = "WHERE c.status=1", []
        if user["role"] == "teacher":
            where += " AND c.teacher_id=?"; binds.append(user["id"])
        if search:
            where += " AND c.name LIKE ?"; binds.append(f"%{search}%")
        c.execute(f"SELECT COUNT(*) FROM courses c {where}", binds)
        total = c.fetchone()[0]
        c.execute(f"""SELECT c.*, u.username as teacher_name,
                     (SELECT COUNT(*) FROM course_enrollments WHERE course_id=c.id) as student_count,
                     (SELECT COUNT(*) FROM exercises WHERE course_id=c.id AND status=1) as exercise_count
                     FROM courses c LEFT JOIN users u ON u.id=c.teacher_id
                     {where} ORDER BY c.id DESC LIMIT ? OFFSET ?""", binds + [size, offset])
        rows = [dict(r) for r in c.fetchall()]
        if user["role"] == "student":
            c.execute("SELECT course_id FROM course_enrollments WHERE student_id=?", (user["id"],))
            enrolled = {r[0] for r in c.fetchall()}
            for r in rows: r["enrolled"] = r["id"] in enrolled
    return {"code": 0, "data": {"items": rows, "total": total, "page": page, "page_size": size, "pages": (total+size-1)//size}}

@app.get("/api/courses/{cid}/exercises")
async def course_exercises(cid: int, request: Request, user=Depends(require_auth)):
    """获取某课程的习题列表——学生必须先选该课程才能访问"""
    params = dict(request.query_params)
    page, size = int(params.get("page",1)), int(params.get("page_size",50))
    offset = (page-1)*size
    with db_cursor() as c:
        # 学生权限检查：是否已选该课程
        if user["role"] == "student":
            c.execute("SELECT id FROM course_enrollments WHERE student_id=? AND course_id=?", (user["id"], cid))
            if not c.fetchone():
                raise HTTPException(403, "请先选修该课程")
        c.execute("""SELECT COUNT(*) FROM exercises WHERE (course_id=? OR course_id IS NULL) AND status=1""", (cid,))
        total = c.fetchone()[0]
        c.execute("""SELECT e.*, c.name as category_name FROM exercises e
                     LEFT JOIN categories c ON c.id=e.category_id
                     WHERE (e.course_id=? OR e.course_id IS NULL) AND e.status=1
                     ORDER BY e.sort_order, e.id LIMIT ? OFFSET ?""", (cid, size, offset))
        rows = [dict(r) for r in c.fetchall()]
        if user["role"] == "student" and rows:
            ids = [r["id"] for r in rows]
            ph = ",".join("?"*len(ids))
            c.execute(f"SELECT exercise_id, status, MAX(score) as best_score FROM submissions WHERE student_id=? AND exercise_id IN ({ph}) GROUP BY exercise_id, status",
                      [user["id"]] + ids)
            smap = {}
            for sr in c.fetchall():
                eid = sr["exercise_id"]
                if eid not in smap or sr["status"] == "accepted":
                    smap[eid] = {"status": sr["status"], "best_score": sr["best_score"]}
            for r in rows: r["my_status"] = smap.get(r["id"])
    return {"code": 0, "data": {"items": rows, "total": total, "page": page, "page_size": size}}

@app.get("/api/courses/{cid}/announcements")
async def course_announcements(cid: int, user=Depends(require_auth)):
    """获取某课程的公告——学生必须先选该课程才能访问"""
    with db_cursor() as c:
        # 学生权限检查：是否已选该课程
        if user["role"] == "student":
            c.execute("SELECT id FROM course_enrollments WHERE student_id=? AND course_id=?", (user["id"], cid))
            if not c.fetchone():
                raise HTTPException(403, "请先选修该课程")
        c.execute("""SELECT a.*, u.username as author_name FROM announcements a
                     JOIN users u ON u.id=a.author_id WHERE a.course_id=? ORDER BY a.priority DESC, a.created_at DESC""", (cid,))
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": rows}

@app.get("/api/courses/{cid}/learning")
async def course_learning(cid: int, user=Depends(require_auth)):
    """获取某课程的学习资源——学生必须先选该课程才能访问"""
    with db_cursor() as c:
        # 学生权限检查：是否已选该课程
        if user["role"] == "student":
            c.execute("SELECT id FROM course_enrollments WHERE student_id=? AND course_id=?", (user["id"], cid))
            if not c.fetchone():
                raise HTTPException(403, "请先选修该课程")
        
        # 每个课程有一个默认的学习目录：course_{cid}
        folder_name = f"course_{cid}"
        folder_path = LEARNING_DIR / folder_name
        
        # 如果目录不存在，自动创建
        if not folder_path.exists():
            folder_path.mkdir(parents=True, exist_ok=True)
        
        if not folder_path.is_dir():
            return {"code": 0, "data": {"files": [], "folder": folder_name}}
        
        # 扫描目录中的学习文件
        files = []
        for f in sorted(folder_path.iterdir()):
            if f.is_file() and f.suffix.lower() in ('.html', '.json', '.md'):
                files.append({
                    "name": f.stem,
                    "filename": f.name,
                    "ext": f.suffix.lower(),
                    "path": f"{folder_name}/{f.name}",
                    "size": f.stat().st_size,
                })
        return {"code": 0, "data": {"files": files, "folder": folder_name}}

@app.post("/api/courses")
async def create_course(request: Request, user=Depends(require_auth)):
    if user["role"] not in ("teacher","admin"): raise HTTPException(403, "无权限")
    body = await request.json()
    if not body.get("name"): raise HTTPException(400, "课程名称不能为空")
    with db_cursor() as c:
        new_id = _alloc_id('courses', c)
        c.execute("INSERT INTO courses(id,name,description,teacher_id,enroll_password,learning_folder) VALUES(?,?,?,?,?,?)",
                  (new_id, body["name"], body.get("description"), user["id"],
                   body.get("enroll_password") or None, body.get("learning_folder") or None))
    return {"code": 0, "message": "Course created", "data": {"id": new_id}}



# ================================================================
# ENROLLMENTS API
# ================================================================
@app.post("/api/enrollments")
async def enroll(request: Request, user=Depends(require_auth)):
    """学生用密码自选课程，或管理员/教师直接为学生选课"""
    body = await request.json()
    cid = body.get("course_id", 0)
    password = body.get("password", "")
    target_student_id = body.get("student_id")  # 管理员/教师指定学生

    with db_cursor() as c:
        c.execute("SELECT id, enroll_password FROM courses WHERE id=? AND status=1", (cid,))
        course = c.fetchone()
        if not course:
            raise HTTPException(404, "课程不存在")

        # 管理员/教师可直接分配学生（无需密码）
        if target_student_id and user["role"] in ("teacher", "admin"):
            c.execute("INSERT OR IGNORE INTO course_enrollments(course_id,student_id) VALUES(?,?)",
                      (cid, target_student_id))
            return {"code": 0, "message": "已成功为该学生选课"}

        # 学生自选：需要课程密码（如果设置了密码）
        if user["role"] == "student":
            enroll_pwd = course["enroll_password"]
            if enroll_pwd:
                if not password:
                    raise HTTPException(400, "该课程需要选课密码")
                if password != enroll_pwd:
                    raise HTTPException(403, "选课密码错误")
            else:
                raise HTTPException(403, "该课程不开放自主选课，请联系教师/管理员添加")
            c.execute("INSERT OR IGNORE INTO course_enrollments(course_id,student_id) VALUES(?,?)",
                      (cid, user["id"]))
            return {"code": 0, "message": "选课成功！"}

        raise HTTPException(403, "无权限")



@app.post("/api/enrollments/remove")
async def unenroll(request: Request, user=Depends(require_auth)):
    """退出课程（学生退出自己，管理员/教师可踢出指定学生）"""
    body = await request.json()
    cid = body.get("course_id", 0)
    target_student_id = body.get("student_id", user["id"])

    if target_student_id != user["id"] and user["role"] not in ("teacher", "admin"):
        raise HTTPException(403, "无权限")



    with db_cursor() as c:
        c.execute("DELETE FROM course_enrollments WHERE course_id=? AND student_id=?",
                  (cid, target_student_id))
    return {"code": 0, "message": "已退课"}


@app.post("/api/enrollments/batch")
async def enroll_batch(request: Request, user=Depends(require_auth)):
    """管理员/教师批量为学生选课"""
    if user["role"] not in ("teacher", "admin"):
        raise HTTPException(403, "无权限")
    body = await request.json()
    cid = body.get("course_id", 0)
    student_ids = body.get("student_ids", [])
    with db_cursor() as c:
        c.execute("SELECT id FROM courses WHERE id=? AND status=1", (cid,))
        if not c.fetchone():
            raise HTTPException(404, "课程不存在")
        for sid in student_ids:
            c.execute("INSERT OR IGNORE INTO course_enrollments(course_id,student_id) VALUES(?,?)", (cid, sid))
    return {"code": 0, "message": f"已为 {len(student_ids)} 名学生选课"}


@app.get("/api/enrollments")
async def my_enrollments(user=Depends(require_auth)):
    with db_cursor() as c:
        c.execute("""SELECT c.*, ce.enrolled_at,
                     (SELECT COUNT(*) FROM exercises WHERE course_id=c.id AND status=1) as exercise_count,
                     (SELECT COUNT(DISTINCT s.exercise_id) FROM submissions s
                      WHERE s.student_id=? AND s.exercise_id IN (SELECT id FROM exercises WHERE course_id=c.id) AND s.status='accepted') as completed_count
                     FROM course_enrollments ce JOIN courses c ON c.id=ce.course_id
                     WHERE ce.student_id=? AND c.status=1 ORDER BY ce.enrolled_at DESC""", (user["id"], user["id"]))
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": rows}


@app.get("/api/courses/{cid}/students")
async def course_students(cid: int, user=Depends(require_auth)):
    """教师/管理员查看某课程的选课学生列表"""
    if user["role"] not in ("teacher", "admin"):
        raise HTTPException(403, "无权限")
    with db_cursor() as c:
        c.execute("""SELECT u.id, u.username, u.nickname, u.student_number, u.class_name,
                            ce.enrolled_at
                     FROM course_enrollments ce
                     JOIN users u ON u.id = ce.student_id
                     WHERE ce.course_id = ?
                     ORDER BY ce.enrolled_at DESC""", (cid,))
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": rows}


@app.put("/api/courses/{cid}")
async def update_course(cid: int, request: Request, user=Depends(require_auth)):
    """更新课程信息（包括选课密码和关联学习目录）"""
    if user["role"] not in ("teacher", "admin"):
        raise HTTPException(403, "无权限")
    body = await request.json()
    with db_cursor() as c:
        c.execute("SELECT id, teacher_id FROM courses WHERE id=?", (cid,))
        row = c.fetchone()
        if not row:
            raise HTTPException(404, "课程不存在")
        if user["role"] == "teacher" and row["teacher_id"] != user["id"]:
            raise HTTPException(403, "只能编辑自己的课程")
        fields, vals = [], []
        for k in ("name", "description", "status", "enroll_password", "learning_folder"):
            if k in body:
                fields.append(f"{k}=?")
                vals.append(body[k])
        if fields:
            vals.append(cid)
            c.execute(f"UPDATE courses SET {','.join(fields)},updated_at=datetime('now','localtime') WHERE id=?", vals)
    return {"code": 0, "message": "课程已更新"}



# ================================================================
# EXERCISES API
# ================================================================
@app.get("/api/exercises")
async def list_exercises(request: Request, user=Depends(require_auth)):
    """题库列表——学生只能看到已选课程的习题（或course_id为NULL的公共习题）"""
    params = dict(request.query_params)
    page, size = int(params.get("page",1)), int(params.get("page_size",50))
    offset = (page-1)*size
    difficulty, language, search = params.get("difficulty",""), params.get("language",""), params.get("search","")
    where, binds = "WHERE e.status=1", []
    
    # 学生只能看到已选课程的习题 + 公共习题(course_id IS NULL)
    if user["role"] == "student":
        c = sqlite3.connect(DB_PATH)
        c.row_factory = sqlite3.Row
        cur = c.cursor()
        cur.execute("SELECT course_id FROM course_enrollments WHERE student_id=?", (user["id"],))
        enrolled_cids = [r[0] for r in cur.fetchall()]
        c.close()
        if enrolled_cids:
            ph = ",".join("?" * len(enrolled_cids))
            where += f" AND (e.course_id IS NULL OR e.course_id IN ({ph}))"
            binds.extend(enrolled_cids)
        else:
            where += " AND e.course_id IS NULL"  # 未选任何课，只能看公共习题
    
    if search: where += " AND e.title LIKE ?"; binds.append(f"%{search}%")
    if difficulty: where += " AND e.difficulty=?"; binds.append(difficulty)
    if language: where += " AND e.language=?"; binds.append(language)
    with db_cursor() as c:
        c.execute(f"SELECT COUNT(*) FROM exercises e {where}", binds); total = c.fetchone()[0]
        c.execute(f"""SELECT e.id,e.title,e.difficulty,e.language,e.category_id,e.time_limit,e.memory_limit,e.sort_order,
                     c.name as category_name FROM exercises e LEFT JOIN categories c ON c.id=e.category_id
                     {where} ORDER BY e.sort_order, e.id LIMIT ? OFFSET ?""", binds + [size, offset])
        rows = [dict(r) for r in c.fetchall()]
        if user["role"] == "student" and rows:
            ids = [r["id"] for r in rows]
            ph = ",".join("?"*len(ids))
            c.execute(f"SELECT exercise_id, status, MAX(score) as best_score FROM submissions WHERE student_id=? AND exercise_id IN ({ph}) GROUP BY exercise_id, status",
                      [user["id"]] + ids)
            smap = {}
            for sr in c.fetchall():
                eid = sr["exercise_id"]
                if eid not in smap or sr["status"] == "accepted":
                    smap[eid] = {"status": sr["status"], "best_score": sr["best_score"]}
            for r in rows: r["my_status"] = smap.get(r["id"])
    return {"code": 0, "data": {"items": rows, "total": total, "page": page, "page_size": size}}

@app.get("/api/exercises/{eid}")
async def get_exercise(eid: int, user=Depends(require_auth)):
    """获取单个习题详情——学生必须已选该习题所属课程"""
    with db_cursor() as c:
        c.execute("SELECT e.*, c.name as category_name FROM exercises e LEFT JOIN categories c ON c.id=e.category_id WHERE e.id=?", (eid,))
        row = c.fetchone()
        if not row: raise HTTPException(404, "Not found")
        
        # 学生权限检查：若习题属于某课程，则要求已选该课程
        if user["role"] == "student":
            course_id = row["course_id"]
            if course_id:
                c.execute("SELECT id FROM course_enrollments WHERE student_id=? AND course_id=?", (user["id"], course_id))
                if not c.fetchone():
                    raise HTTPException(403, "请先选修该课程")
        
        d = dict(row)
        d["test_case_count"] = len(json.loads(d.get("test_cases") or "[]"))
        del d["test_cases"]
        return {"code": 0, "data": d}

@app.post("/api/exercises")
async def create_exercise(request: Request, user=Depends(require_auth)):
    if user["role"] not in ("teacher","admin"): raise HTTPException(403)
    body = await request.json()
    if not body.get("title") or not body.get("description"): raise HTTPException(400, "标题和描述不能为空")
    tcs = body.get("test_cases", [])
    if not isinstance(tcs, list) or not tcs: raise HTTPException(400, "至少需要 1 个测试用例")
    with db_cursor() as c:
        c.execute("""INSERT INTO exercises(course_id,category_id,title,description,difficulty,language,
            template_code,test_cases,reference_code,check_code,time_limit,memory_limit,sort_order,created_by)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (body.get("course_id"), body.get("category_id"), body["title"], body["description"],
             body.get("difficulty","easy"), body.get("language","python"), body.get("template_code"),
             json.dumps(tcs, ensure_ascii=False), body.get("reference_code"),
             1 if body.get("check_code") else 0,
             body.get("time_limit",10), body.get("memory_limit",256),
             body.get("sort_order",0), user["id"]))
    return {"code": 0, "message": "题目创建成功", "data": {"id": c.lastrowid}}


# ================================================================
# COURSE EXERCISE MANAGEMENT API (教师/管理员管理课程练习题)
# ================================================================

@app.post("/api/courses/{cid}/exercises")
async def create_course_exercise(cid: int, request: Request, user=Depends(require_auth)):
    """教师/管理员在指定课程下创建练习题"""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "无权限")
    with db_cursor() as c:
        c.execute("SELECT id FROM courses WHERE id=? AND status=1", (cid,))
        if not c.fetchone(): raise HTTPException(404, "课程不存在")
    body = await request.json()
    if not body.get("title") or not body.get("description"): raise HTTPException(400, "标题和描述不能为空")
    tcs = body.get("test_cases", [])
    if not isinstance(tcs, list) or not tcs: raise HTTPException(400, "至少需要 1 个测试用例")
    # 获取当前最大 sort_order
    with db_cursor() as c:
        c.execute("SELECT COALESCE(MAX(sort_order),0) FROM exercises WHERE course_id=?", (cid,))
        max_sort = c.fetchone()[0]
        c.execute("""INSERT INTO exercises(course_id,category_id,title,description,difficulty,language,
            template_code,test_cases,reference_code,check_code,time_limit,memory_limit,sort_order,created_by)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (cid, body.get("category_id"), body["title"], body["description"],
             body.get("difficulty","easy"), body.get("language","python"), body.get("template_code"),
             json.dumps(tcs, ensure_ascii=False), body.get("reference_code"),
             1 if body.get("check_code") else 0,
             body.get("time_limit",10), body.get("memory_limit",256),
             max_sort + 1, user["id"]))
        eid = c.lastrowid
    return {"code": 0, "message": "题目创建成功", "data": {"id": eid}}


@app.post("/api/courses/{cid}/exercises/batch")
async def batch_upload_course_exercises(cid: int, request: Request, user=Depends(require_auth)):
    """批量上传练习题（JSON 格式）到指定课程"""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "无权限")
    with db_cursor() as c:
        c.execute("SELECT id FROM courses WHERE id=? AND status=1", (cid,))
        if not c.fetchone(): raise HTTPException(404, "课程不存在")
    body = await request.json()
    exercises = body.get("exercises", [])
    if not isinstance(exercises, list) or not exercises:
        raise HTTPException(400, "exercises 必须是非空数组")
    if len(exercises) > 100:
        raise HTTPException(400, "单次最多上传 100 道题目")

    created = []
    errors = []
    with db_cursor() as c:
        c.execute("SELECT COALESCE(MAX(sort_order),0) FROM exercises WHERE course_id=?", (cid,))
        base_sort = c.fetchone()[0]
        for i, ex in enumerate(exercises):
            try:
                title = (ex.get("title") or "").strip()
                desc = (ex.get("description") or "").strip()
                if not title or not desc:
                    errors.append(f"#{i+1}: 标题和描述不能为空")
                    continue
                tcs = ex.get("test_cases", [])
                if not isinstance(tcs, list) or not tcs:
                    errors.append(f"#{i+1} ({title}): 至少需要 1 个测试用例")
                    continue
                if len(json.dumps(tcs, ensure_ascii=False)) > 65535:
                    errors.append(f"#{i+1} ({title}): 测试用例过大")
                    continue
                c.execute("""INSERT INTO exercises(course_id,category_id,title,description,difficulty,language,
                    template_code,test_cases,reference_code,check_code,time_limit,memory_limit,sort_order,created_by)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (cid, ex.get("category_id"), title, desc,
                     ex.get("difficulty","easy"), ex.get("language","python"), ex.get("template_code"),
                     json.dumps(tcs, ensure_ascii=False), ex.get("reference_code"),
                     1 if ex.get("check_code") else 0,
                     ex.get("time_limit",10), ex.get("memory_limit",256),
                     base_sort + i + 1, user["id"]))
                created.append({"id": c.lastrowid, "title": title})
            except Exception as e:
                errors.append(f"#{i+1}: {str(e)}")
    return {"code": 0, "message": f"成功导入 {len(created)} 道题目",
            "data": {"created": created, "errors": errors}}


@app.put("/api/courses/{cid}/exercises/{eid}")
async def update_course_exercise(cid: int, eid: int, request: Request, user=Depends(require_auth)):
    """教师/管理员编辑课程中的练习题"""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "无权限")
    body = await request.json()
    with db_cursor() as c:
        c.execute("SELECT id FROM exercises WHERE id=? AND course_id=?", (eid, cid))
        if not c.fetchone(): raise HTTPException(404, "题目不存在")
        fields, vals = [], []
        for f in ("title","description","difficulty","language","template_code","time_limit","memory_limit"):
            if f in body:
                fields.append(f"{f}=?")
                vals.append(body[f])
        if "test_cases" in body:
            tcs = body["test_cases"]
            if not isinstance(tcs, list) or not tcs: raise HTTPException(400, "测试用例格式错误")
            fields.append("test_cases=?")
            vals.append(json.dumps(tcs, ensure_ascii=False))
        if "reference_code" in body:
            fields.append("reference_code=?")
            vals.append(body["reference_code"])
        if "check_code" in body:
            fields.append("check_code=?")
            vals.append(1 if body["check_code"] else 0)
        if not fields: raise HTTPException(400, "没有要更新的字段")
        fields.append("updated_at=datetime('now','localtime')")
        vals.extend([eid])
        c.execute(f"UPDATE exercises SET {','.join(fields)} WHERE id=?", vals)
    return {"code": 0, "message": "题目已更新"}


@app.delete("/api/courses/{cid}/exercises/{eid}")
async def delete_course_exercise(cid: int, eid: int, user=Depends(require_auth)):
    """教师/管理员删除课程中的练习题"""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "无权限")
    with db_cursor() as c:
        c.execute("SELECT id FROM exercises WHERE id=? AND course_id=?", (eid, cid))
        if not c.fetchone(): raise HTTPException(404, "题目不存在")
        c.execute("DELETE FROM submissions WHERE exercise_id=?", (eid,))
        c.execute("DELETE FROM exercises WHERE id=?", (eid,))
    return {"code": 0, "message": "题目已删除"}


@app.put("/api/courses/{cid}/exercises/{eid}/move")
async def move_course_exercise(cid: int, eid: int, request: Request, user=Depends(require_auth)):
    """教师/管理员移动题目排序或移动到其他课程"""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "无权限")
    body = await request.json()
    with db_cursor() as c:
        c.execute("SELECT id, course_id, sort_order FROM exercises WHERE id=? AND status=1 AND course_id=?", (eid, cid))
        ex = c.fetchone()
        if not ex: raise HTTPException(404, "题目不存在或不属于该课程")
        target_course = body.get("course_id", cid)
        direction = body.get("direction", "")
        if target_course != cid:
            # 移动到其他课程
            c.execute("SELECT id FROM courses WHERE id=? AND status=1", (target_course,))
            if not c.fetchone(): raise HTTPException(404, "目标课程不存在")
            c.execute("UPDATE exercises SET course_id=?, updated_at=datetime('now','localtime') WHERE id=?",
                      (target_course, eid))
        elif direction == "up":
            # 上移：与上方题目交换 sort_order
            c.execute("""SELECT id, sort_order FROM exercises WHERE course_id=? AND sort_order<?
                          AND status=1 ORDER BY sort_order DESC LIMIT 1""", (cid, ex["sort_order"]))
            prev = c.fetchone()
            if prev:
                c.execute("UPDATE exercises SET sort_order=? WHERE id=?", (ex["sort_order"], prev["id"]))
                c.execute("UPDATE exercises SET sort_order=?, updated_at=datetime('now','localtime') WHERE id=?",
                          (prev["sort_order"], eid))
        elif direction == "down":
            # 下移：与下方题目交换 sort_order
            c.execute("""SELECT id, sort_order FROM exercises WHERE course_id=? AND sort_order>?
                          AND status=1 ORDER BY sort_order ASC LIMIT 1""", (cid, ex["sort_order"]))
            next_e = c.fetchone()
            if next_e:
                c.execute("UPDATE exercises SET sort_order=? WHERE id=?", (ex["sort_order"], next_e["id"]))
                c.execute("UPDATE exercises SET sort_order=?, updated_at=datetime('now','localtime') WHERE id=?",
                          (next_e["sort_order"], eid))
    return {"code": 0, "message": "题目已移动"}


@app.get("/api/courses/{cid}/exercises/export")
async def export_course_exercises(cid: int, user=Depends(require_auth)):
    """导出课程的练习题为 JSON（含测试用例和参考代码）"""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "无权限")
    with db_cursor() as c:
        c.execute("""SELECT id,title,description,difficulty,language,template_code,test_cases,
                     reference_code,check_code,time_limit,memory_limit,sort_order
                     FROM exercises WHERE course_id=? AND status=1 ORDER BY sort_order, id""", (cid,))
        rows = [dict(r) for r in c.fetchall()]
    for r in rows:
        try: r["test_cases"] = json.loads(r["test_cases"] or "[]")
        except: r["test_cases"] = []
    return {"code": 0, "data": {"course_id": cid, "exercises": rows, "exported_at": time.strftime("%Y-%m-%d %H:%M:%S")}}



# ================================================================
# SUBMISSIONS API
# ================================================================
@app.post("/api/submissions")
async def submit_code(request: Request, user=Depends(require_auth)):
    """提交代码——学生必须已选该习题所属课程才能提交"""
    body = await request.json()
    eid = body.get("exercise_id", 0)
    code = body.get("code", "")
    language = body.get("language", "python")
    if eid <= 0: raise HTTPException(400, "题目ID不能为空")
    if not code.strip(): raise HTTPException(400, "代码不能为空")
    if len(code) > 65535: raise HTTPException(400, "代码长度超过限制（最大 64KB）")
    if language not in LANG_CONFIG: raise HTTPException(400, f"不支持的语言: {language}")

    with db_cursor() as c:
        c.execute("SELECT COUNT(*) FROM submissions WHERE student_id=? AND submitted_at > datetime('now','localtime','-1 minute')", (user["id"],))
        if c.fetchone()[0] >= 10: raise HTTPException(429, "提交过于频繁，请稍后再试")
        c.execute("SELECT * FROM exercises WHERE id=? AND status=1", (eid,))
        ex = c.fetchone()
        if not ex: raise HTTPException(404, "题目不存在")
        
        # 学生权限检查：若习题属于某课程，则要求已选该课程
        if user["role"] == "student":
            course_id = ex["course_id"]
            if course_id:
                c.execute("SELECT id FROM course_enrollments WHERE student_id=? AND course_id=?", (user["id"], course_id))
                if not c.fetchone():
                    raise HTTPException(403, "请先选修该课程")
        c.execute("INSERT INTO submissions(student_id,exercise_id,code,language,status) VALUES(?,?,?,?,?)",
                  (user["id"], eid, code, language, "pending"))
        sid = c.lastrowid

    test_cases = json.loads(ex["test_cases"] or "[]")

    # 代码检查功能：如果题目开启了 check_code 且有 reference_code，先检查代码是否一致
    code_check_result = None
    if ex.get("check_code") and ex.get("reference_code"):
        ref_code = ex["reference_code"]
        student_lines = code.splitlines()
        ref_lines = ref_code.splitlines()
        if student_lines != ref_lines:
            import difflib
            diff = list(difflib.unified_diff(ref_lines, student_lines,
                                              fromfile="参考代码", tofile="你的代码", lineterm=""))
            diff_text = "\n".join(diff[:50])  # 限制差异输出行数
            # 统计不一致的行号
            mismatch_lines = []
            max_len = max(len(ref_lines), len(student_lines))
            for idx in range(max_len):
                rl = ref_lines[idx] if idx < len(ref_lines) else "<空行>"
                sl = student_lines[idx] if idx < len(student_lines) else "<空行>"
                if rl != sl:
                    mismatch_lines.append(idx + 1)
            code_check_result = {
                "passed": False,
                "diff": diff_text,
                "mismatch_lines": mismatch_lines[:20],
                "message": f"代码与参考答案不一致（共 {len(mismatch_lines)} 处不同，行号：{', '.join(str(x) for x in mismatch_lines[:20])}）"
            }
        else:
            code_check_result = {"passed": True, "message": "代码与参考答案一致"}

    if code_check_result and not code_check_result["passed"]:
        # 代码检查不通过，直接判0分，不执行测试用例
        result = {
            "status": "wrong_answer", "score": 0,
            "stdout": "", "stderr": code_check_result["message"],
            "exit_code": 1, "execution_time": 0,
            "test_results": [{"test": 0, "status": "code_check_failed",
                              "expected": "", "actual": code_check_result["message"], "time_ms": 0}],
        }
    else:
        result = judge_submission(code, language, test_cases, ex["time_limit"], ex["memory_limit"])

    with db_cursor() as c:
        c.execute("""UPDATE submissions SET status=?, stdout=?, stderr=?, exit_code=?, execution_time=?,
            score=?, test_results=?, executed_at=datetime('now','localtime') WHERE id=?""",
            (result["status"], result["stdout"], result["stderr"], result["exit_code"],
             result["execution_time"], result["score"],
             json.dumps(result["test_results"], ensure_ascii=False), sid))

    return {"code": 0, "message": "提交成功", "data": {"submission_id": sid, "status": result["status"], "score": result["score"],
            "stdout": result["stdout"], "stderr": result["stderr"], "test_results": result["test_results"],
            "execution_time": result["execution_time"], "code_check": code_check_result}}

@app.get("/api/submissions/{sid}")
async def get_submission(sid: int, user=Depends(require_auth)):
    with db_cursor() as c:
        c.execute("SELECT s.*, u.username as student_name, e.title as exercise_title FROM submissions s JOIN users u ON u.id=s.student_id JOIN exercises e ON e.id=s.exercise_id WHERE s.id=?", (sid,))
        row = c.fetchone()
        if not row: raise HTTPException(404, "Not found")
        if user["role"] == "student" and row["student_id"] != user["id"]: raise HTTPException(403, "无权限查看此提交")
        d = dict(row)
        if d.get("test_results"): d["test_results"] = json.loads(d["test_results"])
        return {"code": 0, "data": d}

@app.get("/api/submissions")
async def list_submissions(request: Request, user=Depends(require_auth)):
    params = dict(request.query_params)
    page, size = int(params.get("page",1)), int(params.get("page_size",30))
    offset = (page-1)*size
    where, binds = "WHERE 1=1", []
    if user["role"] == "student":
        where += " AND s.student_id=?"; binds.append(user["id"])
    if params.get("exercise_id"):
        where += " AND s.exercise_id=?"; binds.append(int(params["exercise_id"]))
    with db_cursor() as c:
        c.execute(f"SELECT COUNT(*) FROM submissions s {where}", binds); total = c.fetchone()[0]
        c.execute(f"""SELECT s.*, u.username as student_name, e.title as exercise_title
                     FROM submissions s JOIN users u ON u.id=s.student_id JOIN exercises e ON e.id=s.exercise_id
                     {where} ORDER BY s.submitted_at DESC LIMIT ? OFFSET ?""", binds + [size, offset])
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": {"items": rows, "total": total, "page": page, "page_size": size}}

# ================================================================
# CODE POOL API
# ================================================================
@app.get("/api/code-pool")
async def list_code_pool(request: Request, user=Depends(require_auth)):
    params = dict(request.query_params)
    page, size = int(params.get("page",1)), int(params.get("page_size",50))
    offset = (page-1)*size
    where, binds = "WHERE student_id=?", [user["id"]]
    if params.get("exercise_id"): where += " AND exercise_id=?"; binds.append(int(params["exercise_id"]))
    if params.get("language"): where += " AND language=?"; binds.append(params["language"])
    with db_cursor() as c:
        c.execute(f"SELECT COUNT(*) FROM code_pool {where}", binds); total = c.fetchone()[0]
        c.execute(f"""SELECT cp.*, e.title as exercise_title, e.difficulty as exercise_difficulty
                     FROM code_pool cp LEFT JOIN exercises e ON e.id=cp.exercise_id
                     {where} ORDER BY cp.is_saved DESC, cp.updated_at DESC LIMIT ? OFFSET ?""", binds + [size, offset])
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": {"items": rows, "total": total, "page": page, "page_size": size}}

@app.get("/api/code-pool/{pid}")
async def get_code(pid: int, user=Depends(require_auth)):
    with db_cursor() as c:
        c.execute("SELECT * FROM code_pool WHERE id=? AND student_id=?", (pid, user["id"]))
        row = c.fetchone()
        if not row: raise HTTPException(404)
        return {"code": 0, "data": dict(row)}

@app.post("/api/code-pool")
async def save_code(request: Request, user=Depends(require_auth)):
    body = await request.json()
    if not body.get("code","").strip(): raise HTTPException(400, "代码不能为空")
    with db_cursor() as c:
        c.execute("INSERT INTO code_pool(student_id,exercise_id,title,language,code,is_saved) VALUES(?,?,?,?,?,1)",
                  (user["id"], body.get("exercise_id"), body.get("title","Untitled"), body.get("language","python"), body["code"]))
    return {"code": 0, "message": "Saved", "data": {"id": c.lastrowid}}

@app.put("/api/code-pool/{pid}")
async def update_code(pid: int, request: Request, user=Depends(require_auth)):
    body = await request.json()
    with db_cursor() as c:
        c.execute("SELECT id FROM code_pool WHERE id=? AND student_id=?", (pid, user["id"]))
        if not c.fetchone(): raise HTTPException(404)
        c.execute("UPDATE code_pool SET title=?,code=?,language=?,is_saved=1 WHERE id=?",
                  (body.get("title","Untitled"), body.get("code",""), body.get("language","python"), pid))
    return {"code": 0, "message": "Updated"}

@app.delete("/api/code-pool/{pid}")
async def delete_code(pid: int, user=Depends(require_auth)):
    with db_cursor() as c:
        c.execute("DELETE FROM code_pool WHERE id=? AND student_id=?", (pid, user["id"]))
    return {"code": 0, "message": "Deleted"}

# ================================================================
# EXECUTOR API (direct run, no save)
# ================================================================
@app.post("/api/execute")
async def execute_direct(request: Request, user=Depends(require_auth)):
    body = await request.json()
    code = body.get("code", "")
    language = body.get("language", "python")
    if not code.strip(): raise HTTPException(400, "代码不能为空")
    if language not in LANG_CONFIG: raise HTTPException(400, "不支持的语言")
    result = execute_code_sandbox(code, language, body.get("input",""), int(body.get("time_limit",10)))
    return {"code": 0, "data": result}

# ================================================================
# USERS API (teacher/admin)
# ================================================================
@app.get("/api/users")
async def list_users(request: Request, user=Depends(require_auth)):
    if user["role"] not in ("teacher","admin"): raise HTTPException(403)
    params = dict(request.query_params)
    page, size = int(params.get("page",1)), int(params.get("page_size",20))
    offset = (page-1)*size
    role = params.get("role","")
    search = params.get("search","")
    where, binds = "WHERE 1=1", []
    if role: where += " AND role=?"; binds.append(role)
    if search: where += " AND (username LIKE ? OR email LIKE ? OR student_number LIKE ?)"; binds.extend([f"%{search}%"]*3)
    with db_cursor() as c:
        c.execute(f"SELECT COUNT(*) FROM users {where}", binds); total = c.fetchone()[0]
        c.execute(f"""SELECT u.id,u.username,u.email,u.role,u.avatar,u.nickname,u.student_number,u.class_name,u.status,u.last_login_at,u.created_at,
                     (SELECT COUNT(*) FROM submissions WHERE student_id=u.id) as submission_count,
                     (SELECT COUNT(DISTINCT exercise_id) FROM submissions WHERE student_id=u.id AND status='accepted') as solved_count
                     FROM users u {where} ORDER BY u.id LIMIT ? OFFSET ?""", binds + [size, offset])
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": {"items": rows, "total": total, "page": page, "page_size": size}}

# ================================================================
# ADMIN USER MANAGEMENT (更完善的管理员权限)
# ================================================================
@app.put("/api/admin/users/{uid}/role")
async def update_user_role(uid: int, request: Request, user=Depends(require_auth)):
    """Admin: update user role."""
    if user["role"] != "admin": raise HTTPException(403, "Admin only")
    body = await request.json()
    new_role = body.get("role", "")
    if new_role not in ("student", "teacher", "admin"): raise HTTPException(400, "无效的角色类型")
    with db_cursor() as c:
        if uid == user["id"]: raise HTTPException(400, "不能修改自己的角色")
        c.execute("SELECT id,role FROM users WHERE id=?", (uid,))
        row = c.fetchone()
        if not row: raise HTTPException(404, "用户不存在")
        c.execute("UPDATE users SET role=?, updated_at=datetime('now','localtime') WHERE id=?", (new_role, uid))
    return {"code": 0, "message": f"User role updated to {new_role}"}

@app.post("/api/admin/users/batch-create")
async def admin_batch_create_users(request: Request, user=Depends(require_auth)):
    """Admin: batch create users (teacher/student)."""
    if user["role"] != "admin": raise HTTPException(403, "Admin only")
    body = await request.json()
    users = body.get("users", [])
    default_password = body.get("password", "")
    if not users: raise HTTPException(400, "No users provided")
    if len(default_password) < 6: raise HTTPException(400, "Default password must be >= 6 chars")
    if len(users) > 50: raise HTTPException(400, "Max 50 users per batch")

    created = []
    errors = []
    with db_cursor() as c:
        for i, u in enumerate(users):
            username = (u.get("username") or "").strip()
            email = (u.get("email") or "").strip()
            role = u.get("role", "student")
            if not username or not email:
                errors.append(f"#{i+1}: username/email required")
                continue
            if role not in ("student", "teacher"):
                errors.append(f"#{i+1}: invalid role")
                continue
            if len(username) < 3 or len(username) > 20:
                errors.append(f"#{i+1} ({username}): username must be 3-20 chars")
                continue
            c.execute("SELECT id FROM users WHERE username=? OR email=?", (username, email))
            if c.fetchone():
                errors.append(f"#{i+1} ({username}): already exists")
                continue
            avatar = AVATAR_COLORS[hash(username) % len(AVATAR_COLORS)]
            nickname = u.get("nickname", "")
            student_number = u.get("student_number", "")
            class_name = u.get("class_name", "")
            c.execute("INSERT INTO users(username,email,password,role,avatar,nickname,student_number,class_name) VALUES(?,?,?,?,?,?,?,?)",
                      (username, email, _hash_password(default_password), role, avatar, nickname, student_number, class_name))
            created.append({"id": c.lastrowid, "username": username, "email": email, "role": role})

    return {"code": 0, "message": f"Created {len(created)} users", "data": {"created": created, "errors": errors, "created_count": len(created), "error_count": len(errors)}}

@app.delete("/api/admin/users/{uid}")
async def delete_user(uid: int, user=Depends(require_auth)):
    """Admin: delete a user account and all related data."""
    if user["role"] != "admin": raise HTTPException(403, "Admin only")
    with db_cursor() as c:
        if uid == user["id"]: raise HTTPException(400, "Cannot delete yourself")
        c.execute("SELECT id, username FROM users WHERE id=?", (uid,))
        target = c.fetchone()
        if not target: raise HTTPException(404, "User not found")
        # 手动清理关联数据
        c.execute("DELETE FROM discussion_members WHERE user_id=?", (uid,))
        c.execute("DELETE FROM discussion_posts WHERE user_id=?", (uid,))
        c.execute("DELETE FROM task_submissions WHERE student_id=?", (uid,))
        c.execute("DELETE FROM submissions WHERE student_id=?", (uid,))
        c.execute("DELETE FROM code_pool WHERE student_id=?", (uid,))
        c.execute("DELETE FROM course_enrollments WHERE student_id=?", (uid,))
        # 删除用户上传的网盘文件（物理文件）
        c.execute("SELECT file_path FROM netdisk_files WHERE uploaded_by=?", (uid,))
        for fr in c.fetchall():
            try: Path(fr["file_path"]).unlink(missing_ok=True)
            except: pass
        c.execute("DELETE FROM netdisk_files WHERE uploaded_by=?", (uid,))
        # 删除用户上传的讨论附件（物理文件）
        c.execute("SELECT file_path FROM discussion_files WHERE uploaded_by=?", (uid,))
        for fr in c.fetchall():
            try: Path(fr["file_path"]).unlink(missing_ok=True)
            except: pass
        c.execute("DELETE FROM discussion_files WHERE uploaded_by=?", (uid,))
        # 如果用户是教师，不删除其创建的课程（保留课程数据）
        # 最后删除用户
        c.execute("DELETE FROM users WHERE id=?", (uid,))
    return {"code": 0, "message": f"User '{target['username']}' deleted"}

@app.put("/api/admin/users/{uid}/reset-password")
async def admin_reset_password(uid: int, request: Request, user=Depends(require_auth)):
    """Admin: reset user password."""
    if user["role"] != "admin": raise HTTPException(403, "Admin only")
    body = await request.json()
    new_pw = body.get("password", "")
    if len(new_pw) < 6: raise HTTPException(400, "Password must be >= 6 chars")
    with db_cursor() as c:
        c.execute("SELECT id FROM users WHERE id=?", (uid,))
        if not c.fetchone(): raise HTTPException(404, "用户不存在")
        c.execute("UPDATE users SET password=?, updated_at=datetime('now','localtime') WHERE id=?",
                  (_hash_password(new_pw), uid))
    return {"code": 0, "message": "Password reset"}

@app.get("/api/admin/settings")
async def get_settings(user=Depends(require_auth)):
    """Admin: get all system settings."""
    if user["role"] != "admin": raise HTTPException(403, "Admin only")
    with db_cursor() as c:
        c.execute("SELECT * FROM system_settings")
        rows = {r["key"]: r["value"] for r in c.fetchall()}
    return {"code": 0, "data": rows}

@app.put("/api/admin/settings")
async def update_settings(request: Request, user=Depends(require_auth)):
    """Admin: update system settings."""
    if user["role"] != "admin": raise HTTPException(403, "Admin only")
    body = await request.json()
    allowed_keys = {"site_name", "site_description", "register_enabled", "default_netdisk_quota"}
    with db_cursor() as c:
        for key, value in body.items():
            if key in allowed_keys:
                c.execute("INSERT OR REPLACE INTO system_settings(key,value,updated_at) VALUES(?,?,datetime('now','localtime'))",
                          (key, str(value)))
    return {"code": 0, "message": "Settings updated"}

@app.get("/api/admin/plugins")
async def list_plugins(user=Depends(require_auth)):
    """Admin: list loaded plugins."""
    if user["role"] != "admin": raise HTTPException(403, "Admin only")
    return {"code": 0, "data": [{"name": p.get("name","?"), "version": p.get("version","?"), "description": p.get("description",""),
                                  "status": "loaded" if p.get("_loaded") else "error"} for p in _loaded_plugins]}

# ================================================================
# DASHBOARD API
# ================================================================
@app.get("/api/dashboard")
async def dashboard(user=Depends(require_auth)):
    with db_cursor() as c:
        if user["role"] == "student":
            c.execute("""SELECT
                (SELECT COUNT(*) FROM submissions WHERE student_id=?) as total_submissions,
                (SELECT COUNT(DISTINCT exercise_id) FROM submissions WHERE student_id=? AND status='accepted') as solved_count,
                (SELECT COUNT(*) FROM code_pool WHERE student_id=? AND is_saved=1) as saved_codes,
                (SELECT COUNT(*) FROM course_enrollments WHERE student_id=?) as course_count,
                (SELECT COUNT(*) FROM exercises WHERE status=1) as total_exercises,
                (SELECT COUNT(*) FROM task_submissions WHERE student_id=?) as task_submissions,
                (SELECT COUNT(*) FROM task_submissions WHERE student_id=? AND status='graded') as tasks_graded""", (user["id"],)*4 + (user["id"],)*2)
        elif user["role"] == "teacher":
            c.execute("""SELECT
                (SELECT COUNT(*) FROM courses WHERE teacher_id=?) as my_courses,
                (SELECT COUNT(*) FROM exercises WHERE created_by=? AND status=1) as my_exercises,
                (SELECT COUNT(*) FROM users WHERE role='student') as total_students,
                (SELECT COUNT(*) FROM submissions) as total_submissions,
                (SELECT COUNT(*) FROM tasks WHERE created_by=?) as my_tasks,
                (SELECT COUNT(*) FROM task_submissions WHERE status='pending') as pending_grades""", (user["id"], user["id"], user["id"]))
        else:
            c.execute("""SELECT
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM users WHERE role='student') as total_students,
                (SELECT COUNT(*) FROM courses WHERE status=1) as total_courses,
                (SELECT COUNT(*) FROM exercises WHERE status=1) as total_exercises,
                (SELECT COUNT(*) FROM submissions) as total_submissions,
                (SELECT COUNT(*) FROM submissions WHERE status='accepted') as total_accepted,
                (SELECT COUNT(*) FROM submissions WHERE date(submitted_at)=date('now','localtime')) as today_submissions,
                (SELECT COUNT(*) FROM netdisk_folders) as netdisk_count,
                (SELECT COUNT(*) FROM tasks) as task_count,
                (SELECT COUNT(*) FROM discussions) as discussion_count,
                (SELECT COUNT(*) FROM system_settings) as settings_count""")
        row = dict(c.fetchone())
    return {"code": 0, "data": row}

# ================================================================
# ANNOUNCEMENTS API
# ================================================================
@app.get("/api/announcements")
async def list_announcements(request: Request, user=Depends(require_auth)):
    params = dict(request.query_params)
    with db_cursor() as c:
        if params.get("course_id"):
            c.execute("""SELECT a.*, u.username as author_name FROM announcements a
                         JOIN users u ON u.id=a.author_id WHERE a.course_id=? ORDER BY a.priority DESC, a.created_at DESC""", (int(params["course_id"]),))
        else:
            c.execute("""SELECT a.*, u.username as author_name FROM announcements a
                         JOIN users u ON u.id=a.author_id ORDER BY a.priority DESC, a.created_at DESC LIMIT 20""")
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": rows}

@app.post("/api/announcements")
async def create_announcement(request: Request, user=Depends(require_auth)):
    if user["role"] not in ("teacher","admin"): raise HTTPException(403)
    body = await request.json()
    with db_cursor() as c:
        c.execute("INSERT INTO announcements(course_id,author_id,title,content,priority) VALUES(?,?,?,?,?)",
                  (body.get("course_id"), user["id"], body.get("title",""), body.get("content",""), body.get("priority",0)))
    return {"code": 0, "message": "Published", "data": {"id": c.lastrowid}}

# ================================================================
# PROFILE API
# ================================================================
@app.get("/api/auth/me")
async def me(user=Depends(require_auth)):
    with db_cursor() as c:
        c.execute("SELECT id,username,email,role,avatar,nickname,student_number,class_name,last_login_at,created_at FROM users WHERE id=?", (user["id"],))
        row = c.fetchone()
        if not row: raise HTTPException(404, "用户不存在")
        return {"code": 0, "data": dict(row)}

@app.put("/api/profile")
async def update_profile(request: Request, user=Depends(require_auth)):
    body = await request.json()
    with db_cursor() as c:
        sets, vals = [], []
        for field in ("nickname", "avatar", "email", "student_number", "class_name"):
            if field in body:
                sets.append(f"{field}=?")
                vals.append(body[field])
        if not sets: raise HTTPException(400, "Nothing to update")
        vals.append(user["id"])
        c.execute(f"UPDATE users SET {','.join(sets)}, updated_at=datetime('now','localtime') WHERE id=?", vals)
    return {"code": 0, "message": "Profile updated"}

@app.put("/api/change-password")
async def change_password(request: Request, user=Depends(require_auth)):
    body = await request.json()
    old_pw, new_pw = body.get("old_password", ""), body.get("new_password", "")
    if not old_pw or not new_pw: raise HTTPException(400, "Both passwords required")
    if len(new_pw) < 6: raise HTTPException(400, "New password must be >= 6 chars")
    with db_cursor() as c:
        c.execute("SELECT password FROM users WHERE id=?", (user["id"],))
        row = c.fetchone()
        if not row or not _verify_password(old_pw, row["password"]):
            raise HTTPException(400, "Old password incorrect")
        c.execute("UPDATE users SET password=?, updated_at=datetime('now','localtime') WHERE id=?",
                  (_hash_password(new_pw), user["id"]))
    return {"code": 0, "message": "Password changed"}

# ================================================================
# CLASSES API (班级管理)
# ================================================================
@app.get("/api/classes")
async def list_classes(user=Depends(require_auth)):
    with db_cursor() as c:
        c.execute("""SELECT cl.*, u.username as creator_name,
                     (SELECT COUNT(*) FROM discussions WHERE class_id=cl.id AND status=1) as discussion_count,
                     (SELECT COUNT(*) FROM users WHERE class_name=cl.name AND role='student' AND status=1) as student_count
                     FROM classes cl LEFT JOIN users u ON u.id=cl.created_by
                     WHERE cl.status=1 ORDER BY cl.id""")
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": rows}

@app.post("/api/classes")
async def create_class(request: Request, user=Depends(require_auth)):
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "只有教师/管理员可以创建班级")
    body = await request.json()
    if not body.get("name"): raise HTTPException(400, "班级名称不能为空")
    with db_cursor() as c:
        # 检查是否有已删除的同名班级，如果有则恢复
        c.execute("SELECT id, status FROM classes WHERE name=?", (body["name"],))
        existing = c.fetchone()
        if existing and existing["status"] == 0:
            # 恢复已删除的班级
            c.execute("UPDATE classes SET status=1, description=?, created_by=?, created_at=datetime('now','localtime') WHERE id=?",
                      (body.get("description", ""), user["id"], existing["id"]))
            cid = existing["id"]
        elif existing and existing["status"] == 1:
            raise HTTPException(400, f"班级名称「{body['name']}」已存在")
        else:
            # 分配可回收 ID
            new_id = _alloc_id('classes', c)
            c.execute("INSERT INTO classes(id,name,description,created_by) VALUES(?,?,?,?)",
                      (new_id, body["name"], body.get("description"), user["id"]))
            cid = new_id
    return {"code": 0, "message": "Class created", "data": {"id": cid}}

@app.put("/api/classes/{cid}")
async def update_class(cid: int, request: Request, user=Depends(require_auth)):
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403)
    body = await request.json()
    with db_cursor() as c:
        c.execute("SELECT id FROM classes WHERE id=?", (cid,))
        if not c.fetchone(): raise HTTPException(404, "班级不存在")
        c.execute("UPDATE classes SET name=?,description=? WHERE id=?",
                  (body.get("name",""), body.get("description"), cid))
    return {"code": 0, "message": "Updated"}

@app.delete("/api/classes/{cid}")
async def delete_class(cid: int, user=Depends(require_auth)):
    if user["role"] != "admin": raise HTTPException(403, "Admin only")
    with db_cursor() as c:
        c.execute("UPDATE classes SET status=0 WHERE id=?", (cid,))
    return {"code": 0, "message": "Deleted"}


@app.get("/api/classes/{cid}/students")
async def class_students(cid: int, user=Depends(require_auth)):
    """获取班级中的学生列表"""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "无权限")
    with db_cursor() as c:
        c.execute("SELECT name FROM classes WHERE id=? AND status=1", (cid,))
        cls = c.fetchone()
        if not cls: raise HTTPException(404, "班级不存在")
        c.execute("""SELECT id, username, nickname, student_number, email, status, created_at
                     FROM users WHERE class_name=? AND role='student' AND status=1
                     ORDER BY student_number, id""", (cls["name"],))
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": rows}


@app.get("/api/classes/{cid}/available-students")
async def class_available_students(cid: int, request: Request, user=Depends(require_auth)):
    """获取未被分配到该班级的学生列表（可用于添加到班级）"""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "无权限")
    params = dict(request.query_params)
    search = params.get("search", "")
    with db_cursor() as c:
        c.execute("SELECT name FROM classes WHERE id=? AND status=1", (cid,))
        cls = c.fetchone()
        if not cls: raise HTTPException(404, "班级不存在")
        where = "WHERE role='student' AND status=1"
        binds = []
        if search:
            where += " AND (username LIKE ? OR nickname LIKE ? OR student_number LIKE ?)"
            binds.extend([f"%{search}%"] * 3)
        c.execute(f"""SELECT id, username, nickname, student_number, email, class_name, created_at
                     FROM users {where} ORDER BY id LIMIT 200""", binds)
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": rows}


@app.post("/api/classes/{cid}/students")
async def add_students_to_class(cid: int, request: Request, user=Depends(require_auth)):
    """批量将学生添加到班级（更新 users.class_name）"""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "无权限")
    body = await request.json()
    student_ids = body.get("student_ids", [])
    if not student_ids: raise HTTPException(400, "请选择要添加的学生")
    if len(student_ids) > 100: raise HTTPException(400, "单次最多添加 100 名学生")
    with db_cursor() as c:
        c.execute("SELECT name FROM classes WHERE id=? AND status=1", (cid,))
        cls = c.fetchone()
        if not cls: raise HTTPException(404, "班级不存在")
        class_name = cls["name"]
        updated = 0
        for sid in student_ids:
            c.execute("UPDATE users SET class_name=? WHERE id=? AND role='student' AND status=1", (class_name, sid))
            if c.rowcount > 0:
                updated += 1
    return {"code": 0, "message": f"已将 {updated} 名学生添加到班级「{class_name}」"}


@app.delete("/api/classes/{cid}/students/{sid}")
async def remove_student_from_class(cid: int, sid: int, user=Depends(require_auth)):
    """将学生从班级中移除（清除 class_name）"""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "无权限")
    with db_cursor() as c:
        c.execute("SELECT name FROM classes WHERE id=? AND status=1", (cid,))
        cls = c.fetchone()
        if not cls: raise HTTPException(404, "班级不存在")
        c.execute("UPDATE users SET class_name=NULL WHERE id=? AND class_name=? AND role='student'", (sid, cls["name"]))
        if c.rowcount == 0: raise HTTPException(404, "该学生不在此班级中")
    return {"code": 0, "message": "已从班级中移除"}





# ================================================================
# DISCUSSIONS API (班级讨论区)
# ================================================================
@app.get("/api/discussions")
async def list_discussions(user=Depends(require_auth)):
    with db_cursor() as c:
        if user["role"] in ("teacher", "admin"):
            # 教师/管理员看所有讨论区（含成员信息）
            c.execute("""SELECT d.*, dm.role as my_role, dm.muted as is_muted,
                         (SELECT COUNT(*) FROM discussion_members WHERE discussion_id=d.id) as member_count,
                         (SELECT COUNT(*) FROM discussion_posts WHERE discussion_id=d.id) as post_count,
                         cl.name as class_name
                         FROM discussions d
                         LEFT JOIN discussion_members dm ON dm.discussion_id=d.id AND dm.user_id=?
                         LEFT JOIN classes cl ON cl.id=d.class_id
                         WHERE d.status=1 ORDER BY d.id""", (user["id"],))
        else:
            # 学生：全局讨论区所有人可见，班级讨论区看已加入的，个人讨论区看自己的
            c.execute("""SELECT d.*, dm.role as my_role, dm.muted as is_muted,
                         (SELECT COUNT(*) FROM discussion_members WHERE discussion_id=d.id) as member_count,
                         (SELECT COUNT(*) FROM discussion_posts WHERE discussion_id=d.id) as post_count,
                         cl.name as class_name
                         FROM discussions d
                         LEFT JOIN discussion_members dm ON dm.discussion_id=d.id AND dm.user_id=?
                         LEFT JOIN classes cl ON cl.id=d.class_id
                         WHERE d.status=1
                           AND (d.scope='global'
                                OR (d.scope='class' AND dm.id IS NOT NULL)
                                OR (d.scope='personal' AND d.created_by=?))
                         ORDER BY d.id""", (user["id"], user["id"]))
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": rows}

@app.post("/api/discussions")
async def create_discussion(request: Request, user=Depends(require_auth)):
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "Only teachers/admins can create discussions")
    body = await request.json()
    if not body.get("title"): raise HTTPException(400, "Title required")
    scope = body.get("scope", "global")
    if scope not in ("global", "class", "personal"): scope = "global"
    class_id = body.get("class_id") or None
    with db_cursor() as c:
        new_id = _alloc_id('discussions', c)
        c.execute("INSERT INTO discussions(id,title,description,scope,class_id,created_by) VALUES(?,?,?,?,?,?)",
                  (new_id, body["title"], body.get("description"), scope, class_id, user["id"]))
        did = new_id
        c.execute("INSERT INTO discussion_members(discussion_id,user_id,role) VALUES(?,?,?)", (did, user["id"], "admin"))
        # 班级范围：自动加入该班级所有学生
        if scope == "class" and class_id:
            c.execute("SELECT id FROM users WHERE class_name=(SELECT name FROM classes WHERE id=?) AND status=1 AND role='student'", (class_id,))
            for row in c.fetchall():
                c.execute("INSERT OR IGNORE INTO discussion_members(discussion_id,user_id,role) VALUES(?,?,?)", (did, row["id"], "member"))
    return {"code": 0, "message": "Discussion created", "data": {"id": did}}

@app.delete("/api/discussions/{did}")
async def delete_discussion(did: int, user=Depends(require_auth)):
    """删除讨论区（仅教师/管理员，且须为该讨论区的 admin）"""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "No permission")
    with db_cursor() as c:
        c.execute("SELECT created_by FROM discussions WHERE id=? AND status=1", (did,))
        disc = c.fetchone()
        if not disc: raise HTTPException(404, "讨论区不存在")
        # 非 admin 角色只能删除自己创建的讨论区
        if user["role"] != "admin" and disc["created_by"] != user["id"]:
            raise HTTPException(403, "只能删除自己创建的讨论区")
        c.execute("UPDATE discussions SET status=0 WHERE id=?", (did,))
    return {"code": 0, "message": "Discussion deleted"}

@app.get("/api/discussions/{did}/posts")
async def list_posts(did: int, request: Request, user=Depends(require_auth)):
    params = dict(request.query_params)
    page, size = int(params.get("page", 1)), int(params.get("page_size", 30))
    offset = (page - 1) * size
    with db_cursor() as c:
        c.execute("SELECT scope FROM discussions WHERE id=? AND status=1", (did,))
        disc = c.fetchone()
        if not disc: raise HTTPException(404, "讨论区不存在")
        c.execute("SELECT role, muted FROM discussion_members WHERE discussion_id=? AND user_id=?", (did, user["id"]))
        mem = c.fetchone()
        # 全局讨论区所有人可见；班级/个人需要是成员
        if disc["scope"] != "global" and not mem and user["role"] not in ("teacher", "admin"):
            raise HTTPException(403, "不是该讨论区的成员")
        my_role = mem["role"] if mem else "guest"
        is_muted = mem["muted"] if mem else 0
        c.execute("""SELECT COUNT(*) FROM discussion_posts WHERE discussion_id=? AND parent_id IS NULL""", (did,))
        total = c.fetchone()[0]
        c.execute("""SELECT p.*, u.username, u.avatar, u.nickname, u.role as user_role,
                     (SELECT COUNT(*) FROM discussion_posts WHERE parent_id=p.id) as reply_count,
                     f.id as file_id, f.original_name as file_name, f.file_size
                     FROM discussion_posts p
                     JOIN users u ON u.id=p.user_id
                     LEFT JOIN discussion_files f ON f.id=p.file_id
                     WHERE p.discussion_id=? AND p.parent_id IS NULL
                     ORDER BY p.created_at DESC LIMIT ? OFFSET ?""", (did, size, offset))
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": {"items": rows, "total": total, "page": page, "page_size": size, "my_role": my_role, "is_muted": is_muted}}

@app.get("/api/discussions/{did}/posts/{pid}/replies")
async def list_replies(did: int, pid: int, user=Depends(require_auth)):
    with db_cursor() as c:
        c.execute("SELECT scope FROM discussions WHERE id=? AND status=1", (did,))
        disc = c.fetchone()
        if not disc: raise HTTPException(404, "Discussion not found")
        c.execute("SELECT id FROM discussion_members WHERE discussion_id=? AND user_id=?", (did, user["id"]))
        mem = c.fetchone()
        if disc["scope"] != "global" and not mem and user["role"] not in ("teacher", "admin"):
            raise HTTPException(403, "Not a member")
        c.execute("""SELECT p.*, u.username, u.avatar, u.nickname, u.role as user_role,
                     f.id as file_id, f.original_name as file_name, f.file_size
                     FROM discussion_posts p
                     JOIN users u ON u.id=p.user_id
                     LEFT JOIN discussion_files f ON f.id=p.file_id
                     WHERE p.discussion_id=? AND p.parent_id=?
                     ORDER BY p.created_at ASC""", (did, pid))
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": rows}

@app.post("/api/discussions/{did}/posts")
async def create_post(did: int, request: Request, user=Depends(require_auth)):
    body = await request.json()
    if not body.get("content", "").strip(): raise HTTPException(400, "Content required")
    with db_cursor() as c:
        c.execute("SELECT scope FROM discussions WHERE id=? AND status=1", (did,))
        disc = c.fetchone()
        if not disc: raise HTTPException(404, "Discussion not found")
        c.execute("SELECT role, muted FROM discussion_members WHERE discussion_id=? AND user_id=?", (did, user["id"]))
        mem = c.fetchone()
        # 全局讨论区：所有登录用户可发帖（非成员也行）
        if disc["scope"] != "global" and not mem and user["role"] not in ("teacher", "admin"):
            raise HTTPException(403, "Not a member")
        if mem and mem["muted"]: raise HTTPException(403, "You have been muted")
        c.execute("INSERT INTO discussion_posts(discussion_id,user_id,content,file_id,parent_id) VALUES(?,?,?,?,?)",
                  (did, user["id"], body["content"], body.get("file_id"), body.get("parent_id")))
        pid = c.lastrowid
    return {"code": 0, "message": "Posted", "data": {"id": pid}}

@app.delete("/api/discussions/{did}/posts/{pid}")
async def delete_post(did: int, pid: int, request: Request, user=Depends(require_auth)):
    """Teacher/admin: delete a discussion post (and its replies)."""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "No permission")
    with db_cursor() as c:
        # Verify membership
        c.execute("SELECT role FROM discussion_members WHERE discussion_id=? AND user_id=?", (did, user["id"]))
        if not c.fetchone(): raise HTTPException(403, "Not a member")
        # Check post exists
        c.execute("SELECT id FROM discussion_posts WHERE id=? AND discussion_id=?", (pid, did))
        if not c.fetchone(): raise HTTPException(404, "帖子不存在")
        # Delete replies first, then the post itself
        c.execute("DELETE FROM discussion_posts WHERE parent_id=?", (pid,))
        c.execute("DELETE FROM discussion_posts WHERE id=?", (pid,))
    return {"code": 0, "message": "Post deleted"}

# -- Discussion file upload (files expire after 7 days) --
@app.post("/api/discussions/{did}/files")
async def upload_discussion_file(did: int, request: Request, user=Depends(require_auth)):
    form = await request.form()
    file = form.get("file")
    if not file: raise HTTPException(400, "No file uploaded")
    # 教师/管理员无大小限制，学生限制 10MB
    if user["role"] == "student":
        MAX_SIZE = 10 * 1024 * 1024
        content = await file.read()
        if len(content) > MAX_SIZE: raise HTTPException(400, "File too large (max 10MB)")
    else:
        content = await file.read()
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename).suffix if file.filename else ""
    file_id = uuid.uuid4().hex[:12]
    stored_name = f"disc_{file_id}{ext}"
    file_path = UPLOAD_DIR / stored_name
    with open(file_path, "wb") as f:
        f.write(content)
    with db_cursor() as c:
        c.execute("SELECT id FROM discussion_members WHERE discussion_id=? AND user_id=?", (did, user["id"]))
        if not c.fetchone(): raise HTTPException(403, "Not a member")
        c.execute("INSERT INTO discussion_files(discussion_id,uploaded_by,filename,original_name,file_size,file_path) VALUES(?,?,?,?,?,?)",
                  (did, user["id"], stored_name, file.filename, len(content), str(file_path)))
        fid = c.lastrowid
    return {"code": 0, "message": "Uploaded", "data": {"id": fid, "filename": file.filename, "size": len(content)}}

@app.get("/api/files/{fid}/download")
async def download_file(fid: int, user=Depends(require_auth)):
    """Download a discussion file or netdisk file."""
    import mimetypes
    with db_cursor() as c:
        # Try discussion_files first
        c.execute("SELECT * FROM discussion_files WHERE id=?", (fid,))
        row = c.fetchone()
        if row:
            fpath = Path(row["file_path"])
            if fpath.exists():
                mime, _ = mimetypes.guess_type(str(fpath))
                return FileResponse(
                    str(fpath),
                    filename=row["original_name"],
                    media_type=mime or "application/octet-stream",
                )
        # Try netdisk_files
        c.execute("SELECT * FROM netdisk_files WHERE id=?", (fid,))
        row = c.fetchone()
        if row:
            fpath = Path(row["file_path"])
            if not fpath.exists(): raise HTTPException(404, "File missing on disk")
            c.execute("UPDATE netdisk_files SET download_count=download_count+1 WHERE id=?", (fid,))
            mime, _ = mimetypes.guess_type(str(fpath))
            return FileResponse(
                str(fpath),
                filename=row["original_name"],
                media_type=mime or "application/octet-stream",
            )
    raise HTTPException(404, "File not found")

@app.get("/api/files/{fid}/preview")
async def preview_file(fid: int, user=Depends(require_auth)):
    """Preview a file inline in the browser (images, pdfs, etc.)."""
    import mimetypes
    with db_cursor() as c:
        c.execute("SELECT * FROM discussion_files WHERE id=?", (fid,))
        row = c.fetchone()
        if row:
            fpath = Path(row["file_path"])
            if fpath.exists():
                mime, _ = mimetypes.guess_type(str(fpath))
                return FileResponse(
                    str(fpath),
                    media_type=mime or "application/octet-stream",
                    filename=row["original_name"],
                )
        c.execute("SELECT * FROM netdisk_files WHERE id=?", (fid,))
        row = c.fetchone()
        if row:
            fpath = Path(row["file_path"])
            if not fpath.exists(): raise HTTPException(404, "File missing on disk")
            mime, _ = mimetypes.guess_type(str(fpath))
            return FileResponse(
                str(fpath),
                media_type=mime or "application/octet-stream",
                filename=row["original_name"],
            )
    raise HTTPException(404, "File not found")

# -- Discussion management (kick, mute, add member) --
@app.post("/api/discussions/{did}/members")
async def add_member(did: int, request: Request, user=Depends(require_auth)):
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403)
    body = await request.json()
    target_uid = body.get("user_id")
    if not target_uid: raise HTTPException(400, "user_id required")
    with db_cursor() as c:
        c.execute("SELECT role FROM discussion_members WHERE discussion_id=? AND user_id=?", (did, user["id"]))
        if not c.fetchone(): raise HTTPException(403, "Not a member")
        c.execute("INSERT OR IGNORE INTO discussion_members(discussion_id,user_id,role) VALUES(?,?,?)", (did, target_uid, body.get("role", "member")))
    return {"code": 0, "message": "Member added"}

@app.delete("/api/discussions/{did}/members/{uid}")
async def remove_member(did: int, uid: int, request: Request, user=Depends(require_auth)):
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403)
    with db_cursor() as c:
        c.execute("SELECT role FROM discussion_members WHERE discussion_id=? AND user_id=?", (did, user["id"]))
        if not c.fetchone(): raise HTTPException(403, "Not a member")
        if uid == user["id"]: raise HTTPException(400, "Cannot remove yourself")
        c.execute("DELETE FROM discussion_members WHERE discussion_id=? AND user_id=?", (did, uid))
    return {"code": 0, "message": "Member removed"}

@app.put("/api/discussions/{did}/members/{uid}/mute")
async def toggle_mute(did: int, uid: int, request: Request, user=Depends(require_auth)):
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403)
    body = await request.json()
    with db_cursor() as c:
        c.execute("SELECT role FROM discussion_members WHERE discussion_id=? AND user_id=?", (did, user["id"]))
        if not c.fetchone(): raise HTTPException(403, "Not a member")
        muted = 1 if body.get("muted") else 0
        c.execute("UPDATE discussion_members SET muted=? WHERE discussion_id=? AND user_id=?", (muted, did, uid))
    return {"code": 0, "message": f"Member {'muted' if muted else 'unmuted'}"}

@app.get("/api/discussions/{did}/members")
async def list_members(did: int, user=Depends(require_auth)):
    with db_cursor() as c:
        c.execute("SELECT id FROM discussion_members WHERE discussion_id=? AND user_id=?", (did, user["id"]))
        if not c.fetchone(): raise HTTPException(403, "Not a member")
        c.execute("""SELECT dm.*, u.username, u.nickname, u.avatar, u.role as user_role, u.student_number, u.class_name
                     FROM discussion_members dm JOIN users u ON u.id=dm.user_id
                     WHERE dm.discussion_id=? ORDER BY dm.role, dm.joined_at""", (did,))
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": rows}


# ================================================================
# NETDISK API (班级网盘)
# ================================================================
@app.get("/api/netdisk")
async def list_netdisks(user=Depends(require_auth)):
    """List netdisk folders accessible to the user."""
    with db_cursor() as c:
        if user["role"] in ("teacher", "admin"):
            c.execute("""SELECT nf.*, d.title as discussion_name, cl.name as class_name,
                         (SELECT COUNT(*) FROM netdisk_files WHERE folder_id=nf.id) as file_count,
                         (SELECT COALESCE(SUM(file_size),0) FROM netdisk_files WHERE folder_id=nf.id) as used_size
                         FROM netdisk_folders nf
                         LEFT JOIN discussions d ON d.id=nf.discussion_id
                         LEFT JOIN classes cl ON cl.id=nf.class_id
                         WHERE nf.status=1 ORDER BY nf.id""")
        else:
            # 学生：全局网盘 + 所在班级网盘 + 已加入讨论区的网盘
            c.execute("""SELECT nf.*, d.title as discussion_name, cl.name as class_name,
                         (SELECT COUNT(*) FROM netdisk_files WHERE folder_id=nf.id) as file_count,
                         (SELECT COALESCE(SUM(file_size),0) FROM netdisk_files WHERE folder_id=nf.id) as used_size
                         FROM netdisk_folders nf
                         LEFT JOIN discussions d ON d.id=nf.discussion_id
                         LEFT JOIN classes cl ON cl.id=nf.class_id
                         LEFT JOIN discussion_members dm ON dm.discussion_id=nf.discussion_id AND dm.user_id=?
                         WHERE nf.status=1
                           AND (nf.scope='global'
                                OR (nf.scope='class' AND cl.name=(SELECT class_name FROM users WHERE id=?))
                                OR (nf.scope='personal' AND nf.created_by=?)
                                OR (nf.discussion_id IS NOT NULL AND dm.id IS NOT NULL))
                         ORDER BY nf.id""", (user["id"], user["id"], user["id"]))
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": rows}

@app.post("/api/netdisk")
async def create_netdisk_folder(request: Request, user=Depends(require_auth)):
    """Admin/teacher: create an independent netdisk folder."""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403)
    body = await request.json()
    if not body.get("name"): raise HTTPException(400, "文件夹名称不能为空")
    scope = body.get("scope", "global")
    if scope not in ("global", "class", "personal"): scope = "global"
    class_id = body.get("class_id") or None
    max_size = min(max(int(body.get("max_size", 209715200)), 10485760), 10995116277760)
    with db_cursor() as c:
        new_id = _alloc_id('netdisk_folders', c)
        c.execute("INSERT INTO netdisk_folders(id,name,description,class_id,scope,max_size,created_by) VALUES(?,?,?,?,?,?,?)",
                  (new_id, body["name"], body.get("description"), class_id, scope, max_size, user["id"]))
        fid = new_id
        folder_path = NETDISK_DIR / f"manual_{fid}"
        folder_path.mkdir(parents=True, exist_ok=True)
    return {"code": 0, "message": "Folder created", "data": {"id": fid}}

@app.get("/api/netdisk/{fid}/files")
async def list_netdisk_files(fid: int, user=Depends(require_auth)):
    """List files in a netdisk folder."""
    with db_cursor() as c:
        c.execute("""SELECT nf.*, cl.name as class_name FROM netdisk_folders nf
                     LEFT JOIN classes cl ON cl.id=nf.class_id
                     WHERE nf.id=? AND nf.status=1""", (fid,))
        folder = c.fetchone()
        if not folder: raise HTTPException(404, "Folder not found")
        # 权限检查
        has_access = False
        if user["role"] in ("teacher", "admin"):
            has_access = True
        elif folder["scope"] == "global":
            has_access = True
        elif folder["scope"] == "class":
            c.execute("SELECT class_name FROM users WHERE id=?", (user["id"],))
            uc = c.fetchone()
            has_access = bool(uc and uc["class_name"] and uc["class_name"] == folder["class_name"])
        elif folder["scope"] == "personal":
            has_access = (folder["created_by"] == user["id"])
        if not has_access and folder["discussion_id"]:
            c.execute("SELECT id FROM discussion_members WHERE discussion_id=? AND user_id=?",
                      (folder["discussion_id"], user["id"]))
            has_access = bool(c.fetchone())
        if not has_access: raise HTTPException(403, "No access")
        c.execute("""SELECT f.*, u.username, u.nickname
                     FROM netdisk_files f JOIN users u ON u.id=f.uploaded_by
                     WHERE f.folder_id=? ORDER BY f.created_at DESC""", (fid,))
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": rows}

@app.post("/api/netdisk/{fid}/upload")
async def upload_netdisk_file(fid: int, request: Request, user=Depends(require_auth)):
    """Upload file to netdisk (teacher/admin only)."""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "Only teachers/admins can upload")
    with db_cursor() as c:
        c.execute("SELECT * FROM netdisk_folders WHERE id=?", (fid,))
        folder = c.fetchone()
        if not folder: raise HTTPException(404, "Folder not found")
        # Check quota
        c.execute("SELECT COALESCE(SUM(file_size),0) as used FROM netdisk_files WHERE folder_id=?", (fid,))
        used = c.fetchone()["used"]
        remaining = folder["max_size"] - used
        if remaining <= 0: raise HTTPException(400, "Netdisk quota exceeded")

    form = await request.form()
    file = form.get("file")
    if not file: raise HTTPException(400, "No file uploaded")
    content = await file.read()
    if len(content) > remaining:
        raise HTTPException(400, f"File too large. Remaining quota: {remaining // (1024*1024)}MB")

    ext = Path(file.filename).suffix if file.filename else ""
    file_id = uuid.uuid4().hex[:12]
    folder_path = NETDISK_DIR / str(fid)
    folder_path.mkdir(parents=True, exist_ok=True)
    stored_name = f"nd_{file_id}{ext}"
    file_path = folder_path / stored_name
    with open(file_path, "wb") as f:
        f.write(content)

    with db_cursor() as c:
        c.execute("INSERT INTO netdisk_files(folder_id,uploaded_by,filename,original_name,file_size,file_path) VALUES(?,?,?,?,?,?)",
                  (fid, user["id"], stored_name, file.filename, len(content), str(file_path)))
    return {"code": 0, "message": "Uploaded", "data": {"id": c.lastrowid, "filename": file.filename, "size": len(content)}}

@app.delete("/api/netdisk/files/{nfid}")
async def delete_netdisk_file(nfid: int, user=Depends(require_auth)):
    """Delete a netdisk file (teacher/admin only)."""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "Only teachers/admins can delete")
    with db_cursor() as c:
        c.execute("SELECT * FROM netdisk_files WHERE id=?", (nfid,))
        row = c.fetchone()
        if not row: raise HTTPException(404, "文件不存在")
        fpath = Path(row["file_path"])
        if fpath.exists(): fpath.unlink()
        c.execute("DELETE FROM netdisk_files WHERE id=?", (nfid,))
    return {"code": 0, "message": "File deleted"}

@app.delete("/api/netdisk/{fid}")
async def delete_netdisk_folder(fid: int, user=Depends(require_auth)):
    """删除网盘文件夹（教师/管理员，仅能删除自己创建的或管理员全删）"""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403, "No permission")
    with db_cursor() as c:
        c.execute("SELECT created_by FROM netdisk_folders WHERE id=? AND status=1", (fid,))
        folder = c.fetchone()
        if not folder: raise HTTPException(404, "网盘不存在")
        if user["role"] != "admin" and folder["created_by"] != user["id"]:
            raise HTTPException(403, "只能删除自己创建的网盘")
        # 删除该文件夹下所有文件（物理文件）
        c.execute("SELECT file_path FROM netdisk_files WHERE folder_id=?", (fid,))
        for fr in c.fetchall():
            try: Path(fr["file_path"]).unlink(missing_ok=True)
            except: pass
        c.execute("DELETE FROM netdisk_files WHERE folder_id=?", (fid,))
        c.execute("UPDATE netdisk_folders SET status=0 WHERE id=?", (fid,))
    return {"code": 0, "message": "Netdisk deleted"}

@app.put("/api/admin/netdisk/{fid}/quota")
async def update_netdisk_quota(fid: int, request: Request, user=Depends(require_auth)):
    """Admin: update netdisk folder quota."""
    if user["role"] not in ("admin", "teacher"): raise HTTPException(403)
    body = await request.json()
    new_quota = int(body.get("max_size", 209715200))
    if new_quota < 10485760: raise HTTPException(400, "Quota must be at least 10MB")
    with db_cursor() as c:
        c.execute("SELECT * FROM netdisk_folders WHERE id=?", (fid,))
        if not c.fetchone(): raise HTTPException(404, "Folder not found")
        c.execute("UPDATE netdisk_folders SET max_size=? WHERE id=?", (new_quota, fid))
    return {"code": 0, "message": f"Quota updated to {new_quota // (1024*1024)}MB"}


# ================================================================
# TASKS API (任务系统)
# ================================================================
@app.get("/api/tasks")
async def list_tasks(request: Request, user=Depends(require_auth)):
    """List tasks. Students see global + enrolled-course + their class tasks."""
    params = dict(request.query_params)
    page, size = int(params.get("page",1)), int(params.get("page_size",20))
    offset = (page-1)*size
    with db_cursor() as c:
        if user["role"] == "student":
            # 学生：全局任务 + 已选课任务 + 自己班级的任务
            c.execute("""SELECT COUNT(*) FROM tasks t
                         LEFT JOIN course_enrollments ce ON ce.course_id=t.course_id AND ce.student_id=?
                         LEFT JOIN classes cl ON cl.id=t.class_id
                         WHERE t.status=1
                           AND (t.scope='global'
                                OR (t.scope='course' AND ce.id IS NOT NULL)
                                OR (t.scope='class' AND cl.name=(SELECT class_name FROM users WHERE id=?)))""",
                      (user["id"], user["id"]))
            total = c.fetchone()[0]
            c.execute("""SELECT t.*, ts.status as my_status, ts.score as my_score, ts.submitted_at as my_submitted_at,
                         ts.graded_at as my_graded_at, ts.feedback as my_feedback,
                         u.username as author_name, u.nickname as author_nickname,
                         c.name as course_name, cl.name as class_name
                         FROM tasks t
                         LEFT JOIN course_enrollments ce ON ce.course_id=t.course_id AND ce.student_id=?
                         LEFT JOIN task_submissions ts ON ts.task_id=t.id AND ts.student_id=?
                         LEFT JOIN users u ON u.id=t.created_by
                         LEFT JOIN courses c ON c.id=t.course_id
                         LEFT JOIN classes cl ON cl.id=t.class_id
                         WHERE t.status=1
                           AND (t.scope='global'
                                OR (t.scope='course' AND ce.id IS NOT NULL)
                                OR (t.scope='class' AND cl.name=(SELECT class_name FROM users WHERE id=?)))
                         ORDER BY t.created_at DESC LIMIT ? OFFSET ?""",
                      (user["id"], user["id"], user["id"], size, offset))
        else:
            where, binds = "WHERE t.status=1", []
            if user["role"] == "teacher":
                where += " AND t.created_by=?"; binds.append(user["id"])
            if params.get("course_id"):
                where += " AND t.course_id=?"; binds.append(int(params["course_id"]))
            if params.get("class_id"):
                where += " AND t.class_id=?"; binds.append(int(params["class_id"]))
            c.execute(f"SELECT COUNT(*) FROM tasks t {where}", binds)
            total = c.fetchone()[0]
            c.execute(f"""SELECT t.*, u.username as author_name, u.nickname as author_nickname,
                         c.name as course_name, cl.name as class_name,
                         (SELECT COUNT(*) FROM task_submissions WHERE task_id=t.id) as submission_count,
                         (SELECT COUNT(*) FROM task_submissions WHERE task_id=t.id AND status='graded') as graded_count
                         FROM tasks t
                         JOIN users u ON u.id=t.created_by
                         LEFT JOIN courses c ON c.id=t.course_id
                         LEFT JOIN classes cl ON cl.id=t.class_id
                         {where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?""", binds + [size, offset])
        rows = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": {"items": rows, "total": total, "page": page, "page_size": size}}

@app.post("/api/tasks")
async def create_task(request: Request, user=Depends(require_auth)):
    """Teacher/admin: create a task."""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403)
    body = await request.json()
    if not body.get("title"): raise HTTPException(400, "Title required")
    scope = body.get("scope", "global")
    if scope not in ("global", "course", "class"): scope = "global"
    with db_cursor() as c:
        new_id = _alloc_id('tasks', c)
        c.execute("INSERT INTO tasks(id,course_id,class_id,scope,title,content,deadline,created_by) VALUES(?,?,?,?,?,?,?,?)",
                  (new_id, body.get("course_id"), body.get("class_id"), scope,
                   body["title"], body.get("content", ""), body.get("deadline"), user["id"]))
        tid = new_id
    return {"code": 0, "message": "Task created", "data": {"id": tid}}

@app.get("/api/tasks/{tid}")
async def get_task(tid: int, user=Depends(require_auth)):
    """Get task detail."""
    with db_cursor() as c:
        c.execute("""SELECT t.*, u.username as author_name, u.nickname as author_nickname, c.name as course_name
                     FROM tasks t JOIN users u ON u.id=t.created_by LEFT JOIN courses c ON c.id=t.course_id
                     WHERE t.id=?""", (tid,))
        row = c.fetchone()
        if not row: raise HTTPException(404, "Not found")
        d = dict(row)
        # Get my submission if student
        if user["role"] == "student":
            c.execute("SELECT * FROM task_submissions WHERE task_id=? AND student_id=?", (tid, user["id"]))
            sub = c.fetchone()
            if sub: d["my_submission"] = dict(sub)
        # Get all submissions for teacher/admin
        else:
            c.execute("""SELECT ts.*, u.username, u.nickname, u.student_number, u.class_name
                         FROM task_submissions ts JOIN users u ON u.id=ts.student_id
                         WHERE ts.task_id=? ORDER BY ts.submitted_at DESC""", (tid,))
            d["submissions"] = [dict(r) for r in c.fetchall()]
    return {"code": 0, "data": d}

@app.delete("/api/tasks/{tid}")
async def delete_task(tid: int, request: Request, user=Depends(require_auth)):
    """Teacher/admin: delete a task."""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403)
    with db_cursor() as c:
        c.execute("SELECT created_by FROM tasks WHERE id=?", (tid,))
        row = c.fetchone()
        if not row: raise HTTPException(404, "Not found")
        if user["role"] != "admin" and row["created_by"] != user["id"]:
            raise HTTPException(403, "Not your task")
        c.execute("DELETE FROM tasks WHERE id=?", (tid,))
    return {"code": 0, "message": "Task deleted"}

@app.post("/api/tasks/{tid}/submit")
async def submit_task(tid: int, request: Request, user=Depends(require_auth)):
    """Student: submit task."""
    if user["role"] != "student": raise HTTPException(403, "Only students can submit")
    body = await request.json()
    with db_cursor() as c:
        c.execute("SELECT id,deadline FROM tasks WHERE id=? AND status=1", (tid,))
        task = c.fetchone()
        if not task: raise HTTPException(404, "作业不存在")
        c.execute("INSERT INTO task_submissions(task_id,student_id,content) VALUES(?,?,?)",
                  (tid, user["id"], body.get("content", "")))
    return {"code": 0, "message": "Task submitted"}

@app.put("/api/tasks/{tid}/grade")
async def grade_task(tid: int, request: Request, user=Depends(require_auth)):
    """Teacher/admin: grade a task submission."""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403)
    body = await request.json()
    student_id = body.get("student_id")
    if not student_id: raise HTTPException(400, "student_id required")
    with db_cursor() as c:
        c.execute("SELECT id FROM task_submissions WHERE task_id=? AND student_id=?", (tid, student_id))
        if not c.fetchone(): raise HTTPException(404, "提交记录不存在")
        c.execute("""UPDATE task_submissions SET status='graded', score=?, feedback=?,
                     graded_at=datetime('now','localtime') WHERE task_id=? AND student_id=?""",
                  (body.get("score"), body.get("feedback", ""), tid, student_id))
    return {"code": 0, "message": "Task graded"}

@app.put("/api/tasks/{tid}")
async def update_task(tid: int, request: Request, user=Depends(require_auth)):
    """Teacher/admin: update task content."""
    if user["role"] not in ("teacher", "admin"): raise HTTPException(403)
    body = await request.json()
    with db_cursor() as c:
        c.execute("SELECT created_by FROM tasks WHERE id=?", (tid,))
        row = c.fetchone()
        if not row: raise HTTPException(404, "Not found")
        if user["role"] != "admin" and row["created_by"] != user["id"]:
            raise HTTPException(403, "Not your task")
        sets, vals = [], []
        for field in ("title", "content", "deadline"):
            if field in body:
                sets.append(f"{field}=?")
                vals.append(body[field])
        if not sets: raise HTTPException(400, "Nothing to update")
        vals.append(tid)
        c.execute(f"UPDATE tasks SET {','.join(sets)}, updated_at=datetime('now','localtime') WHERE id=?", vals)
    return {"code": 0, "message": "Task updated"}


# ================================================================
# PLUGIN SYSTEM
# ================================================================
_loaded_plugins = []

def load_plugins():
    """Scan plugins directory and load all valid plugins."""
    global _loaded_plugins
    _loaded_plugins = []

    if not PLUGIN_DIR.exists():
        PLUGIN_DIR.mkdir(parents=True, exist_ok=True)
        print("[Plugin] Plugin directory created at", PLUGIN_DIR)
        return

    for entry in sorted(PLUGIN_DIR.iterdir()):
        if not entry.is_dir():
            continue
        plugin_file = entry / "plugin.py"
        plugin_json = entry / "plugin.json"

        if not plugin_file.exists():
            continue

        try:
            # Read metadata
            meta = {"name": entry.name, "version": "1.0.0", "description": ""}
            if plugin_json.exists():
                with open(plugin_json, "r", encoding="utf-8") as f:
                    meta.update(json.load(f))

            # Load the plugin module
            spec = importlib.util.spec_from_file_location(f"plugin_{entry.name}", str(plugin_file))
            if not spec or not spec.loader:
                print(f"[Plugin] Failed to load spec for {entry.name}")
                continue

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            # Call register if exists
            if hasattr(module, "register") and callable(module.register):
                try:
                    module.register(app)
                    meta["_loaded"] = True
                    print(f"[Plugin] OK Loaded: {meta['name']} v{meta['version']} - {meta['description']}")
                except Exception as reg_err:
                    meta["_loaded"] = False
                    meta["description"] = f"Register error: {reg_err}"
                    print(f"[Plugin] ERROR registering {entry.name}: {reg_err}")
            else:
                meta["_loaded"] = True
                print(f"[Plugin] Loaded (no register fn): {meta['name']} v{meta['version']}")

            _loaded_plugins.append(meta)

        except Exception as e:
            print(f"[Plugin] ERROR loading {entry.name}: {e}")
            _loaded_plugins.append({"name": entry.name, "version": "?", "description": str(e), "_loaded": False})


# ================================================================
# CLEANUP: Discussion files expiry (7 days)
# ================================================================
def cleanup_expired_discussion_files():
    """Delete discussion files older than 7 days."""
    try:
        with db_cursor() as c:
            cutoff = (datetime.now() - __import__('datetime').timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S')
            c.execute("SELECT id, file_path FROM discussion_files WHERE created_at < ?", (cutoff,))
            rows = c.fetchall()
            for row in rows:
                fpath = Path(row["file_path"])
                if fpath.exists():
                    fpath.unlink()
                # Set file_id to NULL in posts referencing this file
                c.execute("UPDATE discussion_posts SET file_id=NULL WHERE file_id=?", (row["id"],))
            if rows:
                c.execute("DELETE FROM discussion_files WHERE created_at < ?", (cutoff,))
                print(f"[Cleanup] Deleted {len(rows)} expired discussion files")
    except Exception as e:
        print(f"[Cleanup] Error: {e}")


# ================================================================
# LEARNING CENTER API
# ================================================================

def _scan_learning_dir():
    """扫描 learning/ 目录，返回课程和文件结构。"""
    result = []
    if not LEARNING_DIR.exists():
        return result
    for item in sorted(LEARNING_DIR.iterdir()):
        if item.is_dir():
            # 目录作为课程分类
            course = {"type": "folder", "name": item.name, "path": item.name, "children": []}
            for f in sorted(item.iterdir()):
                if f.is_file() and f.suffix.lower() in ('.html', '.json', '.md'):
                    course["children"].append({
                        "type": "file",
                        "name": f.stem,
                        "filename": f.name,
                        "ext": f.suffix.lower(),
                        "path": f"{item.name}/{f.name}",
                        "size": f.stat().st_size,
                    })
            result.append(course)
        elif item.is_file() and item.suffix.lower() in ('.html', '.json', '.md'):
            result.append({
                "type": "file",
                "name": item.stem,
                "filename": item.name,
                "ext": item.suffix.lower(),
                "path": item.name,
                "size": item.stat().st_size,
            })
    return result


@app.get("/api/learning/list")
async def learning_list(request: Request):
    """列出学习中心所有课程/文件（按选课过滤）"""
    user = require_auth(request)
    all_items = _scan_learning_dir()

    # 查询所有绑定了 learning_folder 的课程（使用小写键以支持大小写不敏感匹配）
    with db_cursor() as c:
        c.execute("SELECT id, learning_folder FROM courses WHERE learning_folder IS NOT NULL AND learning_folder != '' AND status=1")
        folder_courses = {row["learning_folder"].lower(): row["id"] for row in c.fetchall()}

        # 如果是学生，查询已选课程
        if user["role"] == "student":
            c.execute("SELECT course_id FROM course_enrollments WHERE student_id=?", (user["id"],))
            enrolled_course_ids = {row["course_id"] for row in c.fetchall()}
        else:
            enrolled_course_ids = None  # 教师/管理员无限制

    # 过滤：对于绑定了课程的目录，学生只能看到已选课程的目录
    filtered = []
    for item in all_items:
        if item["type"] == "folder":
            # 使用小写进行大小写不敏感匹配
            bound_course_id = folder_courses.get(item["name"].lower())
            if bound_course_id is None:
                # 未绑定课程：公开目录，所有人可见
                filtered.append(item)
            elif enrolled_course_ids is None or bound_course_id in enrolled_course_ids:
                # 绑定了课程，且教师/管理员或学生已选该课程
                filtered.append(item)
            # else: 学生未选该课程，过滤掉（同时过滤掉该目录下的所有子文件）
        else:
            # 根目录下的文件：公开
            filtered.append(item)

    return {"code": 0, "data": filtered}




@app.get("/api/learning/file/{filepath:path}")
async def learning_get_file(filepath: str, request: Request):
    """读取学习中心文件内容（HTML/JSON/MD）—— 按选课权限控制"""
    user = require_auth(request)
    f = LEARNING_DIR / filepath
    # 安全检查：不允许路径穿越
    try:
        f.resolve().relative_to(LEARNING_DIR.resolve())
    except ValueError:
        raise HTTPException(403, "非法路径")
    if not f.exists() or not f.is_file():
        raise HTTPException(404, "文件不存在")

    # 学生权限检查：若文件所在目录绑定了课程，则要求已选课
    if user["role"] == "student":
        # 取文件所在的顶层目录名（相对于 LEARNING_DIR）
        try:
            rel = f.resolve().relative_to(LEARNING_DIR.resolve())
            top_folder = rel.parts[0] if len(rel.parts) > 1 else None
        except Exception:
            top_folder = None
        if top_folder:
            with db_cursor() as c:
                # 使用大小写不敏感匹配查询课程
                c.execute("SELECT id FROM courses WHERE LOWER(learning_folder)=LOWER(?) AND status=1", (top_folder,))
                course_row = c.fetchone()
                if course_row:
                    c.execute("SELECT id FROM course_enrollments WHERE student_id=? AND course_id=?",
                              (user["id"], course_row["id"]))
                    if not c.fetchone():
                        raise HTTPException(403, "请先选课后再访问该学习资料")

    ext = f.suffix.lower()
    content = f.read_text(encoding="utf-8", errors="replace")
    return {"code": 0, "data": {"filename": f.name, "ext": ext, "content": content}}


@app.post("/api/learning/upload")
async def learning_upload(request: Request):
    """教师/管理员上传学习资料（HTML/JSON/MD），支持指定文件夹"""
    user = require_auth(request)
    if user["role"] not in ("teacher", "admin"):
        raise HTTPException(403, "无权限上传")
    form = await request.form()
    file = form.get("file")
    folder = (form.get("folder") or "").strip().strip("/\\")
    if not file:
        raise HTTPException(400, "请选择文件")
    fname = file.filename or "upload"
    ext = Path(fname).suffix.lower()
    if ext not in ('.html', '.json', '.md'):
        raise HTTPException(400, "仅支持 .html / .json / .md 文件")
    # 安全文件名
    safe_name = "".join(c for c in Path(fname).stem if c.isalnum() or c in (' ', '_', '-', '.')).strip() or "file"
    safe_name = safe_name[:60] + ext
    if folder:
        safe_folder = "".join(c for c in folder if c.isalnum() or c in (' ', '_', '-')).strip()[:40]
        save_dir = LEARNING_DIR / safe_folder
    else:
        save_dir = LEARNING_DIR
    save_dir.mkdir(parents=True, exist_ok=True)
    dest = save_dir / safe_name
    content = await file.read()
    dest.write_bytes(content)
    return {"code": 0, "message": "上传成功", "data": {"path": str(dest.relative_to(LEARNING_DIR))}}


@app.delete("/api/learning/file/{filepath:path}")
async def learning_delete_file(filepath: str, request: Request):
    """教师/管理员删除学习资料"""
    user = require_auth(request)
    if user["role"] not in ("teacher", "admin"):
        raise HTTPException(403, "无权限")
    f = LEARNING_DIR / filepath
    try:
        f.resolve().relative_to(LEARNING_DIR.resolve())
    except ValueError:
        raise HTTPException(403, "非法路径")
    if f.exists() and f.is_file():
        f.unlink()
    return {"code": 0, "message": "删除成功"}



# ================================================================
# BLOG (博客中心)
# ================================================================
BLOG_DIR = BASE_DIR / "blog_files"
BLOG_DIR.mkdir(parents=True, exist_ok=True)

@app.get("/api/blog")
async def blog_list(request: Request, user=Depends(require_auth)):
    """博客文章列表（所有人可看，教师/管理员可看草稿）"""
    params = request.query_params
    page = max(1, int(params.get("page", "1")))
    limit = min(50, max(1, int(params.get("limit", "10"))))
    status_filter = params.get("status", "")
    kw = params.get("keyword", "").strip()

    with db_cursor() as c:
        # 学生只能看到已发布的文章
        if user["role"] == "student":
            base_where = "WHERE bp.status='published'"
        else:
            if status_filter in ("draft", "published"):
                base_where = f"WHERE bp.status='{status_filter}'"
            else:
                base_where = ""

        where = base_where
        args = []
        if kw:
            op = " AND " if where else " WHERE "
            where += f"{op}(bp.title LIKE ? OR bp.summary LIKE ?)"
            args.extend([f"%{kw}%", f"%{kw}%"])

        c.execute(f"SELECT COUNT(*) FROM blog_posts AS bp {where}", args)
        total = c.fetchone()[0]

        offset = (page - 1) * limit
        c.execute(f"""SELECT bp.*, u.username, u.nickname, u.avatar,
                      (SELECT COUNT(*) FROM blog_attachments WHERE blog_id=bp.id) as attachment_count
                      FROM blog_posts AS bp LEFT JOIN users AS u ON bp.author_id=u.id
                      {where} ORDER BY bp.created_at DESC LIMIT ? OFFSET ?""",
                  args + [limit, offset])
        rows = c.fetchall()
        articles = []
        for r in rows:
            d = dict(r)
            # 截取内容前200字作为预览（如果 summary 为空）
            content_preview = d["content"][:300] + ("..." if len(d["content"]) > 300 else "") if d["content"] else ""
            articles.append({
                **d,
                "author_name": d["nickname"] or d["username"],
                "content_preview": content_preview,
            })

    return {"code": 0, "data": {"list": articles, "total": total, "page": page, "limit": limit}}


@app.post("/api/blog")
async def blog_create(request: Request, user=Depends(require_auth)):
    """创建博客文章（仅教师/管理员）"""
    if user["role"] not in ("teacher", "admin"):
        raise HTTPException(403, "只有教师/管理员可以发布博客")
    body = await request.json()
    title = (body.get("title") or "").strip()
    content = body.get("content") or ""
    summary = (body.get("summary") or "").strip()
    cover_image = (body.get("cover_image") or "").strip()
    status = body.get("status", "draft")

    if not title:
        raise HTTPException(400, "标题不能为空")
    if status not in ("draft", "published"):
        status = "draft"

    pub_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S") if status == "published" else None

    with db_cursor() as c:
        c.execute("""INSERT INTO blog_posts(title,content,summary,cover_image,author_id,status,published_at)
                     VALUES(?,?,?,?,?,?,?)""",
                  (title, content, summary, cover_image, user["id"], status, pub_at))
        aid = c.lastrowid
    return {"code": 0, "message": "文章已创建", "data": {"id": aid}}


@app.get("/api/blog/{bid}")
async def blog_detail(bid: int, request: Request, user=Depends(require_auth)):
    """获取单篇文章详情"""
    with db_cursor() as c:
        c.execute("""SELECT bp.*, u.username, u.nickname, u.avatar
                     FROM blog_posts AS bp LEFT JOIN users AS u ON bp.author_id=u.id
                     WHERE bp.id=?""", (bid,))
        row = c.fetchone()
        if not row:
            raise HTTPException(404, "文章不存在")

        article = dict(row)
        # 权限检查：学生不能看草稿
        if user["role"] == "student" and article["status"] != "published":
            raise HTTPException(404, "文章不存在")

        # 增加浏览量
        c.execute("UPDATE blog_posts SET view_count=view_count+1 WHERE id=?", (bid,))
        article["view_count"] = (article["view_count"] or 0) + 1

        # 获取附件列表
        c.execute("SELECT id, filename, original_name, file_size, mime_type, download_count, created_at FROM blog_attachments WHERE blog_id=? ORDER BY id ASC", (bid,))
        article["attachments"] = [dict(r) for r in c.fetchall()]
        article["author_name"] = row["nickname"] or row["username"]

    return {"code": 0, "data": article}


@app.put("/api/blog/{bid}")
async def blog_update(bid: int, request: Request, user=Depends(require_auth)):
    """更新博客文章"""
    with db_cursor() as c:
        c.execute("SELECT * FROM blog_posts WHERE id=?", (bid,))
        row = c.fetchone()
        if not row:
            raise HTTPException(404, "文章不存在")
        # 只有作者或管理员可以编辑
        if row["author_id"] != user["id"] and user["role"] != "admin":
            raise HTTPException(403, "无权编辑此文章")

    body = await request.json()
    title = (body.get("title") or "").strip()
    content = body.get("content")
    summary = (body.get("summary") or "").strip()
    cover_image = (body.get("cover_image") or "").strip()
    status = body.get("status")

    updates = ["updated_at=datetime('now','localtime')"]
    values = []
    if title is not None:
        if not title: raise HTTPException(400, "标题不能为空")
        updates.append("title=?"); values.append(title)
    if content is not None:
        updates.append("content=?"); values.append(content)
    if summary is not None:
        updates.append("summary=?"); values.append(summary)
    if cover_image is not None:
        updates.append("cover_image=?"); values.append(cover_image)
    if status is not None:
        if status not in ("draft", "published"): raise HTTPException(400, "无效的状态")
        updates.append("status=?"); values.append(status)
        if status == "published":
            # 如果从草稿改为发布，设置发布时间；已发布过的保持不变
            updates.append("published_at=COALESCE(published_at,datetime('now','localtime'))")

    values.append(bid)
    with db_cursor() as c:
        c.execute(f"UPDATE blog_posts SET {', '.join(updates)} WHERE id=?", values)

    return {"code": 0, "message": "文章已更新"}


@app.delete("/api/blog/{bid}")
async def blog_delete(bid: int, user=Depends(require_auth)):
    """删除博客文章（级联删除附件记录，物理删除附件文件）"""
    import glob
    with db_cursor() as c:
        c.execute("SELECT * FROM blog_posts WHERE id=?", (bid,))
        row = c.fetchone()
        if not row:
            raise HTTPException(404, "文章不存在")
        if row["author_id"] != user["id"] and user["role"] != "admin":
            raise HTTPException(403, "无权删除此文章")

        # 删除物理附件文件
        c.execute("SELECT file_path FROM blog_attachments WHERE blog_id=?", (bid,))
        for fr in c.fetchall():
            try: Path(fr["file_path"]).unlink(missing_ok=True)
            except: pass
        # 级联删除会自动清理 blog_attachments 记录（ON DELETE CASCADE）
        c.execute("DELETE FROM blog_posts WHERE id=?", (bid,))

    return {"code": 0, "message": "文章已删除"}


# -- Blog Attachments --
@app.post("/api/blog/{bid}/attachments")
async def blog_upload_attachment(bid: int, request: Request, user=Depends(require_auth)):
    """上传博客附件（无大小限制！）"""
    with db_cursor() as c:
        c.execute("SELECT id, author_id FROM blog_posts WHERE id=?", (bid,))
        row = c.fetchone()
        if not row:
            raise HTTPException(404, "文章不存在")
        if row["author_id"] != user["id"] and user["role"] != "admin":
            raise HTTPException(403, "无权上传附件到此文章")

    form = await request.form()
    file = form.get("file")
    if not file:
        raise HTTPException(400, "请选择文件")

    content = await file.read()
    ext = Path(file.filename).suffix if file.filename else ""
    file_id = uuid.uuid4().hex[:12]
    stored_name = f"blog_{file_id}{ext}"
    file_path = BLOG_DIR / stored_name
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "wb") as f:
        f.write(content)

    import mimetypes
    mime, _ = mimetypes.guess_type(str(file_path))

    with db_cursor() as c:
        c.execute("""INSERT INTO blog_attachments(blog_id,uploaded_by,filename,original_name,file_size,file_path,mime_type)
                     VALUES(?,?,?,?,?,?,?)""",
                  (bid, user["id"], stored_name, file.filename, len(content), str(file_path), mime or "application/octet-stream"))
        fid = c.lastrowid

    return {"code": 0, "message": "上传成功", "data": {
        "id": fid, "filename": file.filename, "size": len(content),
        "size_human": _format_bytes(len(content))
    }}


def _format_bytes(n):
    """格式化字节数为人类可读字符串"""
    for unit in ('B', 'KB', 'MB', 'GB'):
        if n < 1024: return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


@app.delete("/api/blog/attachments/{att_id}")
async def blog_delete_attachment(att_id: int, user=Depends(require_auth)):
    """删除单个博客附件"""
    with db_cursor() as c:
        c.execute("""SELECT ba.*, bp.author_id FROM blog_attachments AS ba
                     JOIN blog_posts AS bp ON ba.blog_id=bp.id WHERE ba.id=?""", (att_id,))
        row = c.fetchone()
        if not row:
            raise HTTPException(404, "附件不存在")
        if row["author_id"] != user["id"] and user["role"] != "admin":
            raise HTTPException(403, "无权删除此附件")

        try: Path(row["file_path"]).unlink(missing_ok=True)
        except: pass
        c.execute("DELETE FROM blog_attachments WHERE id=?", (att_id,))

    return {"code": 0, "message": "附件已删除"}


@app.get("/api/blog/attachments/{att_id}/download")
async def blog_download_attachment(att_id: int, user=Depends(require_auth)):
    """下载博客附件"""
    import mimetypes
    with db_cursor() as c:
        c.execute("""SELECT ba.*, bp.status FROM blog_attachments AS ba
                     JOIN blog_posts AS bp ON ba.blog_id=bp.id WHERE ba.id=?""", (att_id,))
        row = c.fetchone()
        if not row:
            raise HTTPException(404, "附件不存在")
        if user["role"] == "student" and row["status"] != "published":
            raise HTTPException(404, "附件不存在")

        fpath = Path(row["file_path"])
        if not fpath.exists(): raise HTTPException(404, "文件已被移除")
        c.execute("UPDATE blog_attachments SET download_count=download_count+1 WHERE id=?", (att_id,))
        mime, _ = mimetypes.guess_type(str(fpath))
        return FileResponse(
            str(fpath),
            filename=row["original_name"],
            media_type=mime or "application/octet-stream",
        )


@app.get("/api/blog/attachments/{att_id}/preview")
async def blog_preview_attachment(att_id: int, user=Depends(require_auth)):
    """在线预览博客附件（图片/PDF等可在浏览器直接显示的文件）"""
    import mimetypes
    with db_cursor() as c:
        c.execute("""SELECT ba.*, bp.status FROM blog_attachments AS ba
                     JOIN blog_posts AS bp ON ba.blog_id=bp.id WHERE ba.id=?""", (att_id,))
        row = c.fetchone()
        if not row:
            raise HTTPException(404, "附件不存在")
        if user["role"] == "student" and row["status"] != "published":
            raise HTTPException(404, "附件不存在")

        fpath = Path(row["file_path"])
        if not fpath.exists(): raise HTTPException(404, "文件已被移除")
        mime, _ = mimetypes.guess_type(str(fpath))
        return FileResponse(
            str(fpath),
            media_type=mime or "application/octet-stream",
            filename=row["original_name"],
        )


# ================================================================
# HEALTH
# ================================================================
@app.get("/api/health")
async def health():
    return {"status": "ok", "time": datetime.now().isoformat()}

# ================================================================
# GLOBAL EXCEPTION HANDLER
# ================================================================
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback as tb
    tb.print_exc()
    return JSONResponse(status_code=500, content={"code": -1, "message": f"Internal Server Error: {type(exc).__name__}: {str(exc)}"})


# ================================================================
# STARTUP
# ================================================================
@app.on_event("startup")
async def startup():
    init_db()
    load_plugins()
    cleanup_expired_discussion_files()
    # Schedule periodic cleanup (run in background)
    def periodic_cleanup():
        while True:
            time.sleep(3600)  # Every hour
            try:
                cleanup_expired_discussion_files()
            except:
                pass
    t = threading.Thread(target=periodic_cleanup, daemon=True)
    t.start()

    print("\n" + "="*60)
    print("  Code Classroom - Pure Python Edition")
    print("  Server: http://localhost:8000")
    if _loaded_plugins:
        print(f"  Plugins: {len([p for p in _loaded_plugins if p.get('_loaded')])} loaded")
    print("="*60 + "\n")


# ================================================================
# ENTRY POINT
# ================================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
