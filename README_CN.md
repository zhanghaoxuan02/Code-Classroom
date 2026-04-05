# Code Classroom - 在线编程教学平台

<p align="center">
  <a href="README.md">🇺🇸 English</a> | <a href="README_CN.md">🇨🇳 简体中文</a>
</p>

一个安全、自包含的在线编程教学平台。**无需 Docker、Redis、MySQL、Nginx** —— 只需要 Python！

## ✨ 功能特性

### 🎓 学生端
- 在线编写代码，内置 CodeMirror 编辑器（支持 Python / JavaScript / C / C++）
- 即时运行代码，实时反馈执行结果
- 个人代码池（自动保存草稿 + 手动保存代码片段）
- 学习进度追踪与统计仪表盘
- 课程选修系统（凭密码自主选课）

### 👨‍🏫 教师端
- 课程管理、学生选课管理
- 创建练习题，支持自定义测试用例（Markdown 格式题目描述）
- 查看学生提交记录与得分
- 发布课程公告
- **作业任务系统**：布置作业、设置截止时间、批改评分
- **班级网盘**：上传课件资料供学生下载

### 🔧 管理员端
- 用户管理（创建/禁用/重置密码）
- 角色变更（学生/教师/管理员）
- 系统设置（站点名称、注册开关、默认网盘配额）
- 插件管理

### 🔒 系统特性
- subprocess 沙箱隔离执行，超时限制保护
- 提交频率限制（每学生每分钟 10 次）
- JWT 认证，基于角色的访问控制（学生 / 教师 / 管理员）
- SQLite 数据库（零配置，单文件存储）
- 插件系统，支持功能扩展

## 🚀 快速开始

### 环境要求
- Python 3.8+（需安装 pip）

### 一键启动

**Windows：**
```
双击运行：scripts\start.bat
```

**Linux / macOS：**
```bash
# 联网安装
pip install -r requirements.txt

# 离线安装（无需联网，依赖包已内置在仓库中）
pip install --no-index --find-links packages/ --find-links packages/linux_x86_64/ -r requirements.txt

# 启动服务
python server.py
```

启动后打开 **http://localhost:8000**

### 🔌 离线部署

仓库的 `packages/` 目录已包含所有 Python 依赖（.whl 包），**完全断网环境**下也能运行：

1. `git clone https://github.com/zhanghaoxuan02/Code-Classroom.git`
2. `pip install --no-index --find-links packages/ [平台子目录] -r requirements.txt`
3. `python server.py`

全过程无需网络连接。

### 演示账号（密码均为 `password123`）

| 角色   | 用户名        |
|--------|--------------|
| 管理员 | admin        |
| 教师   | teacher_wang |
| 教师   | teacher_li   |
| 学生   | student_zhang|
| 学生   | student_liu  |

## 📁 项目结构

```
code-classroom/
  server.py              # 纯 Python 后端（FastAPI + SQLite + 沙箱执行）
  requirements.txt       # Python 依赖
  data/                  # SQLite 数据库（首次运行自动创建）
  learning/              # 学习资源目录（HTML/JSON/MD）
    course_1/            # 课程ID为1的学习资源
    course_2/            # 课程ID为2的学习资源
  plugins/               # 插件目录
  frontend/
    index.html           # 主页面（单页应用）
    css/style.css        # 样式文件
    js/app.js            # 前端逻辑（API 通信 + 路由 + 页面渲染）
  scripts/
    start.bat            # Windows 一键启动脚本
  README.md              # 英文说明
  README_CN.md           # 中文说明（本文件）
  README-learning.md     # 学习资源编写指南
```

## 🏗️ 系统架构

```
浏览器 <--HTTP--> FastAPI (server.py)
                      |
              +-------+-------+
              |               |
           SQLite         subprocess
           (数据库)      (代码沙箱)
```

- **后端**：单文件 Python，FastAPI 框架
- **数据库**：SQLite（自动创建于 `data/classroom.db`）
- **代码执行**：subprocess + 超时 + 资源限制
- **前端**：纯静态 HTML/CSS/JS，由 FastAPI 托管
- **无外部依赖**：不需要 Docker、Redis、MySQL、Nginx

## 📚 核心模块

### 学习资源系统
- 支持 HTML / JSON / Markdown 三种格式
- 结构化课程内容，分章节展示
- 代码示例、提示框、思考题
- 详见 [README-learning.md](README-learning.md) 编写指南

### 作业任务系统
- 教师布置作业，支持 Markdown + 图片附件
- 设置截止时间，逾期标记
- 学生提交，教师批改评分
- 成绩统计与反馈

### 班级网盘
- 教师上传课件、资料
- 学生下载学习资源
- 配额管理（默认每个目录 200MB）

### 考试系统（插件）
- 多种题型：单选、多选、判断、填空、编程题、实操题
- 客观题自动判卷，主观题人工批改
- 倒计时、自动保存答卷
- 成绩统计与分布图表

### 讨论区
- 课程专属讨论区
- 文件附件（7天自动过期清理）
- 帖子回复支持嵌套

### 班级管理
- 创建班级，管理班级成员
- 班级专属讨论区、网盘、作业
- 学生按班级组织

## 📡 API 接口

### 认证与用户
| 方法   | 路径                    | 说明             |
|--------|-------------------------|------------------|
| POST   | /api/auth/login         | 用户登录         |
| POST   | /api/auth/register      | 学生注册         |
| GET    | /api/auth/me            | 获取当前用户信息 |
| GET    | /api/users              | 用户列表（管理员）|

### 课程与学习
| 方法   | 路径                           | 说明              |
|--------|--------------------------------|-------------------|
| GET    | /api/courses                   | 课程列表          |
| GET    | /api/courses/{id}/exercises    | 课程下的题目      |
| GET    | /api/courses/{id}/learning     | 课程学习资源      |
| POST   | /api/learning/upload           | 上传学习资源      |

### 题目与提交
| 方法   | 路径                    | 说明              |
|--------|-------------------------|-------------------|
| GET    | /api/exercises          | 题目列表          |
| GET    | /api/exercises/{id}     | 题目详情          |
| POST   | /api/submissions        | 提交代码（同步）  |
| GET    | /api/submissions        | 提交历史记录      |
| POST   | /api/execute            | 直接运行（不保存）|

### 其他
| 方法   | 路径                    | 说明              |
|--------|-------------------------|-------------------|
| GET    | /api/code-pool          | 个人代码池        |
| POST   | /api/code-pool          | 保存代码          |
| GET    | /api/dashboard          | 统计数据          |
| GET    | /api/announcements      | 公告列表          |
| GET    | /api/health             | 健康检查          |

## 📖 文档

- [学习资源编写指南](README-learning.md) - 如何使用 JSON/HTML/Markdown 编写教程

## 📄 许可证

MIT
