let currentTerminalId = null;
let socket = null;
let isAuthenticated = false;
let currentUser = null;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    loadSavedCode();
    initSocketIO();
});

// 检查认证状态
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/check_auth');
        const result = await response.json();
        
        if (result.authenticated && result.user) {
            isAuthenticated = true;
            currentUser = result.user;
            updateUserInfo(currentUser);
            showMessage('自动登录成功!', 'success');
        }
    } catch (error) {
        console.log('检查认证状态失败:', error);
    }
}

// 初始化 WebSocket
function initSocketIO() {
    socket = io();
    
    socket.on('connected', function(data) {
        console.log('WebSocket connected:', data);
    });
    
    socket.on('terminal_output', function(data) {
        const terminalOutput = document.getElementById('terminal-output');
        if (terminalOutput) {
            terminalOutput.innerHTML += data.output;
            terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }
    });
    
    socket.on('terminal_started', function(data) {
        currentTerminalId = data.terminal_id;
        console.log('Terminal started:', currentTerminalId);
    });
    
    socket.on('disconnect', function() {
        console.log('WebSocket disconnected');
        showMessage('连接断开，正在重连...', 'info');
    });
}

// 显示/隐藏模态框
function showLogin() {
    document.getElementById('loginModal').style.display = 'flex';
}

function showRegister() {
    document.getElementById('registerModal').style.display = 'flex';
}

function hideModals() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('registerModal').style.display = 'none';
}

// 标签切换
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    if (tabName === 'output') {
        document.getElementById('output-content').style.display = 'block';
        document.getElementById('terminal-content').style.display = 'none';
    } else {
        document.getElementById('output-content').style.display = 'none';
        document.getElementById('terminal-content').style.display = 'flex';
        if (isAuthenticated && !currentTerminalId) {
            startWebSocketTerminal();
        }
    }
}

// 启动 WebSocket 终端
function startWebSocketTerminal() {
    if (!socket || !isAuthenticated) {
        showMessage('请先登录以使用终端', 'error');
        return;
    }
    
    socket.emit('start_terminal');
}

// 用户认证
async function login() {
    const identifier = document.getElementById('loginIdentifier').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!identifier || !password) {
        showMessage('请填写用户名/邮箱和密码', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ identifier, password })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            hideModals();
            isAuthenticated = true;
            currentUser = result.data;
            updateUserInfo(currentUser);
            showMessage('登录成功!', 'success');
            
            // 重新初始化 WebSocket 连接
            if (socket) {
                socket.disconnect();
            }
            initSocketIO();
        } else {
            showMessage('登录失败: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('网络错误: ' + error.message, 'error');
    }
}

async function register() {
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    if (!username || !email || !password) {
        showMessage('请填写所有字段', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, email, password })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            hideModals();
            showMessage('注册成功!', 'success');
            showLogin();
        } else {
            showMessage('注册失败: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('网络错误: ' + error.message, 'error');
    }
}

function logout() {
    fetch('/api/logout', { method: 'POST' });
    isAuthenticated = false;
    currentUser = null;
    currentTerminalId = null;
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('authButtons').style.display = 'flex';
    
    if (socket) {
        socket.disconnect();
    }
    
    showMessage('已退出登录', 'info');
}

function updateUserInfo(userData) {
    document.getElementById('username').textContent = userData.username;
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('authButtons').style.display = 'none';
}

// 代码运行
async function runCode() {
    if (!isAuthenticated) {
        showMessage('请先登录以运行代码', 'error');
        return;
    }
    
    const code = document.getElementById('editor').value;
    
    if (!code.trim()) {
        showMessage('请输入代码', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/run_rust', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ code })
        });
        
        const result = await response.json();
        
        let output = '';
        if (result.status === 'success') {
            output = result.output || '程序执行成功 (无输出)';
            if (result.error) {
                output += '\n错误: ' + result.error;
            }
        } else if (result.status === 'compile_error') {
            output = '编译错误:\n' + result.output;
        } else if (result.status === 'timeout') {
            output = '执行超时';
        } else {
            output = '错误: ' + result.message;
        }
        
        document.getElementById('output-content').textContent = output;
    } catch (error) {
        showMessage('执行错误: ' + error.message, 'error');
    }
}

function saveCode() {
    const code = document.getElementById('editor').value;
    localStorage.setItem('rust_code', code);
    showMessage('代码已保存到本地', 'success');
}

function loadSavedCode() {
    const savedCode = localStorage.getItem('rust_code');
    if (savedCode) {
        document.getElementById('editor').value = savedCode;
    }
}

// WebSocket 终端功能
function sendTerminalCommand() {
    if (!isAuthenticated) {
        showMessage('请先登录以使用终端', 'error');
        return;
    }
    
    const input = document.getElementById('terminal-input');
    const command = input.value.trim();
    
    if (!command) return;
    
    if (!socket || !socket.connected) {
        showMessage('终端连接未建立', 'error');
        return;
    }
    
    socket.emit('terminal_input', { input: command });
    input.value = '';
}

function handleTerminalInput(event) {
    if (event.key === 'Enter') {
        sendTerminalCommand();
    }
}

// 工具函数
function showMessage(message, type) {
    // 移除现有消息
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => msg.remove());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    
    document.querySelector('.container').insertBefore(messageDiv, document.querySelector('.header'));
    
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 3000);
}

// 系统信息
async function showSystemInfo() {
    try {
        const response = await fetch('/api/system_info');
        const result = await response.json();
        
        if (result.status === 'success') {
            const info = result.data;
            const infoText = `系统信息:
Proot 可用: ${info.proot_available ? '是' : '否'}
环境数量: ${info.environments_count}
用户数量: ${info.users_count}
终端可用: ${info.terminal_available ? '是' : '否'}`;
            
            showMessage(infoText, 'info');
        }
    } catch (error) {
        showMessage('获取系统信息失败: ' + error.message, 'error');
    }
}

// 点击模态框外部关闭
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        hideModals();
    }
});