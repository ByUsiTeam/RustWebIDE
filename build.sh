#!/bin/bash

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "安装系统依赖..."
if [ -d "/data/data/com.termux" ]; then
    echo "检测到 Termux 环境"
    pkg update && pkg install -y python clang make rust proot wget tar
else
    echo "检测到 Linux 环境"
    # Ubuntu/Debian
    if command -v apt &> /dev/null; then
        sudo apt update && sudo apt install -y python3 python3-pip gcc build-essential proot wget tar
    # CentOS/RHEL
    elif command -v yum &> /dev/null; then
        sudo yum install -y python3 python3-pip gcc-c++ make proot wget tar
    fi
fi

echo "创建必要的目录..."
mkdir -p workspace
mkdir -p proot_environments
mkdir -p logs
mkdir -p scripts

echo "设置初始化脚本权限..."
if [ -f "scripts/init_debian.sh" ]; then
    chmod +x scripts/init_debian.sh
    echo "✓ 初始化脚本已设置可执行权限"
else
    echo "⚠ 初始化脚本不存在，请确保 scripts/init_debian.sh 已创建"
fi

if [ -f "scripts/setup_rust.sh" ]; then
    chmod +x scripts/setup_rust.sh
    echo "✓ Rust 设置脚本已设置可执行权限"
fi

echo "初始化用户数据库..."
if [ ! -f "user_db.json" ]; then
    echo "{}" > user_db.json
    echo "✓ 用户数据库已创建"
else
    echo "✓ 用户数据库已存在"
fi

echo "安装 Python 依赖..."
pip3 install -r requirements.txt

if [ $? -ne 0 ]; then
    echo "Python 依赖安装失败!"
    exit 1
fi

echo "构建完成!"
echo "启动服务: python3 app.py"
echo "高级功能:"
echo "  - Cookie 会话持久化"
echo "  - Debian 12 环境初始化"
echo "  - WebSocket 实时终端"
echo "  - JSON 用户数据库"
echo "  - 文件树浏览器"
echo "  - 文件管理功能"