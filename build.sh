#!/bin/bash

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "编译 C++ 终端管理器..."

# 针对 Termux 环境的编译选项
if [ -d "/data/data/com.termux" ]; then
    echo "检测到 Termux 环境，使用特定编译选项..."
    # 在 Termux 中使用 clang++ 并链接必要的库
    clang++ -std=c++17 -fPIC -shared -o libterminal.so terminal_manager.cpp \
        -landroid-support \
        -llog \
        -lc++_shared
else
    # Linux 环境使用 g++
    gcc -std=c++17 -fPIC -shared -o libterminal.so terminal_manager.cpp -lutil
fi

if [ $? -ne 0 ]; then
    echo "C++ 编译失败!"
    exit 1
fi

echo "检查 Rust 环境..."
if ! command -v rustc &> /dev/null; then
    echo "安装 Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
fi

echo "创建必要的目录..."
mkdir -p workspace
mkdir -p logs

chmod +x libterminal.so

echo "构建完成!"
echo "启动服务: python3 app.py"