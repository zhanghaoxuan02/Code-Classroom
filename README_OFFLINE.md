# 离线/内网部署指南

本平台设计为**完全离线可用**，适合学校机房、内网教学环境，无需互联网连接。

---

## 离线包清单

### Python 依赖（packages/ 目录）

所有 Python 依赖的 `.whl` 安装包已内置于 `packages/` 目录（20 个文件，约 3.8 MB）：

| 包名 | 说明 |
|------|------|
| `fastapi` | Web 框架 |
| `uvicorn[standard]` | ASGI 服务器 |
| `pydantic` | 数据验证 |
| `python-multipart` | 文件上传支持 |
| `starlette` | FastAPI 底层框架 |
| `pydantic-core` | Pydantic 核心（编译版） |
| `click`, `h11`, `httptools` | uvicorn 依赖 |
| `colorama`, `python-dotenv`, `pyyaml` | 工具库 |
| `watchfiles`, `websockets` | 热重载和 WebSocket |
| `anyio`, `idna` | 异步 I/O 支持 |
| `annotated-types`, `typing-extensions` | 类型注解支持 |
| `typing-inspection`, `annotated-doc` | FastAPI 依赖 |

> ⚠️ 注意：当前 `packages/` 中的二进制包（如 `pydantic_core`, `httptools`, `watchfiles`, `websockets`, `pyyaml`）主要适用于WIndows+64位平台内置。虽然也内置了Win32平台和Linux x86_64平台的包，但如果出现启动失败，还是需要重新在联网机器上执行：
> ```bat
> pip download fastapi "uvicorn[standard]" pydantic python-multipart -d packages/
> ```

### 前端资源（frontend/vendor/ 目录）

所有 JavaScript、CSS、字体资源已完整本地化：

| 资源 | 说明 |
|------|------|
| `codemirror/` | 代码编辑器（10 个文件） |
| `marked/` | Markdown 渲染器 |
| `easymde/` | 富文本 Markdown 编辑器 |
| `fonts/` | Google Fonts（Inter + JetBrains Mono，13 个 woff2） |
| `fontawesome/` | Font Awesome 图标（all.min.css + 8 个 woff2/ttf） |

---

## 部署步骤

### 1. 安装 Python（仅首次）

从官网下载 Python 3.8+ 安装包（`.exe`），提前下载好拷贝到服务器：

- 官网：https://www.python.org/downloads/
- 安装时勾选 **"Add Python to PATH"**

### 2. 拷贝项目目录

将整个 `code-classroom/` 目录复制到服务器（U 盘、局域网共享等均可）。

### 3. 启动服务

双击运行：

```
scripts\start.bat
```

启动脚本会自动检测 `packages/` 目录并**离线安装**依赖，无需联网。

**如果是Linux，可运行scripts\start.sh用来快速部署**

**如果是Mac OS，建议直接利用命令运行server.py**

### 4. 学生访问

在浏览器中访问服务器的局域网 IP：

```
http://192.168.x.x:8000
```

将 `192.168.x.x` 替换为服务器的实际 IP 地址（BAT脚本里已显示）。

---

## 演示账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | `admin` | `password123` |
| 教师 | `teacher_wang` | `password123` |
| 学生 | `student_zhang` | `password123` |

---

## 常见问题

**Q: 启动脚本提示"离线安装失败"？**

A: 检查 `packages/` 目录是否完整（应有 20 个 `.whl` 文件）。如果平台架构与当前不同（如 32 位 Python、Linux），请在联网机器上重新运行：

```bat
pip download fastapi "uvicorn[standard]" pydantic python-multipart -d packages/
```

**Q: 学生能访问但图标不显示？**

A: 检查 `frontend/vendor/fontawesome/webfonts/` 下是否有 8 个字体文件（3 个 woff2 + 5 个 ttf/woff2）。

**Q: 如何允许局域网内的学生访问？**

A: 默认监听 `0.0.0.0:8000`，局域网内直接访问服务器 IP 即可。如有防火墙，需开放 TCP 8000 端口。

**Q: 代码执行（Python/JavaScript/C/C++）是否需要联网？**

A: 不需要。代码执行使用 `subprocess` 调用本机已安装的解释器（Python 内置，JS 需要 Node.js，C/C++ 需要 GCC）。

---

## 目录结构

```
code-classroom/
├── server.py              # 主服务文件
├── requirements.txt       # Python 依赖声明
├── packages/              # ★ 离线 Python 依赖包（.whl 文件）
│   ├── fastapi-*.whl
│   ├── uvicorn-*.whl
│   └── ... (共 20 个文件)
├── frontend/
│   ├── index.html         # 前端入口
│   ├── js/
│   │   ├── app.js         # 主应用逻辑
│   │   └── vendor-loader.js  # 自动 CDN/离线切换
│   ├── css/
│   │   └── style.css
│   └── vendor/            # ★ 离线前端资源
│       ├── codemirror/
│       ├── marked/
│       ├── easymde/
│       ├── fonts/         # Google Fonts 本地化
│       └── fontawesome/   # Font Awesome 图标本地化
├── scripts/
│   └── start.bat          # Windows 一键启动（自动离线安装）
├── plugins/               # 插件目录
│   └── exam-system/       # 在线考试系统插件
└── learning/              # 学习资源目录
```
