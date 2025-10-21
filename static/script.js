let currentTerminalId = null;
let socket = null;
let isAuthenticated = false;
let currentUser = null;
let currentFile = null;
let fileTreeData = null;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    loadSavedCode();
    initSocketIO();
    initFileExplorer();
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
            // 加载文件树
            loadFileTree();
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

// 文件浏览器初始化
function initFileExplorer() {
    // 文件浏览器事件监听
    document.getElementById('file-tree').addEventListener('click', handleFileTreeClick);
    document.getElementById('file-tree').addEventListener('contextmenu', handleFileTreeContextMenu);
    
    // 右键菜单事件
    document.addEventListener('click', function() {
        hideContextMenu();
    });
    
    // 新建文件/文件夹对话框事件
    document.getElementById('create-file-confirm').addEventListener('click', createNewFile);
    document.getElementById('create-folder-confirm').addEventListener('click', createNewFolder);
    document.getElementById('rename-confirm').addEventListener('click', renameItem);
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
    document.getElementById('create-file-modal').style.display = 'none';
    document.getElementById('create-folder-modal').style.display = 'none';
    document.getElementById('rename-modal').style.display = 'none';
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
            
            // 加载文件树
            loadFileTree();
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
    currentFile = null;
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('authButtons').style.display = 'flex';
    
    // 清空文件树
    document.getElementById('file-tree').innerHTML = '';
    
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

// 文件树操作
async function loadFileTree() {
    if (!isAuthenticated) return;
    
    try {
        const response = await fetch('/api/files/tree?path=/home/user');
        const result = await response.json();
        
        if (result.status === 'success') {
            fileTreeData = result.tree;
            renderFileTree(fileTreeData);
        } else {
            console.error('加载文件树失败:', result.message);
        }
    } catch (error) {
        console.error('加载文件树错误:', error);
    }
}

function renderFileTree(tree, container = null, level = 0) {
    const fileTree = container || document.getElementById('file-tree');
    
    if (!container) {
        fileTree.innerHTML = '';
    }
    
    if (!tree || !tree.children) return;
    
    tree.children.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'file-tree-item';
        itemElement.dataset.path = item.path;
        itemElement.dataset.type = item.type;
        
        const indent = ' '.repeat(level * 4);
        const icon = item.type === 'directory' ? 
            (item.expanded ? '📂' : '📁') : 
            getFileIcon(item.extension);
        
        itemElement.innerHTML = `
            <div class="file-item-content" style="padding-left: ${level * 15}px">
                <span class="file-icon">${icon}</span>
                <span class="file-name">${item.name}</span>
            </div>
        `;
        
        fileTree.appendChild(itemElement);
        
        // 如果是目录且有子项，递归渲染
        if (item.type === 'directory' && item.children && item.children.length > 0) {
            if (item.expanded) {
                renderFileTree(item, fileTree, level + 1);
            }
        }
    });
}

function getFileIcon(extension) {
    const iconMap = {
        '.rs': '🦀',
        '.toml': '⚙️',
        '.txt': '📄',
        '.md': '📝',
        '.json': '🔧',
        '.py': '🐍',
        '.js': '📜',
        '.html': '🌐',
        '.css': '🎨',
        '.sh': '💻',
        '.lock': '🔒'
    };
    
    return iconMap[extension] || '📄';
}

function handleFileTreeClick(event) {
    const itemContent = event.target.closest('.file-item-content');
    if (!itemContent) return;
    
    const item = itemContent.parentElement;
    const path = item.dataset.path;
    const type = item.dataset.type;
    
    if (type === 'directory') {
        // 切换目录展开状态
        toggleDirectory(item, path);
    } else {
        // 打开文件
        openFile(path);
    }
}

function toggleDirectory(item, path) {
    // 简单的展开/收起实现
    const wasExpanded = item.classList.contains('expanded');
    
    if (wasExpanded) {
        item.classList.remove('expanded');
        // 隐藏子项（简化实现）
        const children = item.parentElement.querySelectorAll(`.file-tree-item[data-path^="${path}/"]`);
        children.forEach(child => {
            if (child !== item) {
                child.style.display = 'none';
            }
        });
    } else {
        item.classList.add('expanded');
        // 显示子项（简化实现）
        const children = item.parentElement.querySelectorAll(`.file-tree-item[data-path^="${path}/"]`);
        children.forEach(child => {
            if (child !== item) {
                child.style.display = 'block';
            }
        });
    }
}

async function openFile(filePath) {
    try {
        const response = await fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            document.getElementById('editor').value = result.content;
            currentFile = filePath;
            updateEditorTitle(filePath);
            showMessage(`已打开文件: ${filePath}`, 'success');
        } else {
            showMessage('打开文件失败: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('打开文件错误: ' + error.message, 'error');
    }
}

function updateEditorTitle(filePath) {
    const title = document.querySelector('.code-editor h3');
    if (title && filePath) {
        const fileName = filePath.split('/').pop();
        title.textContent = `代码编辑器 - ${fileName}`;
    }
}

// 右键菜单功能
let contextMenuTarget = null;

function handleFileTreeContextMenu(event) {
    const item = event.target.closest('.file-tree-item');
    if (!item) return;
    
    event.preventDefault();
    contextMenuTarget = item;
    
    const contextMenu = document.getElementById('context-menu');
    contextMenu.style.display = 'block';
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    
    // 根据类型显示不同的菜单项
    const type = item.dataset.type;
    const newFileItem = document.querySelector('[data-action="new-file"]');
    const newFolderItem = document.querySelector('[data-action="new-folder"]');
    const renameItem = document.querySelector('[data-action="rename"]');
    const deleteItem = document.querySelector('[data-action="delete"]');
    
    if (type === 'directory') {
        newFileItem.style.display = 'block';
        newFolderItem.style.display = 'block';
    } else {
        newFileItem.style.display = 'none';
        newFolderItem.style.display = 'none';
    }
    
    renameItem.style.display = 'block';
    deleteItem.style.display = 'block';
}

function hideContextMenu() {
    document.getElementById('context-menu').style.display = 'none';
    contextMenuTarget = null;
}

// 上下文菜单操作
document.addEventListener('DOMContentLoaded', function() {
    const contextMenu = document.getElementById('context-menu');
    
    contextMenu.addEventListener('click', function(event) {
        const action = event.target.dataset.action;
        if (!action) return;
        
        switch (action) {
            case 'new-file':
                showCreateFileModal();
                break;
            case 'new-folder':
                showCreateFolderModal();
                break;
            case 'rename':
                showRenameModal();
                break;
            case 'delete':
                deleteItem();
                break;
        }
        
        hideContextMenu();
    });
});

function showCreateFileModal() {
    if (!contextMenuTarget) return;
    
    const basePath = contextMenuTarget.dataset.path;
    document.getElementById('new-file-path').value = basePath + '/';
    document.getElementById('new-file-name').value = '';
    document.getElementById('create-file-modal').style.display = 'flex';
}

function showCreateFolderModal() {
    if (!contextMenuTarget) return;
    
    const basePath = contextMenuTarget.dataset.path;
    document.getElementById('new-folder-path').value = basePath + '/';
    document.getElementById('new-folder-name').value = '';
    document.getElementById('create-folder-modal').style.display = 'flex';
}

function showRenameModal() {
    if (!contextMenuTarget) return;
    
    const oldPath = contextMenuTarget.dataset.path;
    const oldName = oldPath.split('/').pop();
    
    document.getElementById('rename-old-path').value = oldPath;
    document.getElementById('rename-new-name').value = oldName;
    document.getElementById('rename-modal').style.display = 'flex';
}

async function createNewFile() {
    const basePath = document.getElementById('new-file-path').value;
    const fileName = document.getElementById('new-file-name').value;
    
    if (!fileName) {
        showMessage('请输入文件名', 'error');
        return;
    }
    
    const filePath = basePath + fileName;
    
    try {
        const response = await fetch('/api/files/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: filePath,
                content: '// New file created\n'
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showMessage('文件创建成功', 'success');
            hideModals();
            loadFileTree(); // 刷新文件树
        } else {
            showMessage('文件创建失败: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('创建文件错误: ' + error.message, 'error');
    }
}

async function createNewFolder() {
    const basePath = document.getElementById('new-folder-path').value;
    const folderName = document.getElementById('new-folder-name').value;
    
    if (!folderName) {
        showMessage('请输入文件夹名', 'error');
        return;
    }
    
    const folderPath = basePath + folderName;
    
    try {
        const response = await fetch('/api/files/mkdir', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: folderPath
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showMessage('文件夹创建成功', 'success');
            hideModals();
            loadFileTree(); // 刷新文件树
        } else {
            showMessage('文件夹创建失败: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('创建文件夹错误: ' + error.message, 'error');
    }
}

async function renameItem() {
    const oldPath = document.getElementById('rename-old-path').value;
    const newName = document.getElementById('rename-new-name').value;
    
    if (!newName) {
        showMessage('请输入新名称', 'error');
        return;
    }
    
    const newPath = oldPath.split('/').slice(0, -1).join('/') + '/' + newName;
    
    try {
        const response = await fetch('/api/files/rename', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                old_path: oldPath,
                new_path: newPath
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showMessage('重命名成功', 'success');
            hideModals();
            loadFileTree(); // 刷新文件树
            
            // 如果重命名的是当前打开的文件，更新编辑器标题
            if (currentFile === oldPath) {
                currentFile = newPath;
                updateEditorTitle(newPath);
            }
        } else {
            showMessage('重命名失败: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('重命名错误: ' + error.message, 'error');
    }
}

async function deleteItem() {
    if (!contextMenuTarget) return;
    
    const path = contextMenuTarget.dataset.path;
    const type = contextMenuTarget.dataset.type;
    
    if (!confirm(`确定要删除${type === 'directory' ? '文件夹' : '文件'} "${path.split('/').pop()}" 吗？`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/files/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: path
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showMessage('删除成功', 'success');
            loadFileTree(); // 刷新文件树
            
            // 如果删除的是当前打开的文件，清空编辑器
            if (currentFile === path) {
                currentFile = null;
                document.getElementById('editor').value = '';
                updateEditorTitle('');
            }
        } else {
            showMessage('删除失败: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('删除错误: ' + error.message, 'error');
    }
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
    
    // 如果当前有打开的文件，保存文件
    if (currentFile) {
        await saveFile();
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

async function saveFile() {
    if (!currentFile) {
        showMessage('没有打开的文件', 'error');
        return;
    }
    
    const code = document.getElementById('editor').value;
    
    try {
        const response = await fetch('/api/files/write', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: currentFile,
                content: code
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showMessage('文件保存成功', 'success');
        } else {
            showMessage('文件保存失败: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('保存文件错误: ' + error.message, 'error');
    }
}

function saveCode() {
    if (currentFile) {
        saveFile();
    } else {
        const code = document.getElementById('editor').value;
        localStorage.setItem('rust_code', code);
        showMessage('代码已保存到本地', 'success');
    }
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