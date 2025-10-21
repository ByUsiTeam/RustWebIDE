import os
import subprocess
import threading
import select
import fcntl
import uuid
import sys

class PythonTerminalManager:
    def __init__(self):
        self.sessions = {}
    
    def create_session(self, workspace):
        try:
            # 在 Termux 中使用 pty 创建伪终端
            import pty
            master, slave = pty.openpty()
            
            # 设置非阻塞
            flags = fcntl.fcntl(master, fcntl.F_GETFL)
            fcntl.fcntl(master, fcntl.F_SETFL, flags | os.O_NONBLOCK)
            
            # 启动 shell 进程
            pid = os.fork()
            
            if pid == 0:
                # 子进程
                os.close(master)
                os.setsid()
                os.dup2(slave, 0)
                os.dup2(slave, 1)
                os.dup2(slave, 2)
                os.close(slave)
                
                # 设置工作目录
                try:
                    os.chdir(workspace)
                except:
                    pass  # 如果目录不存在，忽略错误
                
                # 设置环境变量
                os.environ['TERM'] = 'xterm-256color'
                os.environ['PWD'] = workspace
                
                # 在 Termux 中使用 sh
                os.execlp('sh', 'sh')
            else:
                # 父进程
                os.close(slave)
                
                session_id = str(uuid.uuid4())
                self.sessions[session_id] = {
                    'master_fd': master,
                    'child_pid': pid,
                    'workspace': workspace,
                    'buffer': ''
                }
                
                # 启动输出读取线程
                self._start_output_reader(session_id)
                
                return session_id
                
        except Exception as e:
            print(f"创建终端会话失败: {e}")
            return None
    
    def _start_output_reader(self, session_id):
        """启动输出读取线程（用于 WebSocket）"""
        def read_output():
            session = self.sessions.get(session_id)
            if not session:
                return
            
            master_fd = session['master_fd']
            buffer = session.get('buffer', '')
            
            while session_id in self.sessions and self.sessions[session_id].get('active', True):
                try:
                    rlist, _, _ = select.select([master_fd], [], [], 0.1)
                    if master_fd in rlist:
                        chunk = os.read(master_fd, 1024)
                        if chunk:
                            buffer += chunk.decode('utf-8', errors='ignore')
                            # 这里可以添加 WebSocket 推送逻辑
                            session['buffer'] = buffer
                except (BlockingIOError, OSError):
                    pass
                except Exception as e:
                    print(f"终端读取错误: {e}")
                    break
        
        thread = threading.Thread(target=read_output, daemon=True)
        thread.start()
    
    def execute_command(self, session_id, command):
        if session_id not in self.sessions:
            return {"status": "error", "message": "Session not found"}
        
        session = self.sessions[session_id]
        
        try:
            # 发送命令
            full_command = command + '\n'
            os.write(session['master_fd'], full_command.encode())
            
            # 读取输出
            output = self._read_output(session['master_fd'])
            
            return {"status": "success", "output": output}
            
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    def _read_output(self, master_fd, timeout=1):
        output = ""
        
        # 使用 select 等待数据
        rlist, _, _ = select.select([master_fd], [], [], timeout)
        
        if master_fd in rlist:
            try:
                while True:
                    chunk = os.read(master_fd, 1024)
                    if not chunk:
                        break
                    output += chunk.decode('utf-8', errors='ignore')
            except BlockingIOError:
                # 没有更多数据可读
                pass
            except OSError:
                # 可能终端已关闭
                pass
        
        return output
    
    def read_available_output(self, session_id):
        """读取可用的输出（非阻塞）"""
        if session_id not in self.sessions:
            return ""
        
        session = self.sessions[session_id]
        buffer = session.get('buffer', '')
        session['buffer'] = ''  # 清空缓冲区
        return buffer
    
    def close_session(self, session_id):
        if session_id in self.sessions:
            session = self.sessions[session_id]
            session['active'] = False
            try:
                os.close(session['master_fd'])
                os.kill(session['child_pid'], 9)
            except:
                pass
            del self.sessions[session_id]
            return True
        return False

# 全局实例
terminal_manager = PythonTerminalManager()

# 兼容性包装函数
def start_terminal_session(workspace):
    return terminal_manager.create_session(workspace)

def execute_terminal_command(session_id, command):
    return terminal_manager.execute_command(session_id, command)

def close_terminal_session(session_id):
    return terminal_manager.close_session(session_id)

def read_terminal_output(session_id):
    return terminal_manager.read_available_output(session_id)