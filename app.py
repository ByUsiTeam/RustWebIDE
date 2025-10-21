import os
import json
import subprocess
import uuid
import time
from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import requests
from config import Config

# 获取当前文件所在目录
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)
app.config.from_object(Config)

# 配置会话
app.config['SECRET_KEY'] = Config.SECRET_KEY
app.config['SESSION_COOKIE_NAME'] = Config.SESSION_COOKIE_NAME
app.config['SESSION_COOKIE_HTTPONLY'] = Config.SESSION_COOKIE_HTTPONLY
app.config['SESSION_COOKIE_SECURE'] = Config.SESSION_COOKIE_SECURE
app.config['PERMANENT_SESSION_LIFETIME'] = Config.PERMANENT_SESSION_LIFETIME

CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode=Config.SOCKETIO_ASYNC_MODE)

# 导入终端绑定
try:
    from python_terminal import start_terminal_session, execute_terminal_command, close_terminal_session, PythonTerminalManager
    CPP_TERMINAL_AVAILABLE = False
    print("使用 Python 终端实现")
except ImportError as e:
    print(f"终端模块导入失败: {e}")
    CPP_TERMINAL_AVAILABLE = False

# ByUsi API 配置
BYUSI_BASE_URL = "https://api.www.cdifit.cn/user/"

class UserDB:
    def __init__(self, db_path):
        self.db_path = db_path
        self.data = self._load_db()
    
    def _load_db(self):
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"加载数据库失败: {e}")
                return {}
        return {}
    
    def _save_db(self):
        try:
            with open(self.db_path, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"保存数据库失败: {e}")
            return False
    
    def get_user_environment(self, user_id):
        user_id_str = str(user_id)
        return self.data.get(user_id_str, {}).get('environment_id')
    
    def set_user_environment(self, user_id, env_id, env_type="proot"):
        user_id_str = str(user_id)
        if user_id_str not in self.data:
            self.data[user_id_str] = {}
        
        self.data[user_id_str]['environment_id'] = env_id
        self.data[user_id_str]['environment_type'] = env_type
        self.data[user_id_str]['created_at'] = time.time()
        self.data[user_id_str]['last_used'] = time.time()
        
        return self._save_db()
    
    def update_last_used(self, user_id):
        user_id_str = str(user_id)
        if user_id_str in self.data:
            self.data[user_id_str]['last_used'] = time.time()
            return self._save_db()
        return False

class FileManager:
    @staticmethod
    def get_file_tree(env_path, base_path="/home/user"):
        """获取文件树结构"""
        full_path = os.path.join(env_path, base_path.lstrip('/'))
        
        if not os.path.exists(full_path):
            return None
        
        def build_tree(path, relative_path):
            tree = {
                'name': os.path.basename(path),
                'path': relative_path,
                'type': 'directory',
                'children': []
            }
            
            try:
                items = os.listdir(path)
                for item in sorted(items):
                    item_path = os.path.join(path, item)
                    item_relative_path = os.path.join(relative_path, item)
                    
                    if os.path.isdir(item_path):
                        tree['children'].append(build_tree(item_path, item_relative_path))
                    else:
                        tree['children'].append({
                            'name': item,
                            'path': item_relative_path,
                            'type': 'file',
                            'extension': os.path.splitext(item)[1].lower()
                        })
            except PermissionError:
                pass
            
            return tree
        
        return build_tree(full_path, base_path)
    
    @staticmethod
    def create_file(env_path, file_path, content=""):
        """创建文件"""
        full_path = os.path.join(env_path, file_path.lstrip('/'))
        
        # 确保目录存在
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        try:
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        except Exception as e:
            print(f"创建文件失败: {e}")
            return False
    
    @staticmethod
    def create_directory(env_path, dir_path):
        """创建目录"""
        full_path = os.path.join(env_path, dir_path.lstrip('/'))
        
        try:
            os.makedirs(full_path, exist_ok=True)
            return True
        except Exception as e:
            print(f"创建目录失败: {e}")
            return False
    
    @staticmethod
    def read_file(env_path, file_path):
        """读取文件内容"""
        full_path = os.path.join(env_path, file_path.lstrip('/'))
        
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            print(f"读取文件失败: {e}")
            return None
    
    @staticmethod
    def write_file(env_path, file_path, content):
        """写入文件内容"""
        full_path = os.path.join(env_path, file_path.lstrip('/'))
        
        try:
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        except Exception as e:
            print(f"写入文件失败: {e}")
            return False
    
    @staticmethod
    def delete_path(env_path, path):
        """删除文件或目录"""
        full_path = os.path.join(env_path, path.lstrip('/'))
        
        try:
            if os.path.isdir(full_path):
                import shutil
                shutil.rmtree(full_path)
            else:
                os.remove(full_path)
            return True
        except Exception as e:
            print(f"删除失败: {e}")
            return False
    
    @staticmethod
    def rename_path(env_path, old_path, new_path):
        """重命名文件或目录"""
        old_full_path = os.path.join(env_path, old_path.lstrip('/'))
        new_full_path = os.path.join(env_path, new_path.lstrip('/'))
        
        try:
            os.rename(old_full_path, new_full_path)
            return True
        except Exception as e:
            print(f"重命名失败: {e}")
            return False

class ByUsiAuth:
    @staticmethod
    def register(username, email, password):
        data = {
            "action": "register",
            "username": username,
            "email": email,
            "password": password
        }
        try:
            response = requests.post(f"{BYUSI_BASE_URL}api.php", data=data)
            return response.json()
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    @staticmethod
    def login(identifier, password):
        data = {
            "action": "login",
            "identifier": identifier,
            "password": password
        }
        try:
            response = requests.post(f"{BYUSI_BASE_URL}api.php", data=data)
            return response.json()
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    @staticmethod
    def get_user_info(token):
        data = {
            "action": "get_user",
            "token": token
        }
        try:
            response = requests.post(f"{BYUSI_BASE_URL}api.php", data=data)
            return response.json()
        except Exception as e:
            return {"status": "error", "message": str(e)}

class ProotEnvironmentManager:
    def __init__(self):
        self.environments = {}
    
    def create_environment(self, user_id):
        env_id = str(uuid.uuid4())
        user_env_path = os.path.join(Config.PROOT_ENV_BASE, str(user_id), env_id)
        os.makedirs(user_env_path, exist_ok=True)
        
        # 创建基础的 proot 环境
        self._init_proot_environment(user_env_path)
        
        environment = {
            'id': env_id,
            'path': user_env_path,
            'user_id': user_id,
            'created_at': time.time()
        }
        
        self.environments[env_id] = environment
        return env_id
    
    def _init_proot_environment(self, env_path):
        """初始化 proot 环境"""
        # 创建基础目录结构
        dirs = ['bin', 'lib', 'usr', 'home', 'tmp', 'proc', 'dev']
        for dir_name in dirs:
            os.makedirs(os.path.join(env_path, dir_name), exist_ok=True)
        
        # 创建基本的启动脚本
        startup_script = """#!/bin/sh
export PATH=/bin:/usr/bin:$PATH
export HOME=/home/user
export TERM=xterm-256color
cd $HOME
exec /bin/sh "$@"
"""
        with open(os.path.join(env_path, "start.sh"), "w") as f:
            f.write(startup_script)
        
        os.chmod(os.path.join(env_path, "start.sh"), 0o755)
        
        # 创建用户 home 目录
        user_home = os.path.join(env_path, "home", "user")
        os.makedirs(user_home, exist_ok=True)
        
        # 初始化 Rust 项目
        self._init_rust_project(user_home)
    
    def _init_rust_project(self, workspace):
        cargo_toml = """[package]
name = "user_project"
version = "0.1.0"
edition = "2021"

[dependencies]
"""
        cargo_path = os.path.join(workspace, "Cargo.toml")
        with open(cargo_path, "w", encoding='utf-8') as f:
            f.write(cargo_toml)
        
        src_dir = os.path.join(workspace, "src")
        os.makedirs(src_dir, exist_ok=True)
        main_rs = """fn main() {
    println!("Hello, Rust Web IDE with Proot!");
}
"""
        main_path = os.path.join(src_dir, "main.rs")
        with open(main_path, "w", encoding='utf-8') as f:
            f.write(main_rs)
    
    def execute_in_environment(self, env_id, command, cwd=None, use_proot=True):
        if env_id not in self.environments:
            return {"status": "error", "message": "Environment not found"}
        
        env = self.environments[env_id]
        env_path = env['path']
        
        try:
            if use_proot and self._has_proot():
                # 使用 proot 执行命令
                proot_cmd = [
                    "proot", 
                    "-S", env_path,
                    "-w", cwd or "/home/user",
                    "sh", "-c", command
                ]
                result = subprocess.run(
                    proot_cmd,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
            else:
                # 直接执行命令（在宿主机环境）
                if cwd:
                    original_cwd = os.getcwd()
                    os.chdir(cwd)
                
                result = subprocess.run(
                    command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if cwd:
                    os.chdir(original_cwd)
            
            return {
                "status": "success",
                "output": result.stdout,
                "error": result.stderr,
                "exit_code": result.returncode
            }
            
        except subprocess.TimeoutExpired:
            return {"status": "timeout", "message": "Execution timeout"}
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    def _has_proot(self):
        """检查系统是否安装了 proot"""
        try:
            subprocess.run(["proot", "--version"], capture_output=True, check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
    
    def execute_rust_code(self, env_id, code, input_data=""):
        if env_id not in self.environments:
            return {"status": "error", "message": "Environment not found"}
        
        env = self.environments[env_id]
        workspace = os.path.join(env['path'], "home", "user")
        
        try:
            # 写入用户代码
            main_path = os.path.join(workspace, "src", "main.rs")
            with open(main_path, "w", encoding='utf-8') as f:
                f.write(code)
            
            # 编译并运行
            compile_result = self.execute_in_environment(
                env_id, 
                "cargo build --release",
                cwd="/home/user"
            )
            
            if compile_result['status'] != 'success' or compile_result['exit_code'] != 0:
                return {
                    "status": "compile_error",
                    "output": compile_result.get('error', '') + compile_result.get('output', ''),
                    "exit_code": compile_result.get('exit_code', 1)
                }
            
            # 运行程序
            run_result = self.execute_in_environment(
                env_id,
                "./target/release/user_project",
                cwd="/home/user",
                input_data=input_data
            )
            
            return run_result
            
        except Exception as e:
            return {"status": "error", "message": str(e)}

# 初始化管理器
auth_manager = ByUsiAuth()
user_db = UserDB(Config.USER_DB_PATH)
proot_manager = ProotEnvironmentManager()
file_manager = FileManager()
terminal_manager = PythonTerminalManager()

# WebSocket 连接管理
connected_terminals = {}

@socketio.on('connect')
def handle_connect():
    print(f"客户端连接: {request.sid}")
    emit('connected', {'message': 'Connected to terminal'})

@socketio.on('disconnect')
def handle_disconnect():
    print(f"客户端断开: {request.sid}")
    if request.sid in connected_terminals:
        terminal_id = connected_terminals[request.sid]
        close_terminal_session(terminal_id)
        del connected_terminals[request.sid]

@socketio.on('start_terminal')
def handle_start_terminal(data):
    user_id = session.get('user_id')
    if not user_id:
        emit('terminal_output', {'output': 'Error: Not authenticated\r\n'})
        return
    
    env_id = user_db.get_user_environment(user_id)
    if not env_id:
        emit('terminal_output', {'output': 'Error: No environment found\r\n'})
        return
    
    env = proot_manager.environments.get(env_id)
    if not env:
        emit('terminal_output', {'output': 'Error: Environment not found\r\n'})
        return
    
    workspace = os.path.join(env['path'], "home", "user")
    terminal_id = start_terminal_session(workspace)
    
    if terminal_id:
        connected_terminals[request.sid] = terminal_id
        emit('terminal_started', {'terminal_id': terminal_id})
        # 发送欢迎信息
        emit('terminal_output', {'output': 'Terminal started in proot environment\r\n$ '})
    else:
        emit('terminal_output', {'output': 'Error: Failed to start terminal\r\n'})

@socketio.on('terminal_input')
def handle_terminal_input(data):
    terminal_id = connected_terminals.get(request.sid)
    if not terminal_id:
        emit('terminal_output', {'output': 'Error: No active terminal session\r\n'})
        return
    
    command = data.get('input', '')
    if not command:
        return
    
    # 发送命令回显
    emit('terminal_output', {'output': command + '\r\n'})
    
    result = execute_terminal_command(terminal_id, command)
    if result['status'] == 'success':
        emit('terminal_output', {'output': result['output'] + '\r\n$ '})
    else:
        emit('terminal_output', {'output': f"Error: {result['message']}\r\n$ "})

@app.before_request
def before_request():
    # 检查会话有效性
    if 'user_id' in session and 'user_token' in session:
        # 验证 token 是否仍然有效
        user_info = auth_manager.get_user_info(session['user_token'])
        if user_info.get('status') != 'success':
            # Token 无效，清除会话
            session.clear()

@app.route('/')
def index():
    # 检查是否有有效的会话
    if 'user_id' in session and 'user_token' in session:
        # 验证 token
        user_info = auth_manager.get_user_info(session['user_token'])
        if user_info.get('status') == 'success':
            # Token 有效，直接显示主界面
            return render_template('index.html')
    
    # 没有有效会话，显示登录界面
    return render_template('index.html')

# 文件管理 API
@app.route('/api/files/tree', methods=['GET'])
def api_files_tree():
    """获取文件树"""
    if 'environment_id' not in session or 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not authenticated"})
    
    env_id = session['environment_id']
    env = proot_manager.environments.get(env_id)
    if not env:
        return jsonify({"status": "error", "message": "Environment not found"})
    
    path = request.args.get('path', '/home/user')
    tree = file_manager.get_file_tree(env['path'], path)
    
    if tree is None:
        return jsonify({"status": "error", "message": "Path not found"})
    
    return jsonify({
        "status": "success",
        "tree": tree
    })

@app.route('/api/files/read', methods=['GET'])
def api_files_read():
    """读取文件内容"""
    if 'environment_id' not in session or 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not authenticated"})
    
    env_id = session['environment_id']
    env = proot_manager.environments.get(env_id)
    if not env:
        return jsonify({"status": "error", "message": "Environment not found"})
    
    file_path = request.args.get('path', '')
    if not file_path:
        return jsonify({"status": "error", "message": "No file path specified"})
    
    content = file_manager.read_file(env['path'], file_path)
    
    if content is None:
        return jsonify({"status": "error", "message": "File not found or cannot be read"})
    
    return jsonify({
        "status": "success",
        "content": content,
        "path": file_path
    })

@app.route('/api/files/write', methods=['POST'])
def api_files_write():
    """写入文件内容"""
    if 'environment_id' not in session or 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not authenticated"})
    
    env_id = session['environment_id']
    env = proot_manager.environments.get(env_id)
    if not env:
        return jsonify({"status": "error", "message": "Environment not found"})
    
    data = request.json
    file_path = data.get('path', '')
    content = data.get('content', '')
    
    if not file_path:
        return jsonify({"status": "error", "message": "No file path specified"})
    
    success = file_manager.write_file(env['path'], file_path, content)
    
    if success:
        return jsonify({"status": "success", "message": "File saved"})
    else:
        return jsonify({"status": "error", "message": "Failed to save file"})

@app.route('/api/files/create', methods=['POST'])
def api_files_create():
    """创建文件"""
    if 'environment_id' not in session or 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not authenticated"})
    
    env_id = session['environment_id']
    env = proot_manager.environments.get(env_id)
    if not env:
        return jsonify({"status": "error", "message": "Environment not found"})
    
    data = request.json
    file_path = data.get('path', '')
    content = data.get('content', '')
    
    if not file_path:
        return jsonify({"status": "error", "message": "No file path specified"})
    
    success = file_manager.create_file(env['path'], file_path, content)
    
    if success:
        return jsonify({"status": "success", "message": "File created"})
    else:
        return jsonify({"status": "error", "message": "Failed to create file"})

@app.route('/api/files/mkdir', methods=['POST'])
def api_files_mkdir():
    """创建目录"""
    if 'environment_id' not in session or 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not authenticated"})
    
    env_id = session['environment_id']
    env = proot_manager.environments.get(env_id)
    if not env:
        return jsonify({"status": "error", "message": "Environment not found"})
    
    data = request.json
    dir_path = data.get('path', '')
    
    if not dir_path:
        return jsonify({"status": "error", "message": "No directory path specified"})
    
    success = file_manager.create_directory(env['path'], dir_path)
    
    if success:
        return jsonify({"status": "success", "message": "Directory created"})
    else:
        return jsonify({"status": "error", "message": "Failed to create directory"})

@app.route('/api/files/delete', methods=['POST'])
def api_files_delete():
    """删除文件或目录"""
    if 'environment_id' not in session or 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not authenticated"})
    
    env_id = session['environment_id']
    env = proot_manager.environments.get(env_id)
    if not env:
        return jsonify({"status": "error", "message": "Environment not found"})
    
    data = request.json
    path = data.get('path', '')
    
    if not path:
        return jsonify({"status": "error", "message": "No path specified"})
    
    success = file_manager.delete_path(env['path'], path)
    
    if success:
        return jsonify({"status": "success", "message": "Path deleted"})
    else:
        return jsonify({"status": "error", "message": "Failed to delete path"})

@app.route('/api/files/rename', methods=['POST'])
def api_files_rename():
    """重命名文件或目录"""
    if 'environment_id' not in session or 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not authenticated"})
    
    env_id = session['environment_id']
    env = proot_manager.environments.get(env_id)
    if not env:
        return jsonify({"status": "error", "message": "Environment not found"})
    
    data = request.json
    old_path = data.get('old_path', '')
    new_path = data.get('new_path', '')
    
    if not old_path or not new_path:
        return jsonify({"status": "error", "message": "No path specified"})
    
    success = file_manager.rename_path(env['path'], old_path, new_path)
    
    if success:
        return jsonify({"status": "success", "message": "Path renamed"})
    else:
        return jsonify({"status": "error", "message": "Failed to rename path"})

@app.route('/api/check_auth', methods=['GET'])
def api_check_auth():
    """检查认证状态"""
    if 'user_id' in session and 'user_token' in session:
        user_info = auth_manager.get_user_info(session['user_token'])
        if user_info.get('status') == 'success':
            user_data = user_info.get('data', {})
            return jsonify({
                "status": "success",
                "authenticated": True,
                "user": user_data
            })
    
    return jsonify({
        "status": "success",
        "authenticated": False
    })

@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.json
    result = auth_manager.register(
        data.get('username'),
        data.get('email'),
        data.get('password')
    )
    return jsonify(result)

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json
    result = auth_manager.login(
        data.get('identifier'),
        data.get('password')
    )
    
    if result.get('status') == 'success':
        user_data = result['data']
        
        # 设置会话
        session.permanent = True
        session['user_id'] = user_data['id']
        session['user_token'] = user_data['token']
        session['user_info'] = user_data
        
        # 获取或创建用户环境
        env_id = user_db.get_user_environment(user_data['id'])
        if not env_id:
            env_id = proot_manager.create_environment(user_data['id'])
            user_db.set_user_environment(user_data['id'], env_id)
        else:
            user_db.update_last_used(user_data['id'])
        
        session['environment_id'] = env_id
        
        return jsonify({
            "status": "success",
            "message": "Login successful",
            "data": user_data
        })
    
    return jsonify(result)

@app.route('/api/user_info', methods=['GET'])
def api_user_info():
    if 'user_token' not in session:
        return jsonify({"status": "error", "message": "Not logged in"})
    
    result = auth_manager.get_user_info(session['user_token'])
    return jsonify(result)

@app.route('/api/run_rust', methods=['POST'])
def api_run_rust():
    if 'environment_id' not in session or 'user_id' not in session:
        return jsonify({"status": "error", "message": "Not authenticated"})
    
    data = request.json
    env_id = session['environment_id']
    
    result = proot_manager.execute_rust_code(
        env_id,
        data.get('code', ''),
        data.get('input', '')
    )
    
    # 更新最后使用时间
    user_db.update_last_used(session['user_id'])
    
    return jsonify(result)

@app.route('/api/terminal/start', methods=['POST'])
def api_terminal_start():
    if 'environment_id' not in session:
        return jsonify({"status": "error", "message": "No environment"})
    
    env_id = session['environment_id']
    env = proot_manager.environments.get(env_id)
    if not env:
        return jsonify({"status": "error", "message": "Environment not found"})
    
    workspace = os.path.join(env['path'], "home", "user")
    terminal_id = start_terminal_session(workspace)
    
    if terminal_id:
        session['terminal_id'] = terminal_id
        return jsonify({"status": "success", "terminal_id": terminal_id})
    else:
        return jsonify({"status": "error", "message": "Failed to start terminal"})

@app.route('/api/terminal/execute', methods=['POST'])
def api_terminal_execute():
    terminal_id = session.get('terminal_id')
    if not terminal_id:
        return jsonify({"status": "error", "message": "No terminal session"})
    
    data = request.json
    command = data.get('command', '')
    
    result = execute_terminal_command(terminal_id, command)
    return jsonify(result)

@app.route('/api/logout', methods=['POST'])
def api_logout():
    # 清理终端会话
    terminal_id = session.get('terminal_id')
    if terminal_id:
        close_terminal_session(terminal_id)
    
    # 清除会话
    session.clear()
    return jsonify({"status": "success", "message": "Logged out"})

@app.route('/api/system_info', methods=['GET'])
def api_system_info():
    """获取系统信息"""
    proot_available = proot_manager._has_proot()
    
    # 获取环境统计
    env_count = len(proot_manager.environments)
    user_count = len(user_db.data)
    
    return jsonify({
        "status": "success",
        "data": {
            "proot_available": proot_available,
            "environments_count": env_count,
            "users_count": user_count,
            "terminal_available": True
        }
    })

if __name__ == '__main__':
    # 确保必要的目录存在
    os.makedirs(os.path.join(BASE_DIR, "workspace"), exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, "proot_environments"), exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, "logs"), exist_ok=True)
    
    print("=" * 50)
    print("Rust Web IDE 启动成功!")
    print(f"访问地址: http://127.0.0.1:5554")
    print(f"WebSocket 支持: 已启用")
    print(f"Proot 环境: {'可用' if proot_manager._has_proot() else '不可用'}")
    print(f"文件管理: 已启用")
    print(f"用户数据库: {Config.USER_DB_PATH}")
    print("=" * 50)
    
    socketio.run(app, host='0.0.0.0', port=5554, debug=Config.DEBUG)