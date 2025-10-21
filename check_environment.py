#!/usr/bin/env python3
import os
import subprocess
import sys

def check_environment():
    print("检查系统环境...")
    
    # 检查 Python
    try:
        python_version = subprocess.run([sys.executable, '--version'], capture_output=True, text=True)
        print(f"✓ Python: {python_version.stdout.strip()}")
    except:
        print("✗ Python: 未找到")
        return False
    
    # 检查 Rust
    try:
        rust_version = subprocess.run(['rustc', '--version'], capture_output=True, text=True)
        print(f"✓ Rust: {rust_version.stdout.strip()}")
    except:
        print("✗ Rust: 未找到，将尝试安装...")
        try:
            subprocess.run(['curl', '--proto', '=https', '--tlsv1.2', '-sSf', 'https://sh.rustup.rs'], 
                         check=True, stdout=subprocess.DEVNULL)
            print("  Rust 安装脚本已下载，请运行: sh rustup-init.sh")
        except:
            print("  Rust 安装失败")
    
    # 检查 proot
    try:
        proot_version = subprocess.run(['proot', '--version'], capture_output=True, text=True)
        print(f"✓ Proot: 可用")
    except:
        print("✗ Proot: 不可用，将使用简化环境")
    
    # 检查必要目录
    necessary_dirs = ['workspace', 'proot_environments', 'logs', 'scripts']
    for dir_name in necessary_dirs:
        if os.path.exists(dir_name):
            print(f"✓ 目录: {dir_name}")
        else:
            print(f"✗ 目录: {dir_name} 不存在，将创建")
            os.makedirs(dir_name, exist_ok=True)
    
    # 检查用户数据库
    if os.path.exists('user_db.json'):
        print("✓ 用户数据库: 存在")
    else:
        print("✗ 用户数据库: 不存在，将创建")
        with open('user_db.json', 'w') as f:
            f.write('{}')
    
    print("\n环境检查完成!")
    return True

if __name__ == '__main__':
    check_environment()