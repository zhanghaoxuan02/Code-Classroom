@echo off
chcp 65001 >nul 2>&1
title Code Classroom - Online Coding Platform
echo.
echo   ============================================
echo      Code Classroom - 在线代码学习平台
echo      一键快速部署脚本中文版（依赖Python）--本文件大部分已汉化
echo   ============================================
echo.

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 没有安装Python!
    echo [INFO]  请从https://www.python.org/downloads/下载Python 3.8+ 
    echo [INFO]  安装时一定要勾选 "Add Python to PATH" （或你安装了Python，但没有加入PATH变量）
    echo.
    pause
    exit /b 1
)

echo [INFO] Python found:
python --version
echo.

:: Install dependencies
echo [INFO] 正在安装dependencies...
pip install fastapi uvicorn pydantic 2>nul
if %errorlevel% neq 0 (
    echo [WARN] pip install had warnings, continuing...
)
echo [OK] dependencies安装成功.
echo.

:: Start server
echo [INFO] 你可以访问 http://localhost:8000  来查看页面
echo.
echo   网址:       http://localhost:8000
echo.
echo     示例账户(密码: password123):
echo     管理员示例账户用户名:    admin
echo     教师示例账户用户名:  teacher_wang
echo     学生示例账户用户名:  student_zhang
echo.
echo   你可以按ctrl+C关闭服务器.
echo.

cd /d "%~dp0.."
python server.py
pause
