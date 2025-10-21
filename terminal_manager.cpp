#include "terminal_manager.h"
#include <fcntl.h>
#include <unistd.h>
#include <stdlib.h>
#include <pty.h>
#include <utmp.h>
#include <signal.h>
#include <sys/wait.h>
#include <sys/select.h>
#include <cstring>
#include <sstream>
#include <iostream>

TerminalManager& TerminalManager::getInstance() {
    static TerminalManager instance;
    return instance;
}

TerminalManager::~TerminalManager() {
    std::lock_guard<std::mutex> lock(mutex_);
    for (auto& [id, session] : sessions_) {
        if (session && session->active) {
            closeSession(id);
        }
    }
}

std::string TerminalManager::createSession(const std::string& workspace) {
    std::lock_guard<std::mutex> lock(mutex_);
    
    auto session = std::make_unique<TerminalSession>();
    session->workspace = workspace;
    session->active = false;
    
    if (!createPty(*session)) {
        return "";
    }
    
    if (!spawnShell(*session, workspace)) {
        close(session->master_fd);
        close(session->slave_fd);
        return "";
    }
    
    session->active = true;
    std::string session_id = std::to_string(reinterpret_cast<uintptr_t>(session.get()));
    
    sessions_[session_id] = std::move(session);
    return session_id;
}

bool TerminalManager::createPty(TerminalSession& session) {
    int master, slave;
    char name[100];
    
    if (openpty(&master, &slave, name, nullptr, nullptr) == -1) {
        return false;
    }
    
    session.master_fd = master;
    session.slave_fd = slave;
    
    int flags = fcntl(master, F_GETFL, 0);
    fcntl(master, F_SETFL, flags | O_NONBLOCK);
    
    return true;
}

bool TerminalManager::spawnShell(TerminalSession& session, const std::string& workspace) {
    pid_t pid = fork();
    
    if (pid == -1) {
        return false;
    }
    
    if (pid == 0) {
        // 子进程
        close(session.master_fd);
        
        // 设置工作目录
        if (chdir(workspace.c_str()) == -1) {
            // 如果设置工作目录失败，使用home目录
            chdir(getenv("HOME"));
        }
        
        setenv("TERM", "xterm-256color", 1);
        setenv("PWD", workspace.c_str(), 1);
        
        // 成为会话组长
        setsid();
        
        // 将 slave PTY 设置为控制终端
        ioctl(session.slave_fd, TIOCSCTTY, 1);
        
        // 重定向标准输入输出错误到 PTY
        dup2(session.slave_fd, STDIN_FILENO);
        dup2(session.slave_fd, STDOUT_FILENO);
        dup2(session.slave_fd, STDERR_FILENO);
        
        // 关闭 slave_fd
        close(session.slave_fd);
        
        // 在Termux中使用sh而不是bash
        execlp("sh", "sh", nullptr);
        
        // 如果 execlp 失败
        exit(1);
    } else {
        // 父进程
        close(session.slave_fd);
        session.child_pid = pid;
        
        // 启动输出读取线程
        startOutputReader(session);
        
        return true;
    }
}

void TerminalManager::startOutputReader(TerminalSession& session) {
    session.read_thread = std::thread([&session]() {
        char buffer[1024];
        fd_set read_fds;
        
        while (session.active) {
            FD_ZERO(&read_fds);
            FD_SET(session.master_fd, &read_fds);
            
            struct timeval timeout = {0, 100000}; // 100ms
            
            int result = select(session.master_fd + 1, &read_fds, nullptr, nullptr, &timeout);
            
            if (result > 0 && FD_ISSET(session.master_fd, &read_fds)) {
                ssize_t bytes_read = read(session.master_fd, buffer, sizeof(buffer) - 1);
                if (bytes_read > 0) {
                    buffer[bytes_read] = '\0';
                    // 这里可以添加输出处理逻辑
                } else if (bytes_read == 0) {
                    break; // EOF
                }
            }
        }
    });
}

bool TerminalManager::executeCommand(const std::string& session_id, const std::string& command, std::string& output) {
    std::lock_guard<std::mutex> lock(mutex_);
    
    auto it = sessions_.find(session_id);
    if (it == sessions_.end() || !it->second->active) {
        return false;
    }
    
    TerminalSession& session = *it->second;
    std::string full_command = command + "\n";
    
    ssize_t written = write(session.master_fd, full_command.c_str(), full_command.length());
    if (written != static_cast<ssize_t>(full_command.length())) {
        return false;
    }
    
    // 简单实现：读取一些输出
    char buffer[4096];
    fd_set read_fds;
    FD_ZERO(&read_fds);
    FD_SET(session.master_fd, &read_fds);
    
    struct timeval timeout = {1, 0}; // 1秒超时
    if (select(session.master_fd + 1, &read_fds, nullptr, nullptr, &timeout) > 0) {
        ssize_t bytes_read = read(session.master_fd, buffer, sizeof(buffer) - 1);
        if (bytes_read > 0) {
            buffer[bytes_read] = '\0';
            output = buffer;
        }
    }
    
    return true;
}

std::string TerminalManager::readOutput(const std::string& session_id, size_t max_bytes) {
    std::lock_guard<std::mutex> lock(mutex_);
    
    auto it = sessions_.find(session_id);
    if (it == sessions_.end() || !it->second->active) {
        return "";
    }
    
    TerminalSession& session = *it->second;
    std::string output;
    char buffer[1024];
    
    fd_set read_fds;
    FD_ZERO(&read_fds);
    FD_SET(session.master_fd, &read_fds);
    
    struct timeval timeout = {0, 0}; // 非阻塞
    
    while (select(session.master_fd + 1, &read_fds, nullptr, nullptr, &timeout) > 0) {
        ssize_t bytes_read = read(session.master_fd, buffer, sizeof(buffer) - 1);
        if (bytes_read > 0) {
            buffer[bytes_read] = '\0';
            output.append(buffer);
            if (output.length() >= max_bytes) {
                break;
            }
        } else {
            break;
        }
    }
    
    return output;
}

bool TerminalManager::closeSession(const std::string& session_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    
    auto it = sessions_.find(session_id);
    if (it == sessions_.end()) {
        return false;
    }
    
    TerminalSession& session = *it->second;
    session.active = false;
    
    // 杀死子进程
    if (session.child_pid > 0) {
        kill(session.child_pid, SIGTERM);
        waitpid(session.child_pid, nullptr, 0);
    }
    
    // 关闭文件描述符
    close(session.master_fd);
    
    // 等待读取线程结束
    if (session.read_thread.joinable()) {
        session.read_thread.join();
    }
    
    sessions_.erase(it);
    return true;
}

// C 接口实现
extern "C" {
    const char* start_terminal_session(const char* workspace) {
        static thread_local std::string session_id;
        session_id = TerminalManager::getInstance().createSession(workspace);
        return session_id.empty() ? nullptr : session_id.c_str();
    }
    
    int execute_terminal_command(const char* session_id, const char* command, char* output, size_t output_size) {
        std::string result;
        bool success = TerminalManager::getInstance().executeCommand(session_id, command, result);
        
        if (success && output && output_size > 0) {
            strncpy(output, result.c_str(), output_size - 1);
            output[output_size - 1] = '\0';
            return 0;
        }
        
        return -1;
    }
    
    int close_terminal_session(const char* session_id) {
        return TerminalManager::getInstance().closeSession(session_id) ? 0 : -1;
    }
}