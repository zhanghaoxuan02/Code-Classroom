# 📘 Code Classroom API 接口完全指南

> **版本**: v2.0 | **最后更新**: 2026-04-03  
> **基础URL**: `http://localhost:8000`  
> **认证方式**: `Authorization: Bearer <jwt_token>` 或 Query Param `?token=xxx`  
> **响应格式**: 统一 `{ code: 0, data: {...}, message: "..." }` (错误时 `code` 为非零 HTTP 状态码)

---

## 📋 目录

1. [认证与用户](#1--认证与用户)
2. [课程管理](#2--课程管理)
3. [选课系统](#3--选课系统)
4. [题库练习](#4--题库练习)
5. [提交评测](#5--提交评测)
6. [代码池](#6--代码池)
7. [代码执行](#7--代码执行)
8. [班级管理](#8--班级管理)
9. [班级讨论区](#9--班级讨论区)
10. [班级网盘](#10--班级网盘)
11. [作业任务](#11--作业任务)
12. [学习中心](#12--学习中心)
13. [博客中心](#13--博客中心)
14. [公告管理](#14--公告管理)
15. [用户管理（教师/管理员）](#15--用户管理教师管理员)
16. [系统管理（仅管理员）](#16--系统管理仅管理员)
17. [仪表盘](#17--仪表盘)
18. [在线考试插件](#18--在线考试插件)
19. [健康检查与静态资源](#19--健康检查与静态资源)
20. [通用约定](#20--通用约定)

---

## 1️⃣ 认证与用户

### POST `/api/auth/login` — 登录

**权限**: 公开  
**Content-Type**: `application/json`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | ✅ | 用户名或邮箱 |
| password | string | ✅ | 密码 |

**响应**: `{ code: 0, data: { token: "jwt...", user: { id, username, email, role, avatar, ... } } }`

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}'
```

### POST `/api/auth/register` — 注册

**权限**: 公开（受系统设置 `register_enabled` 控制）  
**限制**: 用户名≥3字符，密码≥6字符，邮箱含@，角色固定为 `student`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | ✅ | 用户名 |
| email | string | ✅ | 邮箱 |
| password | string | ✅ | 密码 |
| student_number | string | ❌ | 学号 |
| class_name | string | ❌ | 班级 |

### GET `/api/auth/me` — 获取当前用户信息

**权限**: 需登录

返回完整用户对象：id, username, email, role, avatar, nickname, student_number, class_name 等。

### PUT `/api/profile` — 更新个人资料

**权限**: 需登录（只能改自己的）

| 字段 | 类型 | 说明 |
|------|------|------|
| nickname | string | 昵称 |
| avatar | string | 头像颜色/URL |
| email | string | 邮箱 |
| student_number | string | 学号 |
| class_name | string | 班级 |

### PUT `/api/change-password` — 修改密码

**权限**: 需登录

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| old_password | string | ✅ | 当前密码 |
| new_password | string | ✅ | 新密码（≥6字符） |

---

## 2️⃣ 课程管理

### GET `/api/courses` — 课程列表

**权限**: 需登录  
**Query 参数**: `page`, `page_size`, `search`

| 角色 | 可见范围 |
|------|----------|
| teacher | 自己创建的课程 |
| student | 所有课程 + enrolled 标记 |

**响应字段**: items[].teacher_name, student_count, exercise_count, enrolled(bool)

### POST `/api/courses` — 创建课程

**权限**: Teacher / Admin

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | ✅ | 课程名称 |
| description | string | ❌ | 描述 |
| enroll_password | string | ❌ | 选课密码（空则不开放自主选课） |
| learning_folder | string | ❌ | 关联学习目录名（如 `python_basic`） |

**响应**: `{ data: { id: 新课程ID } }`

### PUT `/api/courses/{cid}` — 更新课程

**权限**: 教师(自己的) / Admin

可更新字段: name, description, status, enroll_password, learning_folder

### GET `/api/courses/{cid}/exercises` — 课程习题列表

**权限**: 需登录；学生须先选该课程  
**Query**: `page`, `page_size`

学生额外附带 my_status (提交状态+最高分)

### GET `/api/courses/{cid}/announcements` — 课程公告列表

**权限**: 需登录；学生须先选该课程

### GET `/api/courses/{cid}/learning` — 课程学习资源

**权限**: 需登录；学生须先选该课程  
**说明**: 扫描 `learning/course_{cid}/` 目录下的 .html/.json/.md 文件

### GET `/api/courses/{cid}/students` — 课程选课学生列表

**权限**: Teacher / Admin

### GET `/api/courses/{cid}/exercises/export` — 导出课程习题JSON

**权限**: Teacher / Admin  
**说明**: 包含完整测试用例和参考代码，可用于备份或迁移

---

## 3️⃣ 选课系统

### POST `/api/enrollments` — 选课

**权限**: 需登录

| 场景 | 额外参数 | 说明 |
|------|----------|------|
| 学生自选 | `course_id` + `password` | 需要课程的选课密码 |
| 教师指派 | `course_id` + `student_id` | 无需密码 |

### POST `/api/enrollments/remove` — 退课

**权限**: 需登录  
**参数**: `course_id` (+ `student_id`: 教师可踢人)

### POST `/api/enrollments/batch` — 批量选课

**权限**: Teacher / Admin  
**参数**: `course_id`, `student_ids: []` (最多100人)

### GET `/api/enrollments` — 我的已选课程

**权限**: 需登录  
**附加字段**: exercise_count, completed_count

---

## 4️⃣ 题库练习

### GET `/api/exercises` — 全局题库列表

**权限**: 需登录；学生只能看已选课程的题 + 公共题(course_id IS NULL)  
**Query**: `page`, `page_size`, `difficulty`(easy/medium/hard), `language`, `search`

学生附带 `my_status` (提交状态+最高分)

### GET `/api/exercises/{eid}` — 习题详情

**权限**: 需登录；学生须已选该题所属课程  
**注意**: 不返回 test_cases 内容，只返回 test_case_count

### POST `/api/exercises` — 创建全局习题

**权限**: Teacher / Admin

| 字段 | 必填 | 说明 |
|------|------|------|
| title | ✅ | 标题 |
| description | ✅ | Markdown 描述 |
| test_cases | ✅ | JSON数组 `[{"input":"...","output":"..."}]` |
| course_id | ❌ | 归属课程（NULL=公共题） |
| difficulty | ❌ | easy/medium/hard |
| language | ❌ | python/javascript/c/cpp |
| template_code | ❌ | 模板代码 |
| reference_code | ❌ | 参考答案 |
| check_code | ❌ | 是否开启代码检查(0/1) |
| time_limit | ❌ | 时间限制(秒)，默认10 |
| memory_limit | ❌ | 内存限制(KB)，默认256 |

### POST `/api/courses/{cid}/exercises` — 在课程下创建习题

**权限**: Teacher / Admin  
**同上参数**, course_id 固定为 cid，sort_order 自动追加

### POST `/api/courses/{cid}/exercises/batch` — 批量上传习题

**权限**: Teacher / Admin  
**参数**: `{ exercises: [{title, description, test_cases, ...}, ...] }`  
**限制**: 单次最多 100 道，单个测试用例 JSON ≤ 65535 字符

### PUT `/api/courses/{cid}/exercises/{eid}` — 编辑课程习题

**权限**: Teacher / Admin

### DELETE `/api/courses/{cid}/exercises/{eid}` — 删除课程习题

**权限**: Teacher / Admin（级联删除相关提交记录）

### PUT `/api/courses/{cid}/exercises/{eid}/move` — 移动题目

**权限**: Teacher / Admin  
**参数**: `course_id`(移到其他课程) 或 `direction`("up"/"down" 交换排序)

---

## 5️⃣ 提交评测

### POST `/api/submissions` — 提交代码

**权限**: Student；须已选该题所属课程  
**频率限制**: 每分钟最多 10 次

| 字段 | 必填 | 说明 |
|------|------|------|
| exercise_id | int ✅ | 题目ID |
| code | string ✅ | 代码内容（≤64KB） |
| language | string | python/javascript/c/cpp |

**同步返回**: status, score, stdout, stderr, test_results[], execution_time, code_check

**代码检查**: 若题目开启 check_code 且有 reference_code，会先比对代码，不一致直接判 0 分

### GET `/api/submissions/{sid}` — 提交详情

**权限**: 需登录；学生只能看自己的  
**包含**: 完整测试结果、代码、执行时间等

### GET `/api/submissions` — 提交记录列表

**权限**: 需登录；学生只看自己的  
**Query**: `page`, `page_size`, `exercise_id`

---

## 6️⃣ 代码池

每个学生的个人代码草稿空间。

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/code-pool` | 仅自己 | 代码草稿列表 |
| GET | `/api/code-pool/{pid}` | 仅自己 | 草稿详情 |
| POST | `/api/code-pool` | 仅自己 | 保存草稿 |
| PUT | `/api/code-pool/{pid}` | 仅自己 | 更新草稿 |
| DELETE | `/api/code-pool/{pid}` | 仅自己 | 删除草稿 |

**POST/PUT body**: `{ code, title?, language?, exercise_id? }`

---

## 7️⃣ 代码执行

### POST `/api/execute` — 直接执行代码（不保存）

**权限**: 需登录  
**支持语言**: Python, JavaScript, C, C++  
**沙箱环境**: subprocess 隔离，有时间/内存限制

| 字段 | 必填 | 说明 |
|------|------|------|
| code | ✅ | 代码 |
| language | | python/js/c/cpp |
| input | | 标准输入 |
| time_limit | | 秒，默认10 |

**响应**: `{ stdout, stderr, exit_code, time_ms }`

---

## 8️⃣ 班级管理

### GET `/api/classes` — 班级列表

**权限**: 需登录  
**附加统计**: discussion_count, student_count, creator_name

### POST `/api/classes` — 创建班级

**权限**: Teacher / Admin  
**特殊逻辑**: 同名班级如果之前被软删(status=0)会**恢复**而非报错

| 字段 | 必填 | 说明 |
|------|------|------|
| name | ✅ | 班级名（唯一） |
| description | ❌ | 描述 |

**ID 回收**: 复用已被删除的最小空闲 ID（参见[通用约定](#_alloc-id-回收机制)）

### PUT `/api/classes/{cid}` — 更新班级

**权限**: Teacher / Admin

### DELETE `/api/classes/{cid}` — 删除班级（软删除）

**权限**: Admin only  
**效果**: `status=0`，ID 可被回收复用

### GET `/api/classes/{cid}/students` — 班级学生列表

**权限**: Teacher / Admin  
**来源**: users 表中 class_name 匹配的学生

### GET `/api/classes/{cid}/available-students` — 可添加的学生

**权限**: Teacher / Admin  
**Query**: `search` (按姓名/学号搜索)  
**上限**: 200 人

### POST `/api/classes/{cid}/students` — 批量添加学生到班级

**权限**: Teacher / Admin  
**参数**: `student_ids: []` (最多100人)  
**效果**: 设置用户的 class_name

### DELETE `/api/classes/{cid}/students/{sid}` — 从班级移除学生

**权限**: Teacher / Admin  
**效果**: 清除该生的 class_name

---

## 9️⃣ 班级讨论区

### GET `/api/discussions` — 讨论区列表

**权限**: 需登录  
**角色差异**: 教师看全部，学生看 global + 已加入的 class/personal

**附加字段**: member_count, post_count, my_role, is_muted, class_name

### POST `/api/discussions` — 创建讨论区

**权限**: Teacher / Admin

| 字段 | 必填 | 说明 |
|------|------|------|
| title | ✅ | 标题 |
| description | ❌ | 描述 |
| scope | | global/class/personal |
| class_id | ❌ | scope=class 时必填 |

**scope=class 时**: 自动加入对应班级所有学生为成员

### DELETE `/api/discussions/{did}` — 删除讨论区

**权限**: Teacher(自己的) / Admin  
**效果**: 软删除 status=0

### GET `/api/discussions/{did}/posts` — 帖子列表（主帖）

**权限**: 成员可见；global 对所有人开放  
**Query**: `page`, `page_size`  
**附加**: reply_count, file_id, file_name, file_size

### GET `/api/discussions/{did}/posts/{pid}/replies` — 回复列表

**权限**: 成员可见

### POST `/api/discussions/{did}/posts` — 发帖 / 回复

**权限**: 成员可发帖；被禁言者不可  
**参数**: `{ content, file_id?, parent_id? }`  
- parent_id 空 = 主帖
- parent_id 有值 = 回复该帖
- file_id = 关联已上传的附件

### DELETE `/api/discussions/{did}/posts/{pid}` — 删除帖子及所有回复

**权限**: Teacher / Admin（须是该讨论区成员）

### POST `/api/discussions/{did}/files` — 上传附件

**权限**: 成员  
**大小限制**: 学生 ≤10MB，**教师/管理员 无限制**

**Content-Type**: `multipart/form-data`; 字段名 `file`  
**存储位置**: `uploads/` 目录，UUID 重命名  
**过期清理**: 7 天后自动删除（后台每小时执行）

### GET `/api/files/{fid}/download` — 下载文件

**权限**: 需登录  
**覆盖范围**: discussion_files + netdisk_files（网盘文件自动增加下载计数）

### GET `/api/files/{fid}/preview` — 在线预览文件

**权限**: 需登录  
**说明**: 返回 inline disposition，浏览器可直接显示图片/PDF

### POST `/api/discussions/{did}/members` — 添加成员

**权限**: Teacher / Admin

### DELETE `/api/discussions/{did}/members/{uid}` — 移除成员

**权限**: Teacher / Admin（不能移除自己）

### PUT `/api/discussions/{did}/members/{uid}/mute` — 禁言/解禁

**权限**: Teacher / Admin  
**参数**: `{ muted: true/false }`

### GET `/api/discussions/{did}/members` — 成员列表

**权限**: 须是成员

---

## 🔟🃣 班级网盘

### GET `/api/netdisk` — 网盘文件夹列表

**权限**: 需登录  
**角色差异**: 教师看全部；学生看 global + 同班 + 已加入讨论区的网盘  
**附加**: file_count, used_size, discussion_name, class_name

### POST `/api/netdisk` — 创建网盘文件夹

**权限**: Teacher / Admin

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| name | ✅ | - | 文件夹名 |
| description | ❌ | - | 描述 |
| scope | | global | global/class/personal |
| class_id | ❌ | - | scope=class 时 |
| max_size | ❌ | 200MB | 配额上限 |

### GET `/api/netdisk/{fid}/files` — 网盘文件列表

**权限**: 按 scope 规则判断（global 全可见 / class 同班 / personal 本人 / discussion 成员）

### POST `/api/netdisk/{fid}/upload` — 上传文件到网盘

**权限**: Teacher / Admin  
**限制**: 受配额余量约束

### DELETE `/api/netdisk/files/{nfid}` — 删除网盘文件

**权限**: Teacher / Admin（物理删除）

### DELETE `/api/netdisk/{fid}` — 删除网盘文件夹

**权限**: Teacher(自己的) / Admin  
**效果**: 软删除 + 物理删除所有子文件

### PUT `/api/admin/netdisk/{fid}/quota` — 修改网盘配额

**权限**: Admin or Teacher  
**参数**: `{ max_size }`（最小 10MB）

---

## 1️⃣1️⃣ 作业任务

### GET `/api/tasks` — 任务列表

**权限**: 需登录  
**角色差异**:
- **学生**: global + 已选课任务 + 本班级任务；附加 my_status/my_score/my_submission
- **教师**: 自己创建的任务；附加 submission_count/graded_count

**Query**: `page`, `page_size`, `course_id`, `class_id`(仅教师)

### POST `/api/tasks` — 创建任务

**权限**: Teacher / Admin

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| title | ✅ | - | 标题 |
| content | ❌ | "" | Markdown 内容 |
| deadline | ❌ | - | 截止时间 |
| course_id | ❌ | - | 关联课程 |
| class_id | ❌ | - | 关联班级 |
| scope | | global | global/course/class |

### GET `/api/tasks/{tid}` — 任务详情

**权限**: 需登录  
**角色差异**:
- **学生**: 返回 `my_submission` (自己的提交)
- **教师/管理员**: 返回 `submissions[]` (所有学生提交列表，含 content 内容)

### PUT `/api/tasks/{tid}` — 更新任务

**权限**: 作者 or Admin  
**可更新**: title, content, deadline

### DELETE `/api/tasks/{tid}` — 删除任务

**权限**: 作者 or Admin

### POST `/api/tasks/{tid}/submit` — 学生提交作业

**权限**: Student only  
**参数**: `{ content?: "作业内容" }`  
**限制**: 每名学生每道任务只有一个提交记录（UPSERT）

### PUT `/api/tasks/{tid}/grade` — 批改作业

**权限**: Teacher / Admin

| 字段 | 必填 | 说明 |
|------|------|------|
| student_id | ✅ | 待批改学生ID |
| score | ❌ | 分数 (0-100) |
| feedback | ❌ | 反馈文本 |

**效果**: 设 status='graded', 记录 graded_at

---

## 1️⃣2️⃣ 学习中心

### GET `/api/learning/list` — 学习目录结构

**权限**: 需登录  
**扫描目录**: `learning/` 下的一二级目录结构  
**过滤**: 绑定了课程的子目录，学生必须已选课才可见

**响应**: `[{ type:"folder"/"file", name, path, children?, filename?, ext?, size }]`

### GET `/api/learning/file/{filepath:path}` — 读取学习资料

**权限**: 需登录；学生受选课权限控制；防路径穿越校验  
**支持格式**: .html, .json, .md

### POST `/api/learning/upload` — 上传学习资料

**权限**: Teacher / Admin  
**Content-Type**: multipart/form-data; 字段 `file` + `folder?(目标子目录)`  
**允许类型**: .html, .json, .md

### DELETE `/api/learning/file/{filepath:path}` — 删除学习资料

**权限**: Teacher / Admin

---

## 1️⃣3️⃣ 博客中心

### GET `/api/blog` — 博客文章列表

**权限**: 需登录；学生只能看到 published  
**Query**: `page`, `limit`(1-50), `status`(draft/published, 教师用), `keyword`

**附加**: content_preview(前300字), attachment_count, author_name

### POST `/api/blog` — 创建文章

**权限**: Teacher / Admin

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| title | ✅ | - | 标题 |
| content | ✅ | "" | Markdown 正文 |
| summary | ❌ | "" | 摘要（留空则自动截取正文前300字） |
| cover_image | ❌ | null | 封面图 URL |
| status | | draft | draft/published |

**status=published 时**: 自动设置 published_at

### GET `/api/blog/{bid}` — 文章详情

**权限**: 需登录；学生不能看 draft  
**副作用**: 自动 view_count +1  
**附加**: author_info, attachments[]

### PUT `/api/blog/{bid}` — 更新文章

**权限**: 作者 or Admin  
**可更新**: title, content, summary, cover_image, status  
**draft→published**: 自动填充 published_at

### DELETE `/api/blog/{bid}` — 删除文章

**权限**: 作者 or Admin  
**效果**: 物理删除附件文件 + 级联删除记录(ON DELETE CASCADE)

### POST `/api/blog/{bid}/attachments` — 上传博客附件 ⭐无大小限制

**权限**: 作者 or Admin  
**Content-Type**: multipart/form-data; 字段 `file`  
**存储**: `blog_files/` 目录，UUID 重命名

### DELETE `/api/blog/attachments/{att_id}` — 删除博客附件

**权限**: 作者 or Admin

### GET `/api/blog/attachments/{att_id}/download` — 下载博客附件

**权限**: 需登录；draft 文章的附件学生不可下载  
**副作用**: download_count +1

### GET `/api/blog/attachments/{att_id}/preview` — 在线预览附件

**权限**: 需登录；inline 显示

---

## 1️⃣4️⃣ 公告管理

### GET `/api/announcements` — 公告列表

**权限**: 需登录  
**Query**: `course_id?` (不传则全局前20条)

### POST `/api/announcements` — 发布公告

**权限**: Teacher / Admin

| 字段 | 必填 | 说明 |
|------|------|------|
| course_id | ❌ | 关联课程(NULL=全局公告) |
| title | ✅ | 标题 |
| content | ✅ | 内容 |
| priority | ❌ | 优先级(数字越大越靠前) |

---

## 1️⃣5️⃣ 用户管理（教师/管理员）

### GET `/api/users` — 用户列表

**权限**: Teacher / Admin  
**Query**: `page`, `page_size`, `role`, `search`  
**附加统计**: submission_count, solved_count

---

## 1️⃣6️⃣ 系统管理（仅管理员）

### PUT `/api/admin/users/{uid}/role` — 修改用户角色

**权限**: Admin only; 不能修改自己  
**参数**: `{ role: "student"|"teacher"|"admin" }`

### POST `/api/admin/users/batch-create` — 批量创建用户

**权限**: Admin only  
**参数**: `{ password: "默认密码(≥6字符)", users: [{username,email,role?,nickname?,...}, ...] }`  
**限制**: 最多50人

**响应**: `{ created: [...], errors: [...], created_count, error_count }`

### DELETE `/api/admin/users/{uid}` — 删除用户

**权限**: Admin only; 不能删自己  
**级联清理**: discussion_members → posts → task_submissions → submissions → code_pool → course_enrollments → netdisk_files(物理) → discussion_files(物理) → user

### PUT `/api/admin/users/{uid}/reset-password` — 重置密码

**权限**: Admin only  
**参数**: `{ password: "新密码(≥6字符)" }`

### GET `/api/admin/settings` — 获取系统设置

**权限**: Admin only

**内置设置项**:
| key | 默认值 | 说明 |
|-----|--------|------|
| site_name | Code Classroom | 站点名称 |
| register_enabled | 1 | 是否开放注册 |
| site_description | 在线编程学习平台 | 站点描述 |
| default_netdisk_quota | 209715200 | 默认网盘配额(字节) |

### PUT `/api/admin/settings` — 更新系统设置

**权限**: Admin only  
**可更新**: site_name, site_description, register_enabled, default_netdisk_quota

### GET `/api/admin/plugins` — 插件列表

**权限**: Admin only  
**返回**: 已加载插件的 name, version, description, loaded_status

---

## 1️⃣7️⃣ 仪表盘

### GET `/api/dashboard` — 个人仪表盘

**权限**: 需登录  
**按角色返回不同统计数据**:

| 角色 | 返回字段 |
|------|----------|
| **student** | total_submissions, solved_count, saved_codes, course_count, total_exercises, task_submissions, tasks_graded |
| **teacher** | my_courses, my_exercises, total_students, total_submissions, my_tasks, pending_grades |
| **admin** | total_users, total_students, total_courses, total_exercises, total_submissions, total_accepted, today_submissions, netdisk_count, task_count, discussion_count, settings_count |

---

## 1️⃣8️⃣ 在线考试（插件）

> 位于 `plugins/exam-system/plugin.py`，通过插件系统动态加载

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/exam/sessions` | 考试列表 |
| POST | `/api/exam/sessions` | 创建考试 |
| GET | `/api/exam/sessions/{sid}` | 考试详情 |
| PUT | `/api/exam/sessions/{sid}` | 更新考试 |
| DELETE | `/api/exam/sessions/{sid}` | 删除考试 |
| GET | `/api/exam/papers` | 试卷列表 |
| POST | `/api/exam/papers` | 创建试卷 |
| GET | `/api/exam/papers/{pid}` | 试卷详情(含题目) |
| PUT | `/api/exam/papers/{pid}` | 更新试卷 |
| DELETE | `/api/exam/papers/{pid}` | 删除试卷 |
| POST | `/api/exam/papers/{pid}/questions` | 添加题目 |
| PUT | `/api/exam/questions/{qid}` | 编辑题目 |
| DELETE | `/api/exam/questions/{qid}` | 删除题目 |
| POST | `/api/exam/sessions/{sid}/start` | 开始考试 |
| POST | `/api/exam/sessions/{sid}/submit` | 提交答卷 |
| GET | `/api/exam/sessions/{sid}/result` | 查看成绩 |
| GET | `/api/exam/sessions/{sid}/grading` | 待批改列表 |
| PUT | `/api/exam/sessions/{sid}/grading/{rid}` | 批改答卷 |

**题型**: single(单选)、multi(多选)、judge(判断)、fill(填空)、code(代码题自动判卷)、operation(实操人工)

---

## 1️⃣9️⃣ 健康检查与静态资源

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/` | 无 | 返回 index.html |
| GET | `/static/{filepath:path}` | 无 | 静态文件服务(CSS/JS/字体等) |
| GET | `/plugin-assets/{plugin}/{filepath:path}` | 无 | 插件 JS/CSS/图片资源 |
| GET | `/api/plugins/nav` | 无 | 插件导航注册项 |
| GET | `/api/health` | 无 | `{ status: "ok", time: "ISO" }` 服务健康状态 |

---

## 2️⃣0️⃣ 通用约定

### `_alloc_id(table)` — ID 回收机制

新增的 ID 分配函数，用于 classes / discussions / netdisk_folders / tasks / courses / blog_posts 等表。

**行为**:
1. 先查找 `WHERE status=0` 的**最小空闲 ID**
2. 有则**回收复用**
3. 无空闲则返回 `MAX(id) + 1`（正常递增）

**效果**: 删除班级后新建班级会复用旧 ID，保持 ID 连续紧凑。

### 三级权限体系

| 角色 | 能力范围 |
|------|----------|
| **student** | 只能操作自己的数据（提交、代码池、个人资料）；查看已选课程的内容；发帖/回复（受禁言控制） |
| **teacher** | 可以创建/编辑自己负责的课程、习题、任务、讨论区、网盘等；管理学生、批改作业 |
| **admin** | 全部权限，包括用户管理、系统设置、批量操作、强制删除、修改任何人的角色 |

### 统一响应格式

成功:
```json
{ "code": 0, "data": { ... }, "message": "操作成功" }
```

错误:
```json
{ "detail": "错误描述", "status_code": 400 }
// 或
{ "code": -1, "message": "Internal Server Error: ..." }
```

### 频率限制

- **代码提交**: 每分钟最多 10 次
- **批量创建用户**: 单次最多 50 人
- **批量上传习题**: 单次最多 100 道
- **批量添加学生到班级**: 单次最多 100 人

### 软删除 vs 真删除

| 表 | 删除方式 | 说明 |
|----|----------|------|
| classes | 软删除 (status=0) | ID 可回收 |
| discussions | 软删除 (status=0) | ID 可回收 |
| netdisk_folders | 软删除 (status=0) | ID 可回收 |
| tasks | 真删除 | ID 不回退 |
| exercises | 真删除 | ID 不回退 |
| blog_posts | 真删除 + 级联物理删附件 | - |

### 文件上传大小限制汇总

| 上传位置 | 学生限制 | 教师/管理员 |
|----------|----------|-------------|
| 讨论区附件 | **10MB** | **无限制** ✨ |
| 网盘文件 | 受配额约束 | 受配额约束 |
| 博客附件 | - | **无限制** ✨ |
| 学习资料 | - | - (仅.html/.json/.md) |

### 支持的语言 & 沙箱配置

| 语言 | 扩展名 | 编译命令(如有) | 运行命令 |
|------|--------|-----------------|----------|
| Python | .py | - | `python -u` |
| JavaScript | .js | - | `node` |
| C | .c | `gcc -o {out} {src} -lm -O2` | `{out}` |
| C++ | .cpp | `g++ -o {out} {src} -lm -O2` | `{out}` |

**沙箱安全**: 
- Windows 使用 `CREATE_NO_WINDOW` 防弹窗
- tempfile 临时目录，用完即删
- 可配置 time_limit 和 memory_limit

### 数据库信息

- **引擎**: SQLite 3 (WAL模式，外键开启)
- **路径**: `data/classroom.db`
- **表数量**: 27 张（含插件表）
- **ORM**: 手写 SQL (Raw SQLite3 + sqlite3.Row)

---

## 🚀 快速开始（cURL 示例）

```bash
# 1. 登录获取 Token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}' | python -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

echo "Token: $TOKEN"

# 2. 查看仪表盘
curl -s http://localhost:8000/api/dashboard -H "Authorization: Bearer $TOKEN" | python -m json.tool

# 3. 查看课程列表
curl -s "http://localhost:8000/api/courses?page=1&page_size=5" -H "Authorization: Bearer $TOKEN" | python -m json.tool

# 4. 查看题库
curl -s "http://localhost:8000/api/exercises?difficulty=easy&limit=3" -h "Authorization: Bearer $TOKEN" | python -m json.tool

# 5. 提交代码评测
curl -s -X POST http://localhost:8000/api/submissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"exercise_id":1,"code":"print(\"Hello, World!\")","language":"python"}' | python -m json.tool

# 6. 直接执行代码
curl -s -X POST http://localhost:8000/api/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"print(sum(range(101)))","language":"python"}' | python -m json.tool
```

---

*文档生成日期: 2026-04-03 | 共 99 个 API 端点*
