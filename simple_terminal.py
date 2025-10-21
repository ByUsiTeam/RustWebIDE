import os
import subprocess
import threading
import uuid
import time

class SimpleTerminalManager:
    def __init__(self):
        self.sessions = {}
    
    def create_session(self, workspace):
        try:
            session_id = str(uuid.uuid4())
            
            # 创建一个简单的伪终端模拟
            # 使用 subprocess.PIPE 来模拟终端输入输出
            process = subprocess.Popen(
                ['sh'],
                cwd=workspace,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True
            )
            
            self.sessions[session_id] = {
                'process': process,
                'workspace': workspace,
                'buffer': '',
                'active': True,
                'last_output': ''
            }
            
            # 启动输出读取线程
            self._start_output_reader(session_id)
            
            return session_id
            
        except Exception as e:
            print(f"创建终端会话失败: {e}")
            return None
    
    def _start_output_reader(self, session_id):
        """启动输出读取线程"""
        def read_output():
            session = self.sessions.get(session_id)
            if not session:
                return
            
            process = session['process']
            
            while session['active'] and process.poll() is None:
                try:
                    # 非阻塞读取输出
                    output = process.stdout.readline()
                    if output:
                        session['buffer'] += output
                        session['last_output'] = output
                except:
                    break
        
        thread = threading.Thread(target=read_output, daemon=True)
        thread.start()
    
    def execute_command(self, session_id, command):
        if session_id not in self.sessions:
            return {"status": "error", "message": "Session not found"}
        
        session = self.sessions[session_id]
        
        try:
            process = session['process']
            
            # 发送命令
            process.stdin.write(command + '\n')
            process.stdin.flush()
            
            # 等待一段时间获取输出
            time.sleep(0.5)
            
            # 读取缓冲的输出
            output = session.get('buffer', '')
            session['buffer'] = ''  # 清空缓冲区
            
            return {"status": "success", "output": output}
            
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    def get_latest_output(self, session_id):
        """获取最新的输出（用于WebSocket实时推送）"""
        if session_id not in self.sessions:
            return ""
        
        session = self.sessions[session_id]
        output = session.get('last_output', '')
        session['last_output'] = ''  # 清空最新输出
        
        return output
    
    def close_session(self, session_id):
        if session_id in self.sessions:
            session = self.sessions[session_id]
            session['active'] = False
            try:
                session['process'].terminate()
            except:
                pass
            del self.sessions[session_id]
            return True
        return False

# 全局实例
terminal_manager = SimpleTerminalManager()

# 兼容性包装函数
def start_terminal_session(workspace):
    return terminal_manager.create_session(workspace)

def execute_terminal_command(session_id, command):
    return terminal_manager.execute_command(session_id, command)

def close_terminal_session(session_id):
    return terminal_manager.close_session(session_id)

def get_terminal_output(session_id):
    return terminal_manager.get_latest_output(session_id)