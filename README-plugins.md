# 🧩 Code Classroom 插件开发指南

> 从零开始，编写、测试并安装你的第一个自定义插件。

---

## 目录

1. [插件系统概述](#1-插件系统概述)
2. [30 秒上手：Hello World](#2-30-秒上手hello-world)
3. [目录结构规范](#3-目录结构规范)
4. [编写 plugin.py](#4-编写-pluginpy)
   - [4.1 register 函数](#41-register-函数)
   - [4.2 添加 API 端点](#42-添加-api-端点)
   - [4.3 访问数据库](#43-访问数据库)
   - [4.4 用户认证与权限](#44-用户认证与权限)
   - [4.5 返回前端页面](#45-返回前端页面)
5. [编写 plugin.json](#5-编写-pluginjson)
6. [实战示例：天气查询插件](#6-实战示例天气查询插件)
7. [实战示例：积分排行榜插件](#7-实战示例积分排行榜插件)
8. [安装与管理](#8-安装与管理)
9. [调试技巧](#9-调试技巧)
10. [最佳实践与注意事项](#10-最佳实践与注意事项)
11. [API 参考：可用的后端工具](#11-api-参考可用的后端工具)

---

## 1. 插件系统概述

Code Classroom 的插件系统基于 **FastAPI 动态路由注册**，核心思想非常简单：

```
plugins/
├── hello-example/    ← 一个插件 = 一个文件夹
│   ├── plugin.py     ← 必须有：插件逻辑代码
│   └── plugin.json   ← 可选有：插件元数据
├── my-plugin/
│   ├── plugin.py
│   └── plugin.json
└── ...
```

**工作原理**：

1. 服务器启动时，自动扫描 `plugins/` 目录下的所有子文件夹
2. 对每个包含 `plugin.py` 的文件夹，加载为 Python 模块
3. 如果模块中有 `register(app)` 函数，就调用它，把 FastAPI `app` 实例传入
4. 插件在 `register` 函数中注册自己的路由、中间件等
5. 管理员可在后台「插件管理」页面查看所有插件的加载状态

**热重载**：当前版本不支持热重载，修改插件后需要重启服务器。

---

## 2. 30 秒上手：Hello World

创建你的第一个插件只需两步：

### 第一步：创建文件夹和文件

```
plugins/
└── my-hello/
    ├── plugin.py
    └── plugin.json
```

**plugin.py**：

```python
"""我的第一个插件"""

def register(app):
    """注册函数 —— 服务器启动时自动调用"""

    @app.get("/api/plugins/my-hello")
    async def say_hello():
        return {"code": 0, "message": "Hello from my plugin!"}
```

**plugin.json**：

```json
{
    "name": "My Hello",
    "version": "1.0.0",
    "description": "我的第一个插件，向世界问好。"
}
```

### 第二步：重启服务器

```bash
python server.py
```

控制台输出：

```
[Plugin] OK Loaded: My Hello v1.0.0 - 我的第一个插件，向世界问好。
```

浏览器访问 `http://localhost:8000/api/plugins/my-hello`，你就能看到：

```json
{"code":0,"message":"Hello from my plugin!"}
```

✅ 恭喜！你已经写好了第一个插件。

---

## 3. 目录结构规范

一个完整的插件目录结构如下：

```
plugins/
└── my-awesome-plugin/
    ├── plugin.py          ← 必需：插件主文件
    ├── plugin.json        ← 推荐：元数据文件
    ├── README.md          ← 可选：插件说明文档
    ├── static/            ← 可选：插件自己的静态文件
    │   ├── style.css
    │   └── script.js
    └── templates/         ← 可选：插件自己的 HTML 模板
        └── index.html
```

| 文件/目录 | 必需？ | 说明 |
|-----------|--------|------|
| `plugin.py` | ✅ 必需 | 插件的核心代码，必须包含 `register(app)` 函数 |
| `plugin.json` | 推荐 | 插件名称、版本、描述等元数据 |
| `static/` | 可选 | 插件专属的 CSS/JS/图片等静态资源 |
| `templates/` | 可选 | 插件专属的 HTML 模板文件 |
| `README.md` | 可选 | 给其他开发者看的说明文档 |

---

## 4. 编写 plugin.py

### 4.1 register 函数

`register(app)` 是插件的入口函数。服务器启动时会将 FastAPI 应用实例 `app` 传入，你可以在里面做任何事情：

```python
def register(app):
    """
    app: FastAPI 实例
    你可以在这里：
    - 注册新的 API 路由 (@app.get, @app.post ...)
    - 挂载子应用 (app.mount)
    - 添加中间件 (app.middleware)
    - 初始化数据库表
    - 做任何 Python 能做的事
    """

    # 1. 初始化（比如建表）
    init_my_tables()

    # 2. 注册路由
    @app.get("/api/plugins/my-feature")
    async def my_feature():
        ...

    # 3. 注册多个路由也完全可以
    @app.post("/api/plugins/my-feature")
    async def my_feature_post():
        ...
```

### 4.2 添加 API 端点

插件可以注册任意 HTTP 方法的路由：

```python
def register(app):

    # GET 请求
    @app.get("/api/plugins/greeting")
    async def greet(name: str = "World"):
        return {"code": 0, "data": {"greeting": f"Hello, {name}!"}}

    # POST 请求（接收 JSON body）
    @app.post("/api/plugins/echo")
    async def echo(request: Request):
        body = await request.json()
        return {"code": 0, "data": body}

    # PUT 请求
    @app.put("/api/plugins/items/{item_id}")
    async def update_item(item_id: int, request: Request):
        return {"code": 0, "message": f"Updated item {item_id}"}

    # DELETE 请求
    @app.delete("/api/plugins/items/{item_id}")
    async def delete_item(item_id: int):
        return {"code": 0, "message": f"Deleted item {item_id}"}
```

> **⚠️ 路径规范**：建议插件路由统一使用 `/api/plugins/` 前缀，避免与系统内置路由冲突。

### 4.3 访问数据库

Code Classroom 使用 SQLite 数据库，插件可以直接操作它。有两种方式：

#### 方式一：使用 server.py 提供的 `db_cursor`（推荐）

```python
# 注意：db_cursor 定义在 server.py 中，插件可以直接 import
# 因为插件模块在 server.py 进程中加载
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from server import db_cursor

def register(app):

    @app.get("/api/plugins/my-data")
    async def get_my_data():
        with db_cursor() as c:
            c.execute("SELECT * FROM my_plugin_table")
            rows = [dict(r) for r in c.fetchall()]
        return {"code": 0, "data": rows}
```

#### 方式二：直接连接 SQLite

```python
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "classroom.db"

def register(app):

    @app.get("/api/plugins/stats")
    async def stats():
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT COUNT(*) as total FROM users")
        total = c.fetchone()["total"]
        conn.close()
        return {"code": 0, "data": {"total_users": total}}
```

#### 插件创建自己的数据表

建议在 `register` 函数调用时检查并创建表：

```python
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "classroom.db"

def _init_tables():
    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS plugin_bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        exercise_id INTEGER NOT NULL,
        note TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime'))
    )""")
    conn.commit()
    conn.close()

def register(app):
    _init_tables()

    @app.post("/api/plugins/bookmarks")
    async def add_bookmark(request: Request):
        body = await request.json()
        with db_cursor() as c:
            c.execute("INSERT INTO plugin_bookmarks(user_id, exercise_id, note) VALUES(?,?,?)",
                      (body["user_id"], body["exercise_id"], body.get("note", "")))
        return {"code": 0, "message": "Bookmarked"}
```

> **⚠️ 表名规范**：建议使用 `plugin_` 前缀命名插件创建的表，例如 `plugin_bookmarks`、`plugin_ratings`，避免与系统表冲突。

### 4.4 用户认证与权限

#### 验证用户身份（需要登录）

```python
from fastapi import Depends
# 需要从 server.py 导入 require_auth
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from server import require_auth

def register(app):

    @app.get("/api/plugins/my-settings")
    async def my_settings(user=Depends(require_auth)):
        # user 是一个字典: {"id": 1, "username": "admin", "role": "admin", ...}
        return {"code": 0, "data": {"username": user["username"], "role": user["role"]}}
```

#### 限制仅管理员/教师访问

```python
def register(app):

    @app.get("/api/plugins/admin-only")
    async def admin_only(user=Depends(require_auth)):
        if user["role"] not in ("admin", "teacher"):
            raise HTTPException(403, "Only admin/teacher can access")
        return {"code": 0, "message": "Welcome, admin!"}
```

#### 获取前端传递的 JWT Token

如果不想用 `Depends(require_auth)`，也可以手动解析 token：

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from server import jwt_decode

def register(app):

    @app.get("/api/plugins/check")
    async def check(request: Request):
        auth = request.headers.get("authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else None
        if not token:
            return {"code": 1, "message": "Not logged in"}
        user = jwt_decode(token)
        return {"code": 0, "data": {"user": user}}
```

### 4.5 返回前端页面

插件可以挂载静态文件目录或直接返回 HTML：

#### 方式一：挂载静态文件 + 返回 HTML

```python
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

PLUGIN_DIR = Path(__file__).parent

def register(app):
    # 挂载插件的静态文件
    static_path = PLUGIN_DIR / "static"
    static_path.mkdir(exist_ok=True)
    app.mount("/plugins/my-plugin/static", StaticFiles(directory=str(static_path)), name="my-plugin-static")

    @app.get("/plugins/my-plugin", response_class=HTMLResponse)
    async def plugin_page():
        html_path = PLUGIN_DIR / "templates" / "index.html"
        return html_path.read_text(encoding="utf-8")
```

#### 方式二：直接返回 HTML 字符串

```python
from fastapi.responses import HTMLResponse

def register(app):

    @app.get("/plugins/my-widget", response_class=HTMLResponse)
    async def widget():
        return """
        <div style="padding:2rem;font-family:sans-serif;">
            <h2>📊 My Widget</h2>
            <p>This is a plugin page!</p>
        </div>
        """
```

#### 方式三：提供 API，前端单独集成

如果你的插件只需要提供数据，最简单的方式是只写 API 端点，然后在前端 `app.js` 中调用：

```python
# plugin.py
def register(app):

    @app.get("/api/plugins/tips/random")
    async def random_tip():
        import random
        tips = ["Use list comprehension!", "Try f-strings!", "Use type hints!"]
        return {"code": 0, "data": {"tip": random.choice(tips)}}
```

```javascript
// 在前端 app.js 中调用
async function showRandomTip() {
    const data = await API.get('/plugins/tips/random');
    showToast(data.tip, 'info');
}
```

---

## 5. 编写 plugin.json

`plugin.json` 是插件的元数据文件，JSON 格式：

```json
{
    "name": "插件名称",
    "version": "1.0.0",
    "description": "插件功能简述"
}
```

| 字段 | 类型 | 必需？ | 说明 |
|------|------|--------|------|
| `name` | string | 推荐 | 插件显示名称，默认使用文件夹名 |
| `version` | string | 推荐 | 语义化版本号，默认 `"1.0.0"` |
| `description` | string | 推荐 | 功能描述，显示在插件管理页面 |

如果 `plugin.json` 不存在或缺少某个字段，系统会自动使用默认值（文件夹名作为 name，`"1.0.0"` 作为 version，空字符串作为 description）。

---

## 6. 实战示例：天气查询插件

一个稍微复杂的插件，展示完整开发流程。

### 需求

添加一个「每日编程小贴士」插件，每天展示一条编程技巧。

### 目录结构

```
plugins/
└── daily-tips/
    ├── plugin.py
    └── plugin.json
```

### plugin.json

```json
{
    "name": "每日编程贴士",
    "version": "1.0.0",
    "description": "每天展示一条编程小技巧，帮助学生学习编程。"
}
```

### plugin.py

```python
"""
每日编程贴士插件
每天展示一条随机编程技巧，用户可以收藏
"""

import sqlite3
import random
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "classroom.db"

# 内置贴士数据
TIPS = [
    {"category": "Python", "content": "使用 f-string 格式化字符串比 % 或 .format() 更快更简洁。", "example": "name = 'World'\nprint(f'Hello, {name}!')"},
    {"category": "Python", "content": "列表推导式比 for 循环 + append 更 Pythonic。", "example": "squares = [x**2 for x in range(10)]"},
    {"category": "Python", "content": "使用 enumerate 遍历列表时同时获取索引和值。", "example": "for i, item in enumerate(my_list):\n    print(i, item)"},
    {"category": "Python", "content": "用 collections.Counter 快速统计元素出现次数。", "example": "from collections import Counter\ncounts = Counter(['a','b','a'])\nprint(counts['a'])  # 2"},
    {"category": "Python", "content": "用 dict.get() 避免 KeyError。", "example": "age = data.get('age', 0)"},
    {"category": "Debug", "content": "使用 print() 调试时加上前缀方便搜索。", "example": "print(f'[DEBUG] x = {x}, y = {y}')"},
    {"category": "Debug", "content": "遇到 bug 先检查拼写错误，这是最常见的 bug 来源。", "example": ""},
    {"category": "Style", "content": "变量名要有意义，避免使用 a、b、c、tmp 等名字。", "example": "# Bad\nx = 3.14 * r * r\n# Good\narea = 3.14 * radius * radius"},
]

def _init_tables():
    """创建插件数据表"""
    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS plugin_tip_favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        tip_index INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        UNIQUE(user_id, tip_index)
    )""")
    conn.commit()
    conn.close()


def register(app):
    """注册插件"""
    _init_tables()

    # 获取今日贴士（基于日期的伪随机）
    @app.get("/api/plugins/daily-tips/today")
    async def get_today_tip():
        seed = datetime.now().timetuple().tm_yday
        tip = TIPS[seed % len(TIPS)]
        return {"code": 0, "data": {"tip": tip, "day_of_year": seed}}

    # 获取随机贴士
    @app.get("/api/plugins/daily-tips/random")
    async def get_random_tip():
        tip = random.choice(TIPS)
        return {"code": 0, "data": {"tip": tip}}

    # 获取所有贴士列表
    @app.get("/api/plugins/daily-tips/list")
    async def list_tips():
        return {"code": 0, "data": {"tips": TIPS, "total": len(TIPS)}}

    # 收藏贴士（需要登录）
    from fastapi import Depends, Request, HTTPException
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from server import require_auth, db_cursor

    @app.post("/api/plugins/daily-tips/favorite")
    async def favorite_tip(request: Request, user=Depends(require_auth)):
        body = await request.json()
        tip_index = body.get("tip_index")
        if tip_index is None or tip_index < 0 or tip_index >= len(TIPS):
            raise HTTPException(400, "Invalid tip index")
        try:
            with db_cursor() as c:
                c.execute("INSERT INTO plugin_tip_favorites(user_id, tip_index) VALUES(?,?)",
                          (user["id"], tip_index))
            return {"code": 0, "message": "Favorited"}
        except sqlite3.IntegrityError:
            return {"code": 0, "message": "Already favorited"}

    # 获取我的收藏
    @app.get("/api/plugins/daily-tips/favorites")
    async def my_favorites(user=Depends(require_auth)):
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT tip_index, created_at FROM plugin_tip_favorites WHERE user_id=? ORDER BY created_at DESC",
                  (user["id"],))
        rows = c.fetchall()
        conn.close()
        favorites = [{"tip": TIPS[r["tip_index"]], "favorited_at": r["created_at"]} for r in rows]
        return {"code": 0, "data": {"favorites": favorites, "total": len(favorites)}}

    print("[DailyTips] OK: registered 5 endpoints")
```

### 测试

```bash
# 重启服务器后测试
python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/api/plugins/daily-tips/today').read().decode())"
```

---

## 7. 实战示例：积分排行榜插件

一个读取现有用户数据、计算排名的插件。

### plugin.py

```python
"""
积分排行榜插件
根据用户的通过题目数生成排行榜
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "classroom.db"

def register(app):
    from fastapi import Depends, HTTPException
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from server import require_auth

    @app.get("/api/plugins/leaderboard")
    async def leaderboard(limit: int = 20):
        """公开排行榜，按通过题目数降序"""
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("""
            SELECT id, username, nickname, avatar, solved_count, submission_count
            FROM users WHERE status = 1
            ORDER BY solved_count DESC, submission_count ASC
            LIMIT ?
        """, (limit,))
        rows = c.fetchall()
        conn.close()

        board = []
        for i, r in enumerate(rows, 1):
            board.append({
                "rank": i,
                "id": r["id"],
                "username": r["username"],
                "nickname": r["nickname"] or r["username"],
                "avatar": r["avatar"],
                "solved": r["solved_count"],
                "submissions": r["submission_count"],
            })

        return {"code": 0, "data": {"leaderboard": board, "total": len(board)}}

    @app.get("/api/plugins/leaderboard/me")
    async def my_rank(user=Depends(require_auth)):
        """查看当前用户排名"""
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        # 先查总数
        c.execute("SELECT COUNT(*) as cnt FROM users WHERE status=1 AND solved_count > ?",
                  (user["solved_count"] if "solved_count" in user else 0,))
        rank = c.fetchone()["cnt"] + 1

        c.execute("SELECT solved_count, submission_count FROM users WHERE id=?", (user["id"],))
        row = c.fetchone()
        conn.close()

        if not row:
            raise HTTPException(404, "User not found")

        return {"code": 0, "data": {"rank": rank, "solved": row["solved_count"],
                                      "submissions": row["submission_count"]}}

    print("[Leaderboard] OK: registered 2 endpoints")
```

### plugin.json

```json
{
    "name": "积分排行榜",
    "version": "1.0.0",
    "description": "根据用户通过题目数生成排行榜，激励学生学习。"
}
```

---

## 8. 安装与管理

### 安装插件

1. 将插件文件夹复制到 `plugins/` 目录下
2. 确保文件夹中包含 `plugin.py`
3. （推荐）确保文件夹中包含 `plugin.json`
4. 重启服务器

```
code-classroom/
├── plugins/
│   ├── hello-example/      ← 系统自带
│   ├── my-plugin/          ← 你的插件放这里
│   │   ├── plugin.py
│   │   └── plugin.json
│   └── another-plugin/
│       └── plugin.py
├── server.py
└── frontend/
```

### 卸载插件

直接删除 `plugins/` 下对应的文件夹，然后重启服务器即可。

### 查看插件状态

以管理员身份登录，进入 **系统管理 → 插件管理** 页面，可以看到：

- ✅ 已加载的插件（名称、版本、描述）
- ❌ 加载失败的插件（附带错误信息）

### 查看控制台日志

服务器启动时会打印每个插件的加载结果：

```
[Plugin] OK Loaded: Hello World 示例插件 v1.0.0 - 这是一个示例插件...
[Plugin] OK Loaded: 每日编程贴士 v1.0.0 - 每天展示一条编程小技巧
[Plugin] ERROR loading broken-plugin: SyntaxError: invalid syntax (plugin.py, line 5)
```

---

## 9. 调试技巧

### 1. 使用 print 调试

```python
def register(app):
    print("[MyPlugin] Registering...")  # 会在服务器控制台输出

    @app.get("/api/plugins/test")
    async def test():
        print("[MyPlugin] test() called")  # 每次请求都会输出
        return {"code": 0}
```

### 2. 独立测试插件逻辑

在插件文件底部加一个测试入口：

```python
# === 以下为测试代码 ===
if __name__ == "__main__":
    # 独立运行时测试数据库连接等
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    print("DB connection OK")
    conn.close()
```

```bash
# 直接运行测试
python plugins/my-plugin/plugin.py
```

### 3. 用 curl / Python 测试 API

```bash
# Python 一行测试
python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/api/plugins/my-endpoint').read().decode())"

# 带 JWT token 的请求
python -c "
import urllib.request
req = urllib.request.Request('http://localhost:8000/api/plugins/my-protected')
req.add_header('Authorization', 'Bearer YOUR_TOKEN_HERE')
print(urllib.request.urlopen(req).read().decode())
"
```

### 4. 常见错误排查

| 症状 | 原因 | 解决 |
|------|------|------|
| 插件未出现在管理页面 | 文件夹没有 `plugin.py` | 确保文件名正确 |
| 显示 ❌ 错误状态 | `plugin.py` 有语法错误或运行时异常 | 查看控制台日志中的错误信息 |
| API 返回 404 | 路由未注册成功或路径拼错 | 检查控制台是否有加载成功日志 |
| API 返回 401 | 需要 `Depends(require_auth)` 但未传 token | 前端请求会自动带 token，手动测试需加上 |
| 数据库操作失败 | 表不存在或字段名错误 | 检查 `_init_tables()` 是否被调用 |

---

## 10. 最佳实践与注意事项

### ✅ 推荐做法

1. **路由前缀**：统一使用 `/api/plugins/your-name/` 前缀
2. **表名前缀**：插件创建的表统一使用 `plugin_` 前缀
3. **错误处理**：使用 `try/except` 包裹可能出错的操作
4. **幂等初始化**：建表用 `CREATE TABLE IF NOT EXISTS`
5. **版本号**：遵循语义化版本（SemVer）`MAJOR.MINOR.PATCH`
6. **文档**：在 `plugin.json` 的 `description` 中简要说明功能
7. **最小依赖**：尽量只用 Python 标准库，减少额外安装

```python
def register(app):
    # ✅ 好的实践
    _init_tables()  # 幂等初始化

    @app.get("/api/plugins/my-feature")
    async def my_feature():
        try:
            # 业务逻辑
            return {"code": 0, "data": result}
        except Exception as e:
            # 错误处理
            return {"code": 1, "message": str(e)}
```

### ❌ 避免做法

1. **不要覆盖系统路由**：避免注册 `/api/users`、`/api/exercises` 等系统路径
2. **不要修改系统表**：不要 ALTER 或 DROP 以 `users`、`exercises`、`discussions` 等开头的系统表
3. **不要阻塞主线程**：长时间运行的操作用 `asyncio.create_task()` 放到后台
4. **不要硬编码路径**：使用 `Path(__file__).parent` 获取插件目录

```python
def register(app):
    # ❌ 不要这样做
    @app.get("/api/users")  # 会覆盖系统路由！
    async def my_users():
        ...

    # ✅ 应该这样
    @app.get("/api/plugins/my-feature/users")
    async def my_feature_users():
        ...
```

### 🔒 安全注意事项

1. **验证输入**：永远不要信任用户输入
2. **参数化 SQL**：使用 `?` 占位符，不要拼接 SQL 字符串
3. **权限检查**：涉及用户数据的端点一定要验证身份
4. **敏感信息**：不要在插件中硬编码密码、密钥等

```python
# ❌ SQL 注入风险
c.execute(f"SELECT * FROM users WHERE id = {user_id}")

# ✅ 参数化查询
c.execute("SELECT * FROM users WHERE id = ?", (user_id,))
```

---

## 11. API 参考：可用的后端工具

以下工具和函数定义在 `server.py` 中，插件可以直接 import 使用：

### 数据库工具

```python
from server import db_cursor

# 使用上下文管理器操作数据库（自动 commit 和 close）
with db_cursor() as c:
    c.execute("SELECT * FROM users WHERE role=?", ("student",))
    rows = c.fetchall()  # 返回 sqlite3.Row 对象列表
    row = c.fetchone()   # 返回单个 sqlite3.Row 对象
    dict_row = dict(row) # 转为字典
```

### 认证工具

```python
from server import require_auth, jwt_encode, jwt_decode
from fastapi import Depends

# 在路由中使用依赖注入验证用户
@app.get("/api/plugins/my-endpoint")
async def my_endpoint(user=Depends(require_auth)):
    # user = {"id": 1, "username": "admin", "role": "admin", "email": "...", ...}
    ...
```

### 其他可用 import

```python
from server import app        # FastAPI 应用实例
from server import DB_PATH    # 数据库文件路径 (Path 对象)
from server import PLUGIN_DIR # 插件目录路径 (Path 对象)
from server import UPLOAD_DIR # 上传文件目录 (Path 对象)
from server import HTTPException  # FastAPI HTTP 异常
```

### 系统内置数据库表（只读）

插件可以查询（但不应该修改）以下系统表：

| 表名 | 主要字段 | 说明 |
|------|----------|------|
| `users` | id, username, nickname, role, avatar, solved_count, submission_count, status | 用户表 |
| `exercises` | id, title, description, difficulty, language, test_cases | 练习题表 |
| `submissions` | id, user_id, exercise_id, code, language, status, score | 提交记录表 |
| `discussions` | id, title, description, owner_id | 讨论区表 |
| `discussion_posts` | id, discussion_id, user_id, parent_id, content | 讨论帖子表 |
| `tasks` | id, title, description, deadline, teacher_id | 作业任务表 |
| `task_submissions` | id, task_id, user_id, content, score, feedback | 任务提交表 |

---

## 附录：项目文件结构总览

```
code-classroom/
├── server.py                 ← 主服务器（FastAPI）
├── plugins/                  ← 插件目录
│   ├── hello-example/        ← 示例插件
│   │   ├── plugin.py
│   │   └── plugin.json
│   └── your-plugin/          ← 你的插件
│       ├── plugin.py
│       └── plugin.json
├── frontend/                 ← 前端文件
│   ├── index.html
│   ├── css/
│   └── js/
│       └── app.js
├── data/                     ← 数据目录
│   └── classroom.db          ← SQLite 数据库
├── uploads/                  ← 上传文件
├── netdisk/                  ← 网盘文件
├── scripts/                  ← 辅助脚本
│   ├── start.bat
│   └── toggle-demo-accounts.py
├── README.md
├── README_CN.md
└── README-plugins.md         ← 本文档
```

---

> 💡 **有问题？** 查看 `plugins/hello-example/` 中的示例插件，它是学习插件开发的最佳起点。祝开发愉快！🎉
