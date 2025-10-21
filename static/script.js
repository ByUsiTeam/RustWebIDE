// VSCode风格 Rust Web IDE JavaScript
let currentTerminalId = null;
let socket = null;
let isAuthenticated = false;
let currentUser = null;
let currentFile = null;
let fileTreeData = null;
let openTabs = [];
let activeTab = null;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    checkAuthStatus();
    initSocketIO();
    setupEventListeners();
    
    // 检查环境初始化状态
    setTimeout(() => {
        if (isAuthenticated) {
            checkEnvironmentInitialization();
        }
    }, 1000);
}

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
            
            // 检查环境初始化状态
            if (!result.environment_initialized) {
                setTimeout(() => {
                    showInitializationPrompt();
                }, 2000);
            }
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
        updateConnectionStatus('connected');
    });
    
    socket.on('terminal_output', function(data) {
        const terminalContent = document.getElementById('terminal-content');
        if (terminalContent) {
            terminalContent.innerHTML += data.output;
            terminalContent.scrollTop = terminalContent.scrollHeight;
        }
    });
    
    socket.on('terminal_started', function(data) {
        currentTerminalId = data.terminal_id;
        console.log('Terminal started:', currentTerminalId);
    });
    
    // 环境初始化状态事件
    socket.on('initialization_status', function(data) {
        console.log('Environment initialization status:', data);
    });
    
    // 初始化进度事件
    socket.on('initialization_progress', function(data) {
        console.log('Initialization progress:', data);
        updateInitializationProgress(data);
    });
    
    socket.on('disconnect', function() {
        console.log('WebSocket disconnected');
        updateConnectionStatus('disconnected');
        showMessage('连接断开，正在重连...', 'info');
    });
    
    socket.on('reconnect', function() {
        updateConnectionStatus('connected');
        showMessage('连接已恢复', 'success');
    });
}

// 更新连接状态
function updateConnectionStatus(status) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.className = `connection-status ${status}`;
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 认证相关
    document.getElementById('login-btn').addEventListener('click', showLogin);
    document.getElementById('register-btn').addEventListener('click', showRegister);
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('system-info-btn').addEventListener('click', showSystemInfo);
    
    // 编辑器相关
    document.getElementById('run-btn').addEventListener('click', runCode);
    document.getElementById('save-btn').addEventListener('click', saveFile);
    
    // 终端相关
    document.getElementById('terminal-input').addEventListener('keypress', handleTerminalInput);
    document.getElementById('terminal-send').addEventListener('click', sendTerminalCommand);
    
    // 文件树相关
    document.getElementById('file-tree').addEventListener('click', handleFileTreeClick);
    document.getElementById('file-tree').addEventListener('contextmenu', handleFileTreeContextMenu);
    
    // 侧边栏相关
    document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);
    document.getElementById('refresh-tree').addEventListener('click', loadFileTree);
    
    // 移动端菜单
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    }
    
    // 右键菜单
    document.addEventListener('click', function() {
        hideContextMenu();
    });
    
    // 模态框关闭
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            hideModals();
        }
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
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

// 切换侧边栏
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
}

// 切换移动端菜单
function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
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
            
            // 检查环境初始化
            setTimeout(() => {
                checkEnvironmentInitialization();
            }, 1000);
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
    openTabs = [];
    activeTab = null;
    
    // 更新UI
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('authButtons').style.display = 'flex';
    
    // 清空文件树和编辑器
    document.getElementById('file-tree').innerHTML = '';
    document.getElementById('editor').value = '';
    updateTabs();
    
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
            showMessage('加载文件树失败: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('加载文件树错误:', error);
        showMessage('加载文件树错误: ' + error.message, 'error');
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
        itemElement.dataset.name = item.name;
        
        const isExpanded = localStorage.getItem(`expanded_${item.path}`) === 'true';
        
        const icon = item.type === 'directory' ? 
            (isExpanded ? '📂' : '📁') : 
            getFileIcon(item.extension);
        
        itemElement.innerHTML = `
            <div class="file-item-content" style="padding-left: ${level * 16 + 8}px">
                <span class="file-icon">${icon}</span>
                <span class="file-name">${item.name}</span>
            </div>
            ${item.type === 'directory' && item.children && item.children.length > 0 ? 
                `<div class="file-tree-children ${isExpanded ? 'expanded' : ''}"></div>` : ''}
        `;
        
        fileTree.appendChild(itemElement);
        
        // 如果是目录且有子项，递归渲染
        if (item.type === 'directory' && item.children && item.children.length > 0) {
            const childrenContainer = itemElement.querySelector('.file-tree-children');
            if (isExpanded) {
                renderFileTree(item, childrenContainer, level + 1);
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
    const name = item.dataset.name;
    
    if (type === 'directory') {
        // 切换目录展开状态
        toggleDirectory(item, path);
    } else {
        // 打开文件
        openFile(path, name);
    }
}

function toggleDirectory(item, path) {
    const children = item.querySelector('.file-tree-children');
    if (!children) return;
    
    const wasExpanded = children.classList.contains('expanded');
    
    if (wasExpanded) {
        children.classList.remove('expanded');
        localStorage.setItem(`expanded_${path}`, 'false');
    } else {
        children.classList.add('expanded');
        localStorage.setItem(`expanded_${path}`, 'true');
        
        // 如果子项还没有渲染，现在渲染
        if (children.children.length === 0) {
            // 这里需要从 fileTreeData 中找到对应的目录数据
            // 简化实现：重新加载整个文件树
            loadFileTree();
        }
    }
    
    // 更新图标
    const icon = item.querySelector('.file-icon');
    if (icon) {
        icon.textContent = wasExpanded ? '📁' : '📂';
    }
}

async function openFile(filePath, fileName) {
    try {
        const response = await fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            // 添加到标签页
            addTab(filePath, fileName, result.content);
            showMessage(`已打开文件: ${fileName}`, 'success');
        } else {
            showMessage('打开文件失败: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('打开文件错误: ' + error.message, 'error');
    }
}

// 标签页管理
function addTab(filePath, fileName, content) {
    // 检查是否已经打开
    const existingTab = openTabs.find(tab => tab.path === filePath);
    if (existingTab) {
        switchToTab(existingTab.id);
        return;
    }
    
    const tabId = 'tab-' + Date.now();
    const tab = {
        id: tabId,
        path: filePath,
        name: fileName,
        content: content,
        modified: false
    };
    
    openTabs.push(tab);
    updateTabs();
    switchToTab(tabId);
}

function updateTabs() {
    const tabsContainer = document.getElementById('editor-tabs');
    tabsContainer.innerHTML = '';
    
    openTabs.forEach(tab => {
        const tabElement = document.createElement('button');
        tabElement.className = `editor-tab ${tab.id === activeTab ? 'active' : ''}`;
        tabElement.dataset.tabId = tab.id;
        
        tabElement.innerHTML = `
            <span>${tab.name}${tab.modified ? ' •' : ''}</span>
            <button class="tab-close" data-tab-id="${tab.id}">×</button>
        `;
        
        tabElement.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close')) {
                switchToTab(tab.id);
            }
        });
        
        const closeBtn = tabElement.querySelector('.tab-close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(tab.id);
        });
        
        tabsContainer.appendChild(tabElement);
    });
    
    // 更新编辑器内容
    updateEditorContent();
}

function switchToTab(tabId) {
    activeTab = tabId;
    updateTabs();
    
    const tab = openTabs.find(t => t.id === tabId);
    if (tab) {
        document.getElementById('editor').value = tab.content;
        currentFile = tab.path;
        updateEditorTitle(tab.name);
    }
}

function closeTab(tabId) {
    const tabIndex = openTabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;
    
    const tab = openTabs[tabIndex];
    
    // 检查是否有未保存的更改
    if (tab.modified) {
        if (!confirm(`文件 "${tab.name}" 有未保存的更改，确定要关闭吗？`)) {
            return;
        }
    }
    
    openTabs.splice(tabIndex, 1);
    
    if (activeTab === tabId) {
        if (openTabs.length > 0) {
            activeTab = openTabs[Math.max(0, tabIndex - 1)].id;
        } else {
            activeTab = null;
            currentFile = null;
            document.getElementById('editor').value = '';
            updateEditorTitle('');
        }
    }
    
    updateTabs();
}

function updateEditorContent() {
    const editor = document.getElementById('editor');
    const tab = openTabs.find(t => t.id === activeTab);
    
    if (tab) {
        editor.value = tab.content;
        editor.disabled = false;
    } else {
        editor.value = '';
        editor.disabled = true;
    }
}

function updateEditorTitle(fileName) {
    const title = document.getElementById('editor-title');
    if (title) {
        title.textContent = fileName || '无文件打开';
    }
}

// 标记标签页为已修改
function markTabModified(tabId, modified = true) {
    const tab = openTabs.find(t => t.id === tabId);
    if (tab) {
        tab.modified = modified;
        updateTabs();
    }
}

// 编辑器内容变化监听
document.getElementById('editor').addEventListener('input', function() {
    if (activeTab) {
        const tab = openTabs.find(t => t.id === activeTab);
        if (tab && tab.content !== this.value) {
            tab.content = this.value;
            markTabModified(activeTab, true);
        }
    }
});

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
    const oldName = contextMenuTarget.dataset.name;
    
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
            
            // 如果重命名的是当前打开的文件，更新标签页
            const tab = openTabs.find(t => t.path === oldPath);
            if (tab) {
                tab.path = newPath;
                tab.name = newName;
                updateTabs();
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
    const name = contextMenuTarget.dataset.name;
    
    if (!confirm(`确定要删除${type === 'directory' ? '文件夹' : '文件'} "${name}" 吗？`)) {
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
            
            // 如果删除的是当前打开的文件，关闭标签页
            const tabIndex = openTabs.findIndex(t => t.path === path);
            if (tabIndex !== -1) {
                openTabs.splice(tabIndex, 1);
                if (activeTab === openTabs[tabIndex]?.id) {
                    activeTab = openTabs.length > 0 ? openTabs[0].id : null;
                }
                updateTabs();
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
        
        // 显示输出在终端区域
        const terminalContent = document.getElementById('terminal-content');
        if (terminalContent) {
            terminalContent.innerHTML += `\n运行结果:\n${output}\n$ `;
            terminalContent.scrollTop = terminalContent.scrollHeight;
        }
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
            
            // 标记标签页为未修改
            if (activeTab) {
                markTabModified(activeTab, false);
            }
        } else {
            showMessage('文件保存失败: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('保存文件错误: ' + error.message, 'error');
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
    
    // 如果没有启动终端，先启动
    if (!currentTerminalId) {
        socket.emit('start_terminal');
        // 等待终端启动
        setTimeout(() => {
            socket.emit('terminal_input', { input: command });
        }, 500);
    } else {
        socket.emit('terminal_input', { input: command });
    }
    
    input.value = '';
}

function handleTerminalInput(event) {
    if (event.key === 'Enter') {
        sendTerminalCommand();
    }
}

// 环境初始化功能
function checkEnvironmentInitialization() {
    if (!isAuthenticated) return;
    
    // 通过 WebSocket 检查初始化状态
    if (socket && socket.connected) {
        socket.emit('check_initialization');
    }
}

// 显示初始化提示
function showInitializationPrompt() {
    // 创建初始化提示模态框
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'initializationModal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <h3>初始化 Debian 12 环境</h3>
            <div class="initialization-info">
                <p>检测到您的环境尚未初始化完整的 Debian 12 环境。</p>
                <p><strong>初始化将提供:</strong></p>
                <ul>
                    <li>完整的 Debian 12 Linux 环境</li>
                    <li>完整的 Rust 工具链</li>
                    <li>包管理器 (apt) 支持</li>
                    <li>完整的开发工具</li>
                </ul>
                <p><strong>注意:</strong> 初始化过程需要下载约 200MB 数据，可能需要几分钟时间。</p>
            </div>
            <div id="initialization-progress" style="display: none;">
                <div class="progress-bar">
                    <div id="initialization-progress-bar" class="progress-bar-fill" style="width: 0%"></div>
                </div>
                <div id="initialization-message">准备开始...</div>
                <div id="initialization-percent">0%</div>
            </div>
            <div class="form-actions">
                <button class="btn btn-primary" id="start-initialization">开始初始化</button>
                <button class="btn" id="skip-initialization">稍后再说</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 事件监听
    document.getElementById('start-initialization').addEventListener('click', startEnvironmentInitialization);
    document.getElementById('skip-initialization').addEventListener('click', function() {
        document.getElementById('initializationModal').remove();
    });
}

// 开始环境初始化
function startEnvironmentInitialization() {
    const startBtn = document.getElementById('start-initialization');
    const skipBtn = document.getElementById('skip-initialization');
    const progressDiv = document.getElementById('initialization-progress');
    
    // 显示进度条，隐藏按钮
    startBtn.style.display = 'none';
    skipBtn.style.display = 'none';
    progressDiv.style.display = 'block';
    
    // 通过 WebSocket 开始初始化
    if (socket && socket.connected) {
        socket.emit('start_initialization');
    } else {
        showMessage('WebSocket 连接未建立，无法开始初始化', 'error');
        // 重新显示按钮
        startBtn.style.display = 'inline-block';
        skipBtn.style.display = 'inline-block';
        progressDiv.style.display = 'none';
    }
}

// 更新初始化进度
function updateInitializationProgress(data) {
    const progressBar = document.getElementById('initialization-progress-bar');
    const messageDiv = document.getElementById('initialization-message');
    const percentDiv = document.getElementById('initialization-percent');
    const modal = document.getElementById('initializationModal');
    
    if (!progressBar || !messageDiv || !percentDiv) return;
    
    progressBar.style.width = data.percent + '%';
    messageDiv.textContent = data.message;
    percentDiv.textContent = data.percent + '%';
    
    // 根据阶段更新样式
    if (data.stage === 'error') {
        progressBar.style.backgroundColor = '#e74c3c';
        showMessage('初始化失败: ' + data.message, 'error');
        
        // 重新显示按钮
        const startBtn = document.getElementById('start-initialization');
        const skipBtn = document.getElementById('skip-initialization');
        if (startBtn && skipBtn) {
            startBtn.style.display = 'inline-block';
            skipBtn.style.display = 'inline-block';
            startBtn.textContent = '重试初始化';
        }
    } else if (data.stage === 'complete') {
        progressBar.style.backgroundColor = '#2ecc71';
        showMessage('Debian 12 环境初始化完成!', 'success');
        
        // 3秒后关闭模态框
        setTimeout(() => {
            if (modal) {
                modal.remove();
            }
        }, 3000);
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
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 5000);
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
已初始化环境: ${info.initialized_environments}
终端可用: ${info.terminal_available ? '是' : '否'}`;
            
            showMessage(infoText, 'info');
        }
    } catch (error) {
        showMessage('获取系统信息失败: ' + error.message, 'error');
    }
}