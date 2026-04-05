# 📚 学习资源编写指南

本文档详细介绍如何在 Code Classroom 平台中编写和上传学习教程。

## 目录

- [支持的格式](#支持的格式)
- [文件存放位置](#文件存放位置)
- [JSON 格式教程（推荐）](#json-格式教程推荐)
- [HTML 格式教程](#html-格式教程)
- [Markdown 格式教程](#markdown-格式教程)
- [上传方法](#上传方法)

---

## 支持的格式

平台支持三种学习资源格式：

| 格式 | 扩展名 | 适用场景 | 推荐指数 |
|------|--------|----------|----------|
| **JSON** | `.json` | 结构化课程、分章节教程 | ⭐⭐⭐ 强烈推荐 |
| **HTML** | `.html` | 富媒体内容、交互式教程 | ⭐⭐⭐ 推荐 |
| **Markdown** | `.md` | 简单文档、快速笔记 | ⭐⭐ 一般 |

---

## 文件存放位置

学习资源文件存放在 `learning/` 目录下，按课程分子目录：

```
learning/
├── course_1/          # 课程ID为1的学习资源
│   ├── 第1章-初识Python.json
│   ├── 第2章-条件判断.json
│   └── ...
├── course_2/          # 课程ID为2的学习资源
│   ├── 01-HTML基础.json
│   └── ...
└── course_3/          # 课程ID为3的学习资源
    └── ...
```

**命名规则**：
- 目录名：`course_{课程ID}`（系统自动创建）
- 文件名：建议使用 `章节号-标题.扩展名` 格式
- 支持中文文件名

---

## JSON 格式教程（推荐）

JSON 格式是最推荐的教程格式，支持结构化内容、代码示例、练习题等。

### 基本结构

```json
{
  "title": "教程标题",
  "description": "教程简介",
  "chapters": [
    {
      "title": "章节标题",
      "content": "章节内容（支持换行）",
      "code": "示例代码",
      "tip": "提示/注意事项",
      "quiz": "思考题"
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | 字符串 | ✅ | 教程标题，显示在页面顶部 |
| `description` | 字符串 | ❌ | 教程简介，显示在标题下方 |
| `chapters` | 数组 | ✅ | 章节列表，每个元素是一个章节对象 |

### 章节对象字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | 字符串 | ✅ | 章节标题 |
| `content` | 字符串 | ❌ | 章节正文内容，支持 `\n` 换行 |
| `code` | 字符串 | ❌ | 代码示例，会显示在代码框中 |
| `tip` | 字符串 | ❌ | 提示信息，显示为黄色提示框 |
| `quiz` | 字符串 | ❌ | 思考题，显示在章节末尾 |

### 完整示例

```json
{
  "title": "第1章 · 初识 Python",
  "description": "从零开始认识 Python，学会运行第一行代码",
  "chapters": [
    {
      "title": "Python 是什么？",
      "content": "Python 是一门非常适合初学者的编程语言，特点是：\n\n✅ 语法简单，读起来像英文\n✅ 功能强大，科学计算/网站/人工智能都能做\n✅ 世界上最流行的编程语言之一",
      "tip": "不要担心一开始看不懂，每个程序员都是从一行代码开始的。"
    },
    {
      "title": "第一行代码：Hello, World!",
      "content": "按照惯例，学编程的第一行代码是打印出「Hello, World!」。\n在 Python 中只需要一行：",
      "code": "print(\"Hello, World!\")",
      "tip": "print() 是 Python 的「打印」函数，括号里放你想输出的内容。"
    },
    {
      "title": "变量：给数据起名字",
      "content": "变量就像一个「标签」，贴在数据上，方便以后使用。",
      "code": "name = \"小明\"\nage = 18\nprint(name)   # 输出：小明\nprint(age)    # 输出：18",
      "tip": "变量名不能以数字开头，不能有空格，区分大小写。",
      "quiz": "如果变量名是 name，那 Name 是同一个变量吗？"
    }
  ]
}
```

### 显示效果

上述 JSON 会在页面上显示为：

1. **顶部**：显示教程标题和简介
2. **章节卡片**：每个章节一个卡片，包含：
   - 章节标题（蓝色）
   - 正文内容（保留换行格式）
   - 代码示例（黑色代码框）
   - 提示信息（黄色边框）
   - 思考题（灰色背景）

### 编写技巧

#### 1. 换行处理

JSON 中不支持直接换行，需要使用 `\n`：

```json
{
  "content": "第一行\n第二行\n\n空行后的第三行"
}
```

#### 2. 引号处理

JSON 字符串使用双引号包裹，如果内容中包含双引号，需要转义：

```json
{
  "code": "print(\"Hello, World!\")"
}
```

**注意**：不要在 JSON 字符串中使用中文引号 `"` `"`，会导致解析失败！

#### 3. 代码缩进

代码示例中的缩进会被保留，建议使用空格缩进：

```json
{
  "code": "if x > 0:\n    print(\"正数\")\nelse:\n    print(\"负数或零\")"
}
```

#### 4. 使用 Emoji

可以在内容中使用 Emoji 增加可读性：

```json
{
  "content": "📌 重点内容\n\n✅ 正确做法\n❌ 错误做法\n\n💡 提示：记得保存代码"
}
```

### 验证 JSON 格式

编写完成后，务必验证 JSON 格式是否正确：

**方法1：在线工具**
- 访问 https://jsonlint.com/
- 粘贴 JSON 内容
- 点击验证

**方法2：VS Code**
- 保存为 `.json` 文件
- 如果有语法错误，会显示红色波浪线

**方法3：Python 命令行**
```bash
python -c "import json; json.load(open('你的文件.json', 'r', encoding='utf-8'))"
```

---

## HTML 格式教程

HTML 格式适合需要富媒体内容、自定义样式或交互元素的教程。

### 基本结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>教程标题</title>
    <style>
        /* 自定义样式 */
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.8;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; }
        code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Consolas', monospace;
        }
        pre {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 15px;
            border-radius: 8px;
            overflow-x: auto;
        }
        .tip {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
    </style>
</head>
<body>
    <h1>教程标题</h1>
    <p>教程简介...</p>
    
    <h2>第一节：基础知识</h2>
    <p>内容...</p>
    
    <div class="tip">
        💡 <strong>提示：</strong>这是一个提示框
    </div>
    
    <pre><code>print("Hello, World!")</code></pre>
</body>
</html>
</html>
```

### 关键要点

#### 1. 必须包含的 meta 标签

```html
<meta charset="UTF-8">
```

这确保中文能正确显示。

#### 2. 样式建议

平台会在 iframe 中显示 HTML 内容，建议：

```css
body {
    /* 限制最大宽度，提高可读性 */
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    
    /* 使用系统字体 */
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.8;
}
```

#### 3. 代码高亮

可以使用简单的样式实现代码高亮：

```css
pre {
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 15px;
    border-radius: 8px;
    overflow-x: auto;
}

code {
    font-family: 'Consolas', 'Monaco', monospace;
}
```

#### 4. 响应式设计

确保内容在移动端也能正常显示：

```css
img {
    max-width: 100%;
    height: auto;
}

pre {
    white-space: pre-wrap;
    word-wrap: break-word;
}
```

### 完整示例

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>HTML 基础入门</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.8;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        h1 {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 15px;
        }
        h2 {
            color: #34495e;
            margin-top: 40px;
            padding-left: 15px;
            border-left: 4px solid #3498db;
        }
        .intro {
            background: #ecf0f1;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        code {
            background: #f8f9fa;
            padding: 2px 8px;
            border-radius: 4px;
            color: #e83e8c;
            font-family: 'Consolas', monospace;
        }
        pre {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 20px;
            border-radius: 8px;
            overflow-x: auto;
            line-height: 1.6;
        }
        pre code {
            background: transparent;
            color: inherit;
            padding: 0;
        }
        .tip {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        .warning {
            background: #f8d7da;
            border-left: 4px solid #dc3545;
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        ul, ol {
            padding-left: 30px;
        }
        li {
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <h1>🌐 HTML 基础入门</h1>
    
    <div class="intro">
        <strong>学习目标：</strong>掌握 HTML 的基本语法，能够编写简单的网页结构。
    </div>
    
    <h2>什么是 HTML？</h2>
    <p>HTML（HyperText Markup Language）是构建网页的标准标记语言。它使用「标签」来描述网页的结构和内容。</p>
    
    <div class="tip">
        💡 <strong>提示：</strong>HTML 不是编程语言，而是标记语言。它告诉浏览器如何显示内容，而不是执行逻辑。
    </div>
    
    <h2>基本结构</h2>
    <p>每个 HTML 文档都有相同的基本结构：</p>
    
    <pre><code>&lt;!DOCTYPE html&gt;
&lt;html&gt;
&lt;head&gt;
    &lt;title&gt;页面标题&lt;/title&gt;
&lt;/head&gt;
&lt;body&gt;
    &lt;h1&gt;Hello, World!&lt;/h1&gt;
    &lt;p&gt;这是我的第一个网页。&lt;/p&gt;
&lt;/body&gt;
&lt;/html&gt;</code></pre>
    
    <h2>常用标签</h2>
    <ul>
        <li><code>&lt;h1&gt;</code> - <code>&lt;h6&gt;</code>：标题（从大到小）</li>
        <li><code>&lt;p&gt;</code>：段落</li>
        <li><code>&lt;a&gt;</code>：链接</li>
        <li><code>&lt;img&gt;</code>：图片</li>
        <li><code>&lt;div&gt;</code>：容器</li>
    </ul>
    
    <div class="warning">
        ⚠️ <strong>注意：</strong>记得关闭所有打开的标签，例如 <code>&lt;p&gt;</code> 需要对应的 <code>&lt;/p&gt;</code>。
    </div>
</body>
</html>
```

### HTML  vs JSON 对比

| 特性 | HTML | JSON |
|------|------|------|
| 样式控制 | ✅ 完全自定义 | ❌ 固定样式 |
| 图片支持 | ✅ 支持 | ❌ 不支持 |
| 交互元素 | ✅ 支持（按钮、表单等） | ❌ 不支持 |
| 编写难度 | 中等 | 简单 |
| 结构化 | 一般 | 优秀 |
| 推荐场景 | 富媒体教程 | 编程课程 |

---

## Markdown 格式教程

Markdown 适合编写简单的文档和笔记。

### 基本语法

```markdown
# 一级标题

## 二级标题

这是普通段落。

**粗体文字** 和 *斜体文字*

- 列表项 1
- 列表项 2
- 列表项 3

```python
# 代码块
print("Hello")
```

> 引用块

[链接文字](https://example.com)
```

### 注意事项

1. 平台使用 `marked.js` 渲染 Markdown
2. 支持 GitHub 风格的 Markdown
3. 不支持复杂的 HTML 嵌入

---

## 上传方法

### 方法一：Web 界面上传（推荐）

1. **登录**系统（需要教师或管理员权限）
2. 进入**课程详情页**
3. 点击「📖 学习资源」标签
4. 点击「📤 上传资料」按钮
5. 选择文件（支持 `.html`、`.json`、`.md`）
6. 点击上传

### 方法二：直接放入目录

如果你有服务器访问权限，可以直接将文件放入对应目录：

```bash
# 示例：将文件放入课程1的学习目录
cp 我的教程.json learning/course_1/
```

**注意**：
- 目录 `learning/course_{课程ID}/` 会自动创建
- 文件名建议使用中文字符，便于识别
- 上传后刷新页面即可看到

---

## 最佳实践

### 内容组织建议

1. **按章节拆分**：每个 JSON/HTML 文件对应一个章节，不要一个文件包含太多内容
2. **循序渐进**：从简单到复杂，每个章节建立在上一章基础上
3. **实践为主**：每章都包含代码示例，鼓励学生动手实践
4. **及时反馈**：使用 `tip` 和 `quiz` 帮助学生巩固知识

### 文件命名规范

```
✅ 推荐：
第1章-初识Python.json
02-变量与数据类型.json
03_条件判断.html

❌ 避免：
1.json（无描述性）
第一章.json（混用数字和中文）
新建文本文档.json（默认名称）
```

### 内容编写 checklist

- [ ] JSON 格式已通过验证
- [ ] 所有字符串使用正确的引号（英文双引号）
- [ ] 代码示例可以正常运行
- [ ] 没有拼写错误
- [ ] 章节之间有逻辑递进关系

---

## 常见问题

### Q1: JSON 文件上传后显示为纯文本？

**原因**：JSON 格式有误，无法解析。

**解决**：
1. 检查是否有中文引号 `"` `"`
2. 检查引号是否成对出现
3. 使用 JSON 验证工具检查

### Q2: HTML 中的中文显示为乱码？

**原因**：缺少 charset 声明。

**解决**：在 `<head>` 中添加：
```html
<meta charset="UTF-8">
```

### Q3: 代码示例中的缩进丢失了？

**原因**：JSON 字符串中的换行和缩进需要正确处理。

**解决**：
```json
{
  "code": "def hello():\n    print('Hello')\n    return True"
}
```

### Q4: 如何删除已上传的文件？

**解决**：
1. 进入课程详情页的学习资源标签
2. 找到要删除的文件
3. 点击文件右侧的 🗑️ 删除按钮
4. 确认删除

---

## 示例文件下载

可以参考以下示例文件学习编写规范：

- `learning/course_1/第1章-初识Python.json` - JSON 格式示例
- `learning/course_1/第2章-条件判断.json` - 多章节示例
- `learning/course_2/` - HTML 格式示例（如有）

---

## 技术支持

遇到问题？

1. 检查本文档的「常见问题」部分
2. 使用 JSON/HTML 验证工具检查文件格式
3. 查看浏览器开发者工具（F12）的错误信息

---

**Happy Teaching! 🎓**
