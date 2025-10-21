let currentTerminalId = null;

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
        if (!currentTerminalId) {
            startTerminal();
        }
    }
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
            updateUserInfo(result.data);
            showMessage('登录成功!', 'success');
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
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('authButtons').style.display = 'flex';
    showMessage('已退出登录', 'info');
}

function updateUserInfo(userData) {
    document.getElementById('username').textContent = userData.username;
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('authButtons').style.display = 'none';
}

// 代码运行
async function runCode() {
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

// 终端功能
async function startTerminal() {
    try {
        const response = await fetch('/api/terminal/start', {
            method: 'POST'
        });
        
        const result = await response.json();
        if (result.status === 'success') {
            currentTerminalId = result.terminal_id;
            document.getElementById('terminal-output').innerHTML = '终端已启动<br>> ';
        } else {
            showMessage('终端启动失败: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('终端启动错误: ' + error.message, 'error');
    }
}

async function sendTerminalCommand() {
    const input = document.getElementById('terminal-input');
    const command = input.value.trim();
    
    if (!command) return;
    
    if (!currentTerminalId) {
        await startTerminal();
    }
    
    try {
        const response = await fetch('/api/terminal/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ command })
        });
        
        const result = await response.json();
        const terminalOutput = document.getElementById('terminal-output');
        
        terminalOutput.innerHTML += command + '<br>';
        if (result.status === 'success') {
            terminalOutput.innerHTML += result.output + '<br>> ';
        } else {
            terminalOutput.innerHTML += '错误: ' + result.message + '<br>> ';
        }
        
        input.value = '';
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    } catch (error) {
        showMessage('终端命令执行错误: ' + error.message, 'error');
    }
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

// 页面加载时恢复保存的代码
window.addEventListener('load', () => {
    const savedCode = localStorage.getItem('rust_code');
    if (savedCode) {
        document.getElementById('editor').value = savedCode;
    }
    
    // 点击模态框外部关闭
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            hideModals();
        }
    });
});