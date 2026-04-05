@echo off
chcp 65001 >nul 2>&1

::: ============================================================
::: 自动请求管理员权限（UAC 提权）
::: ============================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  [提示] 正在请求管理员权限以配置防火墙...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

::: ---- 以下代码在管理员权限下运行 ----
title Code Classroom - Starting...
color 0A

echo.
echo  ========================================================
echo           在线编程教学平台  Code Classroom
echo             一键启动 / 纯 Python 运行
echo  ========================================================
echo.

::: ============================================================
::: 第一步：检测 Python
::: ============================================================
echo  [1/5] 检测 Python 环境...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [错误] 未检测到 Python！
    echo  [提示] 请下载并安装 Python 3.8 或更高版本
    echo         https://www.python.org/downloads/
    echo  [提示] 安装时请勾选 "Add Python to PATH"
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo  [OK] 已找到 %PYVER%
echo.

::: ============================================================
::: 第二步：检测 Windows 位数（32位 / 64位）
::: ============================================================
echo  [2/5] 检测系统与 Python 位数...
set ARCH=unknown

::: 用 Python struct 检测当前运行的 Python 位数（与 OS 无关，取决于安装的 Python）
for /f "usebackq delims=" %%b in (`python -c "import struct;print(struct.calcsize('P')*8)" 2^>nul`) do set PYBITS=%%b

if "%PYBITS%"=="64" (
    set ARCH=win64
    echo  [OK] 检测到 64位 Python（Windows x64）
) else if "%PYBITS%"=="32" (
    set ARCH=win32
    echo  [OK] 检测到 32位 Python（Windows x86）
) else (
    set ARCH=win64
    echo  [警告] 无法识别 Python 位数，默认使用 64位包
)
echo.

::: ============================================================
::: 第三步：安装 Python 依赖（自动匹配平台，优先离线）
::: ============================================================
echo  [3/5] 安装 Python 依赖（平台：%ARCH%）...

set BASE_PKG=%~dp0..\packages
set ARCH_PKG=%~dp0..\packages\%ARCH%

::: 判断离线包是否存在
set OFFLINE_OK=0
if exist "%BASE_PKG%\" (
    if exist "%ARCH_PKG%\" (
        set OFFLINE_OK=1
    )
)

if "%OFFLINE_OK%"=="1" (
    echo  [信息] 检测到离线包目录，使用离线模式（无需联网）...
    echo  [信息] 加载通用包：%BASE_PKG%
    echo  [信息] 加载平台包：%ARCH_PKG%
    pip install --no-index --find-links="%BASE_PKG%" --find-links="%ARCH_PKG%" ^
        fastapi "uvicorn[standard]" pydantic python-multipart >nul 2>&1
    if %errorlevel% equ 0 (
        echo  [OK] 依赖安装完成（离线模式）
        goto :firewall
    )
    echo  [警告] 离线安装失败，尝试联网安装...
)

::: 联网降级
echo  [信息] 从网络安装依赖（需要互联网）...
pip install fastapi "uvicorn[standard]" pydantic python-multipart >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [错误] 依赖安装失败！
    echo  [提示] 请检查网络，或确认 packages\ 及 packages\%ARCH%\ 目录完整
    echo.
    pause
    exit /b 1
)
echo  [OK] 依赖安装完成（联网模式）

:firewall
echo.

::: ============================================================
::: 第四步：配置 Windows 防火墙（放行 TCP 8000 端口）
::: ============================================================
echo  [4/5] 配置 Windows 防火墙（放行 TCP 8000 端口）...

set FIREWALL_OK=0
%SystemRoot%\System32\netsh.exe advfirewall firewall show rule name="Code Classroom - TCP 8000" >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] 防火墙规则已存在，跳过
    set FIREWALL_OK=1
) else (
    %SystemRoot%\System32\netsh.exe advfirewall firewall add rule ^
        name="Code Classroom - TCP 8000" ^
        protocol=TCP dir=in localport=8000 action=allow >nul 2>&1
    if %errorlevel% equ 0 (
        echo  [OK] 已添加防火墙入站规则（TCP 8000）
        set FIREWALL_OK=1
    ) else (
        echo  [警告] 防火墙规则添加失败
        echo  [提示] 如局域网学生无法访问，请手动在防火墙中放行 TCP 8000 端口
    )
)
echo.

::: ============================================================
::: 第五步：检测本机局域网 IP
::: ============================================================
echo  [5/5] 检测本机局域网地址...

set LAN_IP=
for /f "usebackq delims=" %%i in (`python -c "import socket;s=socket.socket();s.settimeout(2);s.connect(('114.114.114.114',80));print(s.getsockname()[0]);s.close()" 2^>nul`) do set LAN_IP=%%i

if "%LAN_IP%"=="" (
    for /f "usebackq delims=" %%i in (`python -c "import socket;print(socket.gethostbyname(socket.gethostname()))" 2^>nul`) do set LAN_IP=%%i
)
if "%LAN_IP%"=="" set LAN_IP=请用 ipconfig 手动查看

echo  [OK] 本机局域网 IP：%LAN_IP%
echo.

::: ============================================================
::: 启动服务
::: ============================================================
title Code Classroom - Running @ %LAN_IP%:8000

echo  ========================================================
echo               服务器启动成功！
echo  --------------------------------------------------------
echo.
echo  本机访问:    http://localhost:8000
echo  局域网访问:  http://%LAN_IP%:8000
echo.
echo  演示账号 (密码均为 password123):
echo    - 管理员: admin
echo    - 教  师: teacher_wang
echo    - 学  生: student_zhang
echo.
echo  按 Ctrl+C 可停止服务器
echo  ========================================================
echo.

cd /d "%~dp0.."
python server.py

echo.
echo  [信息] 服务器已停止运行。
pause