#!/bin/bash

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "安装系统依赖..."
if [ -d "/data/data/com.termux" ]; then
    echo "检测到 Termux 环境"
    pkg update && pkg install -y python clang make rust proot
else
    echo "检测到 Linux 环境"
    # Ubuntu/Debian
    if command -v apt &> /dev/null; then
        sudo apt update && sudo apt install -y python3 python3-pip gcc build-essential proot
    # CentOS/RHEL
    elif command -v yum &> /dev/null; then
        sudo yum install -y python3 python3-pip gcc-c++ make proot
    fi
fi

echo "创建必要的目录..."
mkdir -p workspace
mkdir -p proot_environments
mkdir -p logs

echo "初始化用户数据库..."
if [ ! -f "user_db.json" ]; then
    echo "{}" > user_db.json
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
echo "  - Proot 环境隔离"
echo "  - WebSocket 实时终端"
echo "  - JSON 用户数据库"