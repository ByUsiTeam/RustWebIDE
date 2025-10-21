#!/bin/bash

# Rust 环境设置脚本
set -e

ENV_PATH="$1"

echo "设置 Rust 环境..."

# 在 proot 环境中安装 Rust
cat > "$ENV_PATH/install_rust.sh" << 'EOF'
#!/bin/bash
# 在 proot 环境中安装 Rust

echo "开始在 proot 环境中安装 Rust..."

# 更新包列表
apt-get update || echo "更新包列表失败，继续..."

# 安装 curl（如果不存在）
if ! command -v curl &> /dev/null; then
    echo "安装 curl..."
    apt-get install -y curl || echo "安装 curl 失败，尝试继续..."
fi

# 安装 Rust
echo "安装 Rust..."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# 设置环境变量
source $HOME/.cargo/env

# 验证安装
if command -v rustc &> /dev/null; then
    echo "Rust 安装成功!"
    rustc --version
    cargo --version
else
    echo "Rust 安装失败!"
    exit 1
fi
EOF

chmod +x "$ENV_PATH/install_rust.sh"

echo "Rust 安装脚本已创建: $ENV_PATH/install_rust.sh"