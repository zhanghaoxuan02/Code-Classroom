#!/bin/bash
# ============================================================
# 在线编程教学平台 Code Classroom - Linux 一键启动脚本
# 支持离线/内网部署，自动检测架构，自动配置防火墙
# ============================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}${BOLD} ╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD} ║          在线编程教学平台  Code Classroom          ║${NC}"
echo -e "${CYAN}${BOLD} ║              一键启动 / 纯 Python 运行             ║${NC}"
echo -e "${CYAN}${BOLD} ╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================
# 第一步：检测 Python
# ============================================================
echo -e " ${BOLD}[1/5]${NC} 检测 Python 环境..."

PYTHON_CMD=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        PY_VER=$($cmd --version 2>&1)
        # 检查版本 >= 3.8
        PY_MAJOR=$($cmd -c "import sys;print(sys.version_info.major)")
        PY_MINOR=$($cmd -c "import sys;print(sys.version_info.minor)")
        if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 8 ]; then
            PYTHON_CMD="$cmd"
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo -e " ${RED}[错误]${NC} 未检测到 Python 3.8+！"
    echo "        请安装 Python：sudo apt install python3  或  sudo yum install python3"
    exit 1
fi

echo -e " ${GREEN}[OK]${NC} 已找到 $($PYTHON_CMD --version)"
echo ""

# ============================================================
# 第二步：检测系统架构
# ============================================================
echo -e " ${BOLD}[2/5]${NC} 检测系统架构..."

ARCH=$(uname -m)
case "$ARCH" in
    x86_64)
        PKG_ARCH="linux_x86_64"
        echo -e " ${GREEN}[OK]${NC} 检测到 Linux x86_64（64位）"
        ;;
    aarch64 | arm64)
        PKG_ARCH="linux_aarch64"
        echo -e " ${YELLOW}[警告]${NC} 检测到 ARM64 架构，可能无预置离线包，将使用联网安装"
        PKG_ARCH=""
        ;;
    i686 | i386)
        PKG_ARCH="linux_x86"
        echo -e " ${YELLOW}[警告]${NC} 检测到 32位架构，可能无预置离线包，将使用联网安装"
        PKG_ARCH=""
        ;;
    *)
        PKG_ARCH=""
        echo -e " ${YELLOW}[警告]${NC} 未知架构：$ARCH，将使用联网安装"
        ;;
esac
echo ""

# ============================================================
# 第三步：安装 Python 依赖（优先离线）
# ============================================================
echo -e " ${BOLD}[3/5]${NC} 安装 Python 依赖..."

BASE_PKG="$ROOT_DIR/packages"
ARCH_PKG="$ROOT_DIR/packages/$PKG_ARCH"

OFFLINE_INSTALLED=false
if [ -d "$BASE_PKG" ] && [ -n "$PKG_ARCH" ] && [ -d "$ARCH_PKG" ]; then
    echo -e " ${CYAN}[信息]${NC} 检测到离线包，使用离线模式安装（无需联网）..."
    echo -e " ${CYAN}[信息]${NC} 通用包：$BASE_PKG"
    echo -e " ${CYAN}[信息]${NC} 平台包：$ARCH_PKG"
    if $PYTHON_CMD -m pip install \
        --no-index \
        --find-links="$BASE_PKG" \
        --find-links="$ARCH_PKG" \
        fastapi "uvicorn[standard]" pydantic python-multipart \
        --quiet 2>/dev/null; then
        echo -e " ${GREEN}[OK]${NC} 依赖安装完成（离线模式）"
        OFFLINE_INSTALLED=true
    else
        echo -e " ${YELLOW}[警告]${NC} 离线安装失败，尝试联网安装..."
    fi
fi

if [ "$OFFLINE_INSTALLED" = false ]; then
    echo -e " ${CYAN}[信息]${NC} 从网络安装依赖（需要互联网）..."
    if ! $PYTHON_CMD -m pip install fastapi "uvicorn[standard]" pydantic python-multipart --quiet; then
        echo -e " ${RED}[错误]${NC} 依赖安装失败！"
        echo "        请检查网络连接，或确认 packages/ 及 packages/$PKG_ARCH/ 目录完整"
        exit 1
    fi
    echo -e " ${GREEN}[OK]${NC} 依赖安装完成（联网模式）"
fi
echo ""

# ============================================================
# 第四步：配置防火墙（放行 TCP 8000 端口）
# ============================================================
echo -e " ${BOLD}[4/5]${NC} 配置防火墙（放行 TCP 8000 端口）..."

FIREWALL_DONE=false

# 尝试 firewalld（CentOS/RHEL/Fedora）
if command -v firewall-cmd &>/dev/null && systemctl is-active --quiet firewalld 2>/dev/null; then
    if firewall-cmd --query-port=8000/tcp --permanent &>/dev/null; then
        echo -e " ${GREEN}[OK]${NC} firewalld 规则已存在，跳过"
    else
        if firewall-cmd --permanent --add-port=8000/tcp &>/dev/null && firewall-cmd --reload &>/dev/null; then
            echo -e " ${GREEN}[OK]${NC} 已通过 firewalld 放行 TCP 8000 端口"
        else
            echo -e " ${YELLOW}[警告]${NC} firewalld 配置失败（可能需要 sudo 权限）"
        fi
    fi
    FIREWALL_DONE=true
fi

# 尝试 ufw（Ubuntu/Debian）
if [ "$FIREWALL_DONE" = false ] && command -v ufw &>/dev/null; then
    UFW_STATUS=$(ufw status 2>/dev/null | head -1)
    if echo "$UFW_STATUS" | grep -q "active"; then
        if ufw status | grep -q "8000"; then
            echo -e " ${GREEN}[OK]${NC} ufw 规则已存在，跳过"
        else
            if ufw allow 8000/tcp &>/dev/null; then
                echo -e " ${GREEN}[OK]${NC} 已通过 ufw 放行 TCP 8000 端口"
            else
                echo -e " ${YELLOW}[警告]${NC} ufw 配置失败（可能需要 sudo 权限）"
            fi
        fi
    else
        echo -e " ${CYAN}[信息]${NC} ufw 未启用，跳过防火墙配置"
    fi
    FIREWALL_DONE=true
fi

# 尝试 iptables
if [ "$FIREWALL_DONE" = false ] && command -v iptables &>/dev/null; then
    if iptables -C INPUT -p tcp --dport 8000 -j ACCEPT 2>/dev/null; then
        echo -e " ${GREEN}[OK]${NC} iptables 规则已存在，跳过"
    else
        if iptables -I INPUT -p tcp --dport 8000 -j ACCEPT 2>/dev/null; then
            echo -e " ${GREEN}[OK]${NC} 已通过 iptables 放行 TCP 8000 端口"
        else
            echo -e " ${YELLOW}[警告]${NC} iptables 配置失败（可能需要 sudo 权限）"
        fi
    fi
    FIREWALL_DONE=true
fi

if [ "$FIREWALL_DONE" = false ]; then
    echo -e " ${CYAN}[信息]${NC} 未检测到防火墙工具，跳过（如有需要请手动放行 TCP 8000）"
fi
echo ""

# ============================================================
# 第五步：检测本机局域网 IP
# ============================================================
echo -e " ${BOLD}[5/5]${NC} 检测本机局域网地址..."

LAN_IP=$($PYTHON_CMD -c "
import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(2)
    s.connect(('114.114.114.114', 80))
    print(s.getsockname()[0])
    s.close()
except Exception:
    try:
        print(socket.gethostbyname(socket.gethostname()))
    except Exception:
        print('127.0.0.1')
" 2>/dev/null)

if [ -z "$LAN_IP" ] || [ "$LAN_IP" = "127.0.0.1" ]; then
    # fallback: ip route
    LAN_IP=$(ip route get 114.114.114.114 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
fi
if [ -z "$LAN_IP" ]; then
    LAN_IP="请用 ip addr 手动查看"
fi

echo -e " ${GREEN}[OK]${NC} 本机局域网 IP：${BOLD}$LAN_IP${NC}"
echo ""

# ============================================================
# 启动服务
# ============================================================
echo -e "${CYAN}${BOLD} ╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD} ║               服务器启动成功！                     ║${NC}"
echo -e "${CYAN}${BOLD} ╠══════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}${BOLD} ║                                                  ║${NC}"
echo -e "${CYAN}${BOLD} ║  【本机访问】   http://localhost:8000             ║${NC}"
echo -e "${CYAN}${BOLD} ║  【局域网访问】 http://${LAN_IP}:8000          ║${NC}"
echo -e "${CYAN}${BOLD} ║                                                  ║${NC}"
echo -e "${CYAN}${BOLD} ║  演示账号（密码均为 password123）：               ║${NC}"
echo -e "${CYAN}${BOLD} ║    管理员：admin                                 ║${NC}"
echo -e "${CYAN}${BOLD} ║    教  师：teacher_wang                          ║${NC}"
echo -e "${CYAN}${BOLD} ║    学  生：student_zhang                         ║${NC}"
echo -e "${CYAN}${BOLD} ║                                                  ║${NC}"
echo -e "${CYAN}${BOLD} ║  按 Ctrl+C 停止服务器                            ║${NC}"
echo -e "${CYAN}${BOLD} ╚══════════════════════════════════════════════════╝${NC}"
echo ""

cd "$ROOT_DIR"
$PYTHON_CMD server.py

echo ""
echo -e " ${CYAN}[信息]${NC} 服务器已停止运行。"
