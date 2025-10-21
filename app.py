import os
import json
import subprocess
import uuid
from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
import requests
from config import Config

# 获取当前文件所在目录
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)
app.config.from_object(Config)
CORS(app)

# 导入C++绑定
from cpp_bindings import start_terminal_session, execute_terminal_command, close_terminal_session

# ByUsi API 配置
BYUSI_BASE_URL = "https://api.www.cdifit.cn/user/"

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

class RustEnvironmentManager:
    def __init__(self):
        self.environments = {}
    
    def create_environment(self, user_id):
        env_id = str(uuid.uuid4())
        user_workspace = os.path.join(BASE_DIR, "workspace", str(user_id), env_id)
        os.makedirs(user_workspace, exist_ok=True)
        self._init_rust_project(user_workspace)
        
        environment = {
            'id': env_id,
            'workspace': user_workspace,
            'user_id': user_id
        }
        self.environments[env_id] = environment
        return env_id
    
    def _init_rust_project(self, workspace):
        cargo_toml = """[package]
name = "user_project"
version = "0.1.0"
edition = "2021"

[dependencies]
"""
        with open(os.path.join(workspace, "Cargo.toml"), "w") as f:
            f.write(cargo_toml)
        
        src_dir = os.path.join(workspace, "src")
        os.makedirs(src_dir, exist_ok=True)
        main_rs = """fn main() {
    println!("Hello, Rust Web IDE!");
}
"""
        with open(os.path.join(src_dir, "main.rs"), "w") as f:
            f.write(main_rs)
    
    def execute_rust_code(self, env_id, code, input_data=""):
        if env_id not in self.environments:
            return {"status": "error", "message": "Environment not found"}
        
        env = self.environments[env_id]
        workspace = env['workspace']
        
        try:
            with open(os.path.join(workspace, "src", "main.rs"), "w") as f:
                f.write(code)
            
            result = self._compile_and_run(workspace, input_data)
            return result
            
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    def _compile_and_run(self, workspace, input_data):
        try:
            # 编译
            compile_process = subprocess.run(
                ["cargo", "build", "--release"],
                cwd=workspace,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if compile_process.returncode != 0:
                return {
                    "status": "compile_error",
                    "output": compile_process.stderr,
                    "exit_code": compile_process.returncode
                }
            
            # 运行
            executable_path = os.path.join(workspace, "target", "release", "user_project")
            run_process = subprocess.run(
                [executable_path],
                input=input_data,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            return {
                "status": "success",
                "output": run_process.stdout,
                "error": run_process.stderr,
                "exit_code": run_process.returncode
            }
            
        except subprocess.TimeoutExpired:
            return {"status": "timeout", "message": "Execution timeout"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

# 初始化管理器
auth_manager = ByUsiAuth()
rust_manager = RustEnvironmentManager()

@app.route('/')
def index():
    return render_template('index.html')

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
        session['user_token'] = result['data']['token']
        session['user_info'] = result['data']
        env_id = rust_manager.create_environment(result['data']['id'])
        session['environment_id'] = env_id
    
    return jsonify(result)

@app.route('/api/user_info', methods=['GET'])
def api_user_info():
    token = session.get('user_token')
    if not token:
        return jsonify({"status": "error", "message": "Not logged in"})
    
    result = auth_manager.get_user_info(token)
    return jsonify(result)

@app.route('/api/run_rust', methods=['POST'])
def api_run_rust():
    if 'environment_id' not in session:
        return jsonify({"status": "error", "message": "No environment"})
    
    data = request.json
    result = rust_manager.execute_rust_code(
        session['environment_id'],
        data.get('code', ''),
        data.get('input', '')
    )
    
    return jsonify(result)

@app.route('/api/terminal/start', methods=['POST'])
def api_terminal_start():
    if 'environment_id' not in session:
        return jsonify({"status": "error", "message": "No environment"})
    
    env_id = session['environment_id']
    workspace = rust_manager.environments[env_id]['workspace']
    
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
    session.clear()
    return jsonify({"status": "success", "message": "Logged out"})

if __name__ == '__main__':
    # 确保必要的目录存在
    os.makedirs(os.path.join(BASE_DIR, "workspace"), exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, "logs"), exist_ok=True)
    
    app.run(host='0.0.0.0', port=5554, debug=Config.DEBUG)