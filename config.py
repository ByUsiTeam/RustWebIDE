import os

# 获取当前文件所在目录
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class Config:
    BYUSI_BASE_URL = "https://api.www.cdifit.cn/user/"
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key')
    DEBUG = os.environ.get('DEBUG', 'True').lower() == 'true'
    # 使用相对路径
    RUST_WORKSPACE_BASE = os.path.join(BASE_DIR, "workspace")
    MAX_EXECUTION_TIME = 30
    MAX_MEMORY_MB = 512
    MAX_TERMINAL_SESSIONS = 100
    TERMINAL_TIMEOUT = 3600
    ALLOWED_EXTENSIONS = {'rs', 'toml'}
    MAX_FILE_SIZE = 10 * 1024 * 1024