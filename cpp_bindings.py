import ctypes
import os

# 获取当前文件所在目录
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 加载 C++ 库
def load_cpp_library():
    lib_path = os.path.join(BASE_DIR, 'libterminal.so')
    return ctypes.CDLL(lib_path)

cpp_lib = load_cpp_library()

# 定义 C 函数原型
cpp_lib.start_terminal_session.restype = ctypes.c_char_p
cpp_lib.start_terminal_session.argtypes = [ctypes.c_char_p]

cpp_lib.execute_terminal_command.restype = ctypes.c_int
cpp_lib.execute_terminal_command.argtypes = [
    ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_size_t
]

cpp_lib.close_terminal_session.restype = ctypes.c_int
cpp_lib.close_terminal_session.argtypes = [ctypes.c_char_p]

def start_terminal_session(workspace):
    result = cpp_lib.start_terminal_session(workspace.encode('utf-8'))
    return result.decode('utf-8') if result else None

def execute_terminal_command(session_id, command):
    output_buffer = ctypes.create_string_buffer(4096)
    result = cpp_lib.execute_terminal_command(
        session_id.encode('utf-8'),
        command.encode('utf-8'),
        output_buffer,
        ctypes.sizeof(output_buffer)
    )
    
    if result == 0:
        return {"status": "success", "output": output_buffer.value.decode('utf-8')}
    else:
        return {"status": "error", "message": "Command execution failed"}

def close_terminal_session(session_id):
    return cpp_lib.close_terminal_session(session_id.encode('utf-8')) == 0