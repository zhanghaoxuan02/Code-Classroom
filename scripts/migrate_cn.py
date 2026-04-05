"""
migrate_cn.py - 汉化迁移脚本
将数据库中现有的英文/旧版题目和公告更新为汉化版本。
运行一次即可，不会影响用户提交记录等数据。
用法: python scripts/migrate_cn.py
"""
import sqlite3
import sys
import io
from pathlib import Path

# 强制 stdout/stderr 使用 UTF-8（避免 Windows GBK 乱码）
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

BASE_DIR = Path(__file__).parent.parent
DB_PATH = BASE_DIR / "data" / "classroom.db"

if not DB_PATH.exists():
    print(f"[ERROR] 数据库不存在: {DB_PATH}")
    print("  请先启动服务器（python server.py）让它自动创建并 seed 数据，再运行此脚本。")
    sys.exit(1)

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

print("=== Code Classroom 汉化迁移脚本 ===")
print(f"数据库: {DB_PATH}\n")

# ─────────────────────────────────────────────────────────────
# 1. 更新公告
# ─────────────────────────────────────────────────────────────
c.execute("SELECT id, title FROM announcements ORDER BY id LIMIT 5")
rows = c.fetchall()
print(f"当前公告（共 {len(rows)} 条）:")
for r in rows:
    print(f"  id={r[0]}  title={r[1]}")

if len(rows) >= 1:
    c.execute(
        "UPDATE announcements SET title=?, content=? WHERE id=?",
        (
            "欢迎来到 Python 基础课！",
            "同学们好！\n\n欢迎加入 Python 基础入门课程\n\n请先完成\"Hello World\"练习熟悉平台操作。有任何问题可以在讨论区提问，老师会及时回复。\n\n祝学习愉快！",
            rows[0][0],
        ),
    )
    print(f"  [OK] 公告 id={rows[0][0]} 已更新为中文")

if len(rows) >= 2:
    c.execute(
        "UPDATE announcements SET title=?, content=? WHERE id=?",
        (
            "平台使用须知",
            "1. 代码执行有时间和内存限制，请注意优化。\n2. 每道题可以多次提交，系统记录最高分。\n3. 禁止抄袭，请独立完成练习。\n4. 如遇到 bug 或建议，请在讨论区反馈，感谢支持！",
            rows[1][0],
        ),
    )
    print(f"  [OK] 公告 id={rows[1][0]} 已更新为中文")

# ─────────────────────────────────────────────────────────────
# 2. 更新题库（按标题匹配）
# ─────────────────────────────────────────────────────────────
print("\n当前题库:")
c.execute("SELECT id, title, language FROM exercises ORDER BY id")
ex_rows = c.fetchall()
for r in ex_rows:
    print(f"  id={r[0]}  [{r[2]}]  {r[1]}")

# 要更新的题目列表：(old_title, new_title, new_description, new_template_code, language)
exercise_updates = [
    # Python 题目（旧英文标题 → 新中文标题）
    (
        "Hello World",
        "Hello World",
        "## 题目说明\n\n请用 Python 输出 `Hello, World!`\n\n> 提示：使用 `print()` 函数",
        "# 在这里写你的代码\n# 提示：使用 print() 函数\n",
        "python",
    ),
    (
        "Even or Odd",
        "判断奇偶数",
        "## 题目说明\n\n输入一个整数 n，判断是奇数还是偶数。\n\n**输入：** 一个整数 n\n**输出：** 输出 `even`（偶数）或 `odd`（奇数）",
        "n = int(input())\n",
        "python",
    ),
    (
        "Grade Classifier",
        "成绩等级划分",
        "## 题目说明\n\n输入一个成绩（0-100），输出等级：A（90-100）、B（80-89）、C（70-79）、D（60-69）、F（0-59）",
        "score = int(input())\n",
        "python",
    ),
    (
        "Sum 1 to N",
        "1 到 N 的累加",
        "## 题目说明\n\n计算 1+2+...+n 的结果。\n\n**输入：** 正整数 n（1 ≤ n ≤ 10000）\n**输出：** 累加结果",
        "n = int(input())\n",
        "python",
    ),
    (
        "Multiplication Table",
        "九九乘法表",
        "## 题目说明\n\n输入 n，打印 n×n 乘法表。格式：`1x1=1`，同行数字用空格分隔。",
        "n = int(input())\n",
        "python",
    ),
    (
        "Factorial",
        "阶乘",
        "## 题目说明\n\n编写函数 `factorial(n)`，返回 n 的阶乘（n!）。\n\n**输入：** 非负整数（0 ≤ n ≤ 20）",
        "def factorial(n):\n    pass\n\nn = int(input())\nprint(factorial(n))\n",
        "python",
    ),
    (
        "Palindrome Check",
        "回文字符串判断",
        "## 题目说明\n\n判断一个全小写字符串是否是回文（正着读和反着读一样）。输出 `True` 或 `False`。",
        "s = input()\n",
        "python",
    ),
    (
        "Sort & Deduplicate",
        "排序去重",
        "## 题目说明\n\n输入一组用空格分隔的整数，去除重复数字后排序输出。",
        "nums = list(map(int, input().split()))\n",
        "python",
    ),
    (
        "Fibonacci",
        "斐波那契数列",
        "## 题目说明\n\n输出第 n 个斐波那契数（从第 1 项开始：1, 1, 2, 3, 5, 8...）",
        "n = int(input())\n",
        "python",
    ),
    (
        "Student Grade Manager",
        "学生成绩管理",
        "## 题目说明\n\n逐行输入\"姓名 成绩\"，遇到 `END` 停止。\n然后输出：平均分、最高分同学姓名、不及格人数。",
        "students = []\nwhile True:\n    line = input().strip()\n    if line == 'END': break\n    name, score = line.rsplit(' ', 1)\n    students.append((name, int(score)))\n",
        "python",
    ),
    # JavaScript 题目
    (
        "Hello World (JS)",
        "Hello World（JS）",
        "## 题目说明\n\n用 JavaScript 输出 `Hello, World!`",
        "// 在这里写你的代码\n",
        "javascript",
    ),
    (
        "Array Max",
        "数组最大值",
        "## 题目说明\n\n输入一组用空格分隔的数字，输出最大值。",
        "const input = require('fs').readFileSync('/dev/stdin','utf8').trim();\nconst nums = input.split(/\\s+/).map(Number);\n",
        "javascript",
    ),
    (
        "Function Currying",
        "函数柯里化",
        "## 题目说明\n\n实现 `curry(fn)` 函数，使 `curry(add)(1)(2)` 返回 3。",
        "function curry(fn) {\n    // TODO\n}\nconst add = (a,b) => a+b;\nconsole.log(curry(add)(1)(2));\n",
        "javascript",
    ),
    # 算法题
    (
        "Two Sum",
        "两数之和",
        "## 题目说明\n\n给定数组 nums 和目标值 target，找出两个下标使其对应值之和等于 target。",
        "nums = list(map(int, input().split()))\ntarget = int(input())\n",
        "python",
    ),
    (
        "Bubble Sort",
        "冒泡排序",
        "## 题目说明\n\n用冒泡排序算法对输入的整数进行从小到大排序。",
        "nums = list(map(int, input().split()))\n",
        "python",
    ),
]

updated = 0
for old_title, new_title, new_desc, new_template, lang in exercise_updates:
    # 先尝试精确匹配旧英文标题
    c.execute(
        "SELECT id, title FROM exercises WHERE title=? AND language=?",
        (old_title, lang),
    )
    row = c.fetchone()
    if row:
        c.execute(
            "UPDATE exercises SET title=?, description=?, template_code=? WHERE id=?",
            (new_title, new_desc, new_template, row[0]),
        )
        print(f"  [OK] 题目 id={row[0]} [{lang}] '{old_title}' -> '{new_title}'")
        updated += 1
    else:
        # 检查是否已是中文（直接刷新 description 和 template）
        c.execute(
            "SELECT id FROM exercises WHERE title=? AND language=?",
            (new_title, lang),
        )
        existing = c.fetchone()
        if existing:
            c.execute(
                "UPDATE exercises SET description=?, template_code=? WHERE id=?",
                (new_desc, new_template, existing[0]),
            )
            print(f"  [REFRESH] 题目 id={existing[0]} [{lang}] '{new_title}' 描述已刷新")
            updated += 1
        else:
            # 如果都找不到，插入新题目
            print(f"  [SKIP] 未找到题目 '{old_title}' ({lang})")

print(f"\n共处理 {updated} 道题目")

# ─────────────────────────────────────────────────────────────
# 3. 提交
# ─────────────────────────────────────────────────────────────
conn.commit()
conn.close()
print("\n[DONE] 迁移完成！重启服务器后生效（或直接刷新页面）。")
