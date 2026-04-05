# 📝 在线考试系统插件（exam-system）

> Code Classroom 插件 · v1.0.0

完整的在线考试解决方案，支持多种题型、灵活的判卷方式、试卷在线创建或 JSON 导入/导出，无缝嵌入 Code Classroom 主界面。

---

## ✨ 功能概览

| 功能 | 说明 |
|------|------|
| **多种题型** | 单选、多选、判断、填空、代码（测试用例自动判卷）、实际操作（人工批改） |
| **组卷方式** | 在线逐题创建 / 上传 JSON 批量导入 |
| **导出试卷** | 一键导出为 JSON，方便复用/备份 |
| **判卷模式** | 🤖 全自动 / ✍️ 全人工 / 🔀 混合（自动+人工） |
| **考试安排** | 设置开放时间、截止时间、允许迟交 |
| **答题界面** | 倒计时、题目导航、自动保存进度（每 30 秒） |
| **批改界面** | 教师逐题打分+评语，一键提交 |
| **成绩统计** | 平均分、最高/低分、及格率、分数段分布柱状图 |
| **成绩单** | 学生可查看每题得分、正确答案、解析 |

---

## 📁 文件结构

```
plugins/exam-system/
├── plugin.json      # 插件元数据
├── plugin.py        # 后端 API（FastAPI 路由）
├── exam.js          # 前端 UI（自动注入到主界面）
└── README.md        # 本文档
```

---

## 🚀 安装与启用

插件目录放好后，**重启服务器**即可自动加载：

```bash
python server.py
```

启动日志中应看到：

```
[ExamPlugin] DB tables initialized.
[ExamPlugin] OK: registered exam-system routes
[ExamPlugin]   试卷管理: GET/POST /api/exam/papers
...
```

前端侧边栏会出现 **「📝 在线考试」** 入口。

---

## 👩‍🏫 使用流程

### 教师流程

```
1. 进入「在线考试」→「试卷管理」
2. 新建试卷（设置时限、判卷方式等）
3. 添加题目（或导入 JSON）
4. 发布试卷（状态改为"已发布"）
5. 新建考试安排（绑定试卷，设置开放时间）
6. 考试结束后：查看答卷 → 批改（人工题）
7. 查看成绩统计
```

### 学生流程

```
1. 进入「在线考试」→ 找到可参加的考试
2. 点击「开始考试」
3. 答题（进度自动保存）
4. 提交答卷
5. 查看「我的成绩」→「成绩单」
```

---

## 📋 题目类型详解

### 单选题（single）
- 填写 A/B/C/D 选项内容
- 正确答案为单个字母（如 `"B"`）
- 自动判卷

### 多选题（multi）
- 填写 A/B/C/D/E... 选项内容
- 正确答案为 JSON 数组（如 `["A","C"]`）
- 全部正确才得分，自动判卷

### 判断题（judge）
- 无需填写选项
- 正确答案为 `"true"` 或 `"false"`
- 自动判卷

### 填空题（fill）
- 无需选项
- 正确答案为精确匹配字符串（去首尾空格；大小写不同得 90% 分）
- 自动判卷

### 代码题（code）

两种判卷方式：

**① 测试用例自动判卷**：将正确答案设为 JSON 数组，每个用例包含：

```json
[
  { "input": "5\n3",  "expected": "8",  "lang": "python" },
  { "input": "10\n2", "expected": "12", "lang": "python" }
]
```

系统会在沙箱中运行学生代码，比对标准输出。每通过一个用例得对应比例分数。

**② 人工判卷**：将正确答案留空或填非 JSON 内容，则转为人工批改。

### 实际操作题（operation）
- 描述需要完成的操作步骤（填入"操作要求"字段）
- 学生填写文字说明或操作截图链接
- **始终人工判卷**

---

## 📥 JSON 试卷格式

可以本地编写 JSON 文件，然后通过「📥 导入 JSON」按钮导入。

### 完整格式示例

```json
{
  "title": "Python 基础期末考试",
  "description": "涵盖变量、循环、函数、列表等基础知识",
  "time_limit": 5400,
  "total_score": 100,
  "pass_score": 60,
  "grading_mode": "mixed",
  "allow_review": true,
  "shuffle_questions": false,
  "shuffle_options": false,
  "questions": [
    {
      "type": "single",
      "content": "Python 中用于打印输出的内置函数是？",
      "options": ["echo()", "print()", "console.log()", "System.out.println()"],
      "correct_answer": "B",
      "score": 5,
      "explanation": "Python 使用 print() 函数输出内容。"
    },
    {
      "type": "multi",
      "content": "以下哪些是 Python 的合法变量名？",
      "options": ["my_var", "2name", "_secret", "class"],
      "correct_answer": "[\"A\",\"C\"]",
      "score": 8,
      "explanation": "变量名不能以数字开头，也不能使用保留字（class）。"
    },
    {
      "type": "judge",
      "content": "Python 中的列表（list）是不可变类型。",
      "options": [],
      "correct_answer": "false",
      "score": 5,
      "explanation": "list 是可变类型，tuple 才是不可变类型。"
    },
    {
      "type": "fill",
      "content": "Python 中获取列表长度的内置函数是 ______。",
      "options": [],
      "correct_answer": "len",
      "score": 5,
      "explanation": "len(list) 返回列表元素个数。"
    },
    {
      "type": "code",
      "content": "编写 Python 函数，读入两个整数（每行一个），输出它们的和。",
      "options": [],
      "correct_answer": "[{\"input\":\"3\\n5\",\"expected\":\"8\",\"lang\":\"python\"},{\"input\":\"10\\n-3\",\"expected\":\"7\",\"lang\":\"python\"}]",
      "score": 20,
      "explanation": "使用 input() 读入，int() 转换，print() 输出。"
    },
    {
      "type": "operation",
      "content": "请在本地安装 Python 并运行 hello.py，截图上传至班级网盘，并将文件路径填写在下方。",
      "options": [],
      "correct_answer": "学生需提供截图路径或操作描述",
      "score": 20,
      "explanation": ""
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 试卷名称（必填） |
| `description` | string | 考试说明 |
| `time_limit` | int | 考试时限（**秒**，0=不限） |
| `total_score` | int | 满分 |
| `pass_score` | int | 及格分 |
| `grading_mode` | string | `"auto"` / `"manual"` / `"mixed"` |
| `allow_review` | bool | 是否允许考后查看答案 |
| `shuffle_questions` | bool | 随机题目顺序 |
| `shuffle_options` | bool | 随机选项顺序 |
| `questions` | array | 题目列表 |

**题目字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | `single` / `multi` / `judge` / `fill` / `code` / `operation` |
| `content` | string | 题目正文（支持换行） |
| `options` | array | 选项列表（单选/多选使用），其他题型填 `[]` |
| `correct_answer` | string | 正确答案（见各题型说明） |
| `score` | int | 本题分值 |
| `explanation` | string | 解析（考后展示给学生） |

---

## 🔌 后端 API 速查

所有接口均需携带 JWT Token（`Authorization: Bearer <token>`）。

### 试卷管理（教师/管理员）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/exam/papers` | 列出所有试卷 |
| POST | `/api/exam/papers` | 新建试卷 |
| GET | `/api/exam/papers/:id` | 获取试卷（含题目） |
| PUT | `/api/exam/papers/:id` | 修改试卷 |
| DELETE | `/api/exam/papers/:id` | 删除试卷 |
| POST | `/api/exam/papers/import` | 导入 JSON 试卷 |
| GET | `/api/exam/papers/:id/export` | 导出试卷为 JSON |

### 题目管理（教师/管理员）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/exam/papers/:paperId/questions` | 添加题目 |
| PUT | `/api/exam/questions/:id` | 修改题目 |
| DELETE | `/api/exam/questions/:id` | 删除题目 |
| PUT | `/api/exam/papers/:paperId/questions/reorder` | 批量排序 |

### 考试安排（教师/管理员）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/exam/sessions` | 列出考试安排 |
| POST | `/api/exam/sessions` | 新建考试安排 |
| PUT | `/api/exam/sessions/:id` | 修改考试安排 |
| DELETE | `/api/exam/sessions/:id` | 删除考试安排 |

### 答题（学生）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/exam/sessions/:id/start` | 开始/继续考试 |
| PUT | `/api/exam/submissions/:id/save` | 保存答题进度 |
| POST | `/api/exam/submissions/:id/submit` | 提交答卷（自动判卷） |
| GET | `/api/exam/submissions/:id` | 查看答卷详情 |
| GET | `/api/exam/my-results` | 我的所有考试成绩 |

### 批改与统计（教师/管理员）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/exam/sessions/:id/submissions` | 查看所有答卷 |
| POST | `/api/exam/submissions/:id/grade` | 人工批改（逐题打分） |
| POST | `/api/exam/submissions/:id/batch_grade` | 重跑自动判卷 |
| GET | `/api/exam/sessions/:id/stats` | 成绩统计（平均分/分布等） |

---

## 🗄️ 数据库表

插件启动时自动创建以下表：

| 表名 | 说明 |
|------|------|
| `exam_papers` | 试卷基本信息 |
| `exam_questions` | 题目（关联到试卷） |
| `exam_sessions` | 考试安排（绑定试卷+时间） |
| `exam_participants` | 限定参与者（可选） |
| `exam_submissions` | 答卷（每个学生每次考试一张） |
| `exam_manual_scores` | 人工评分明细（逐题） |

---

## ⚙️ 判卷逻辑详解

```
提交答卷
  │
  ├── 单选/多选/判断/填空 ──→ 自动判卷（立即得分）
  │
  ├── 代码题（有测试用例）──→ 沙箱执行 + 对比输出 ──→ 自动判卷
  │
  ├── 代码题（无测试用例）──→ 转为"待批改"
  │
  └── 实操题 ──────────────→ 始终"待批改"

无需人工题 → 状态：graded（已出分）
有人工题   → 状态：submitted（等待批改）
```

教师在「查看答卷」→「批改」界面对每道人工题打分，提交后状态变为 `graded`，学生即可查看完整成绩单。

---

## 🔐 权限说明

| 操作 | 学生 | 教师 | 管理员 |
|------|:----:|:----:|:------:|
| 参加考试 | ✅ | ✅ | ✅ |
| 查看自己成绩 | ✅ | ✅ | ✅ |
| 创建/编辑试卷 | ❌ | ✅ | ✅ |
| 新建考试安排 | ❌ | ✅ | ✅ |
| 查看所有答卷 | ❌ | ✅ | ✅ |
| 批改答卷 | ❌ | ✅ | ✅ |
| 删除他人试卷 | ❌ | ❌ | ✅ |

---

## 📝 注意事项

1. **代码题安全**：代码题使用与主系统相同的 subprocess 沙箱，设有 5 秒超时限制。
2. **时限精度**：倒计时基于学生开始考试时间（`started_at`）计算，即使刷新页面也不会重置。
3. **自动保存**：答题页每 30 秒自动保存一次进度，意外关闭后可继续作答。
4. **shuffle（乱序）**：当前版本乱序在数据库层面存储固定顺序，前端展示时随机化功能待未来版本完善。
5. **试卷状态**：只有 `published`（已发布）的试卷才会在学生端显示。

---

*由 Code Classroom 插件系统自动加载 · exam-system v1.0.0*
