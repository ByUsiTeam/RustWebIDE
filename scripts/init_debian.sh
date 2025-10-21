#!/bin/bash

# Debian 12 proot 环境初始化脚本
set -e

ENV_PATH="$1"
USER_ID="$2"

echo "开始初始化 Debian 12 环境..."
echo "环境路径: $ENV_PATH"
echo "用户ID: $USER_ID"

# 检查环境路径
if [ -z "$ENV_PATH" ]; then
    echo "错误: 未指定环境路径"
    exit 1
fi

# 创建必要的目录
mkdir -p "$ENV_PATH"
cd "$ENV_PATH"

# 检查是否已经存在 rootfs
if [ -d "rootfs" ]; then
    echo "检测到已存在的 rootfs，跳过下载"
else
    echo "下载 Debian 12 rootfs..."
    
    # 使用 proot-distro 的 rootfs（最小化版本）
    # 如果下载失败，使用备用方案
    if command -v wget &> /dev/null; then
        wget -O debian-rootfs.tar.xz https://github.com/termux/proot-distro/releases/download/v3.10.0/debian-x86_64-pd-v3.10.0.tar.xz || {
            echo "主镜像下载失败，尝试备用镜像..."
            wget -O debian-rootfs.tar.xz https://files.catbox.moe/9z5j6x.tar.xz
        }
    elif command -v curl &> /dev/null; then
        curl -L -o debian-rootfs.tar.xz https://github.com/termux/proot-distro/releases/download/v3.10.0/debian-x86_64-pd-v3.10.0.tar.xz || {
            echo "主镜像下载失败，尝试备用镜像..."
            curl -L -o debian-rootfs.tar.xz https://files.catbox.moe/9z5j6x.tar.xz
        }
    else
        echo "错误: 未找到 wget 或 curl"
        exit 1
    fi

    # 检查下载是否成功
    if [ ! -f "debian-rootfs.tar.xz" ]; then
        echo "错误: 下载 rootfs 失败"
        exit 1
    fi

    echo "解压 rootfs..."
    mkdir -p rootfs
    tar -xf debian-rootfs.tar.xz -C rootfs
    
    # 清理临时文件
    rm -f debian-rootfs.tar.xz
fi

# 创建用户目录
mkdir -p rootfs/home/user
mkdir -p rootfs/home/user/projects

# 创建基本的启动脚本
cat > rootfs/etc/profile << 'EOF'
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export HOME=/home/user
export USER=user
export TERM=xterm-256color
cd $HOME
EOF

# 创建用户初始化脚本
cat > "$ENV_PATH/init_user.sh" << 'EOF'
#!/bin/bash
# 用户环境初始化脚本

echo "设置用户环境..."

# 创建用户
if ! id "user" &>/dev/null; then
    useradd -m -s /bin/bash user
fi

# 设置基础环境
echo "export PS1='\\[\\033[01;32m\\]\\u@debian\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ '" >> /home/user/.bashrc
echo "alias ll='ls -la'" >> /home/user/.bashrc
echo "alias la='ls -A'" >> /home/user/.bashrc

# 更新包管理器
apt-get update || true

echo "用户环境初始化完成"
EOF

chmod +x "$ENV_PATH/init_user.sh"

# 创建环境启动脚本
cat > "$ENV_PATH/start.sh" << 'EOF'
#!/bin/bash
# Proot 环境启动脚本

ENV_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ENV_PATH"

# 设置环境变量
export PROOT_TMP_DIR="$ENV_PATH/tmp"
export PROOT_LOADER="$ENV_PATH/loader"
mkdir -p "$PROOT_TMP_DIR"

# 启动 proot 环境
exec proot \
    -S rootfs \
    -w /home/user \
    -b /dev \
    -b /proc \
    -b /sys \
    -b /data/data/com.termux/files/usr/tmp:/tmp \
    /bin/bash --login
EOF

chmod +x "$ENV_PATH/start.sh"

# 创建 Rust 项目初始化脚本
cat > rootfs/home/user/init_rust_project.sh << 'EOF'
#!/bin/bash
# Rust 项目初始化脚本

echo "初始化 Rust 项目..."

# 检查是否安装了 Rust
if ! command -v rustc &> /dev/null; then
    echo "安装 Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
fi

# 创建示例项目
if [ ! -f "Cargo.toml" ]; then
    echo "创建新的 Rust 项目..."
    cat > Cargo.toml << 'CARGOEOF'
[package]
name = "user_project"
version = "0.1.0"
edition = "2021"

[dependencies]
CARGOEOF

    mkdir -p src
    cat > src/main.rs << 'RUSTEOF'
fn main() {
    println!("Hello from Debian 12 proot environment!");
    
    let numbers = vec![1, 2, 3, 4, 5];
    let sum: i32 = numbers.iter().sum();
    println!("Sum of numbers: {}", sum);
}
RUSTEOF
fi

echo "Rust 项目初始化完成"
echo "运行: cargo build --release"
echo "运行: ./target/release/user_project"
EOF

chmod +x rootfs/home/user/init_rust_project.sh

echo "Debian 12 环境初始化完成!"
echo "环境路径: $ENV_PATH"
echo "启动命令: $ENV_PATH/start.sh"