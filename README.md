# Code Classroom - Online Coding Platform

<p align="center">
  <a href="README.md">🇺🇸 English</a> | <a href="README_CN.md">🇨🇳 简体中文</a>
</p>

A safe, self-contained online coding teaching platform. **No Docker, no Redis, no MySQL, no Nginx** - just Python!

## Features

### Students
- Online coding with CodeMirror editor (Python / JavaScript / C / C++)
- Instant code execution with result feedback
- Personal code pool (auto-save drafts + manual save)
- Progress tracking and statistics dashboard

### Teachers
- Course management, student enrollment
- Exercise creation with custom test cases (Markdown support)
- View student submissions and scores
- Publish announcements
- **Task system**: Assign homework with deadlines and grading
- **Class netdisk**: Upload course materials for students to download

### Administrators
- User management (create/disable/reset password)
- Role assignment (student/teacher/admin)
- System settings (site name, registration toggle, default quota)
- Plugin management

### System
- Subprocess sandbox with timeout limits
- Rate limiting (10 submissions/min per student)
- JWT authentication, role-based access control
- SQLite database (zero config, single file)
- Plugin system for extensibility

## Quick Start

### Requirements
- Python 3.8+ (with pip)

### One-Click Launch

**Windows:**
```
Double-click: scripts\start.bat
```

**Linux / macOS:**
```bash
# Online (with internet)
pip install -r requirements.txt

# Offline (no internet needed, packages included in repo)
pip install --no-index --find-links packages/ --find-links packages/linux_x86_64/ -r requirements.txt

# Start server
python server.py
```

Then open **http://localhost:8000**

### Offline Deployment

The repo includes all Python dependencies in the `packages/` directory. For **air-gapped environments**, simply:

1. Clone the repository
2. Run `pip install --no-index --find-links packages/ [platform subdir] -r requirements.txt`
3. Run `python server.py`

No network connection required at any step.

### Demo Accounts (password: `password123`)

| Role    | Username      |
|---------|---------------|
| Admin   | admin         |
| Teacher | teacher_wang  |
| Teacher | teacher_li    |
| Student | student_zhang |
| Student | student_liu   |

## Project Structure

```
code-classroom/
  server.py              # Pure Python backend (FastAPI + SQLite + sandbox)
  requirements.txt       # Python dependencies
  data/                  # SQLite database (auto-created)
  learning/              # Learning resources (HTML/JSON/MD)
    course_1/            # Course ID 1 resources
    course_2/            # Course ID 2 resources
  plugins/               # Plugin directory
  frontend/
    index.html           # Main SPA page
    css/style.css        # Styles
    js/app.js            # App logic (API + routing + rendering)
  scripts/
    start.bat            # Windows one-click launcher
  README.md              # This file (English)
  README_CN.md           # Chinese version
  README-learning.md     # Learning resource authoring guide
```

## Architecture

```
Browser <--HTTP--> FastAPI (server.py)
                      |
              +-------+-------+
              |               |
           SQLite         subprocess
           (database)    (code sandbox)
```

- **Backend**: Single Python file, FastAPI framework
- **Database**: SQLite (auto-created at `data/classroom.db`)
- **Code Execution**: subprocess with timeout + resource limits
- **Frontend**: Static HTML/CSS/JS served by FastAPI
- **No external dependencies**: No Docker, Redis, MySQL, Nginx needed

## Key Modules

### Learning Center
- Support HTML / JSON / Markdown formats
- Structured course content with chapters
- Code examples and quizzes
- See [README-learning.md](README-learning.md) for authoring guide

### Task System
- Teachers can create assignments with deadlines
- Students submit answers, teachers grade and provide feedback
- Support for Markdown + image attachments

### Class Netdisk
- Teachers upload course materials
- Students download resources
- Quota management (default 200MB per folder)

### Exam System (Plugin)
- Multiple question types: single choice, multiple choice, true/false, fill-in-blank, coding, practical
- Auto-grading for objective questions
- Manual grading for subjective questions
- Countdown timer and auto-save

### Discussion Forum
- Course-specific discussions
- File attachments (auto-expire after 7 days)
- Reply threading

## API Endpoints

### Auth & Users
| Method | Path                    | Description        |
|--------|-------------------------|--------------------|
| POST   | /api/auth/login         | Login              |
| POST   | /api/auth/register      | Student register   |
| GET    | /api/auth/me            | Current user       |
| GET    | /api/users              | User list (admin)  |

### Courses & Learning
| Method | Path                           | Description              |
|--------|--------------------------------|--------------------------|
| GET    | /api/courses                   | Course list              |
| GET    | /api/courses/{id}/exercises    | Course exercises         |
| GET    | /api/courses/{id}/learning     | Course learning resources|
| POST   | /api/learning/upload           | Upload learning resource |

### Exercises & Submissions
| Method | Path                    | Description             |
|--------|-------------------------|-------------------------|
| GET    | /api/exercises          | Exercise list           |
| GET    | /api/exercises/{id}     | Exercise detail         |
| POST   | /api/submissions        | Submit code (sync)      |
| GET    | /api/submissions        | Submission history      |
| POST   | /api/execute            | Direct run (no save)    |

### Other
| Method | Path                    | Description             |
|--------|-------------------------|-------------------------|
| GET    | /api/code-pool          | Personal code pool      |
| POST   | /api/code-pool          | Save code               |
| GET    | /api/dashboard          | Statistics              |
| GET    | /api/announcements      | Announcements           |
| GET    | /api/health             | Health check            |

## Documentation

- [Learning Resource Authoring Guide](README-learning.md) - How to create tutorials in JSON/HTML/Markdown

## License

MIT
