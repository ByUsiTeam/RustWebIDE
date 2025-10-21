#!/bin/bash

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "检查环境..."
python3 check_environment.py

echo ""
echo "启动 Rust Web IDE..."
echo "注意: 首次使用会提示初始化 Debian 12 环境"
echo "这将提供完整的 Linux 开发环境"
python3 app.py