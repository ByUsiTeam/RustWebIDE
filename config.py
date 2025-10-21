import os
import json

# 获取当前文件所在目录
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class Config:
    BYUSI_BASE_URL = "https://api.www.cdifit.cn/user/"
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    DEBUG = os.environ.get('DEBUG', 'True').lower() == 'true'
    # 使用相对路径
    RUST_WORKSPACE_BASE = os.path.join(BASE_DIR, "workspace")
    PROOT_ENV_BASE = os.path.join(BASE_DIR, "proot_environments")
    USER_DB_PATH = os.path.join(BASE_DIR, "user_db.json")
    
    # 会话配置
    SESSION_COOKIE_NAME = 'rust_ide_session'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = False  # 在 Termux 中设为 False
    PERMANENT_SESSION_LIFETIME = 86400 * 30  # 30天
    
    MAX_EXECUTION_TIME = 30
    MAX_MEMORY_MB = 512
    MAX_TERMINAL_SESSIONS = 100
    TERMINAL_TIMEOUT = 3600
    ALLOWED_EXTENSIONS = {'rs', 'toml'}
    MAX_FILE_SIZE = 10 * 1024 * 1024
    
    # WebSocket 配置
    SOCKETIO_ASYNC_MODE = 'eventlet'