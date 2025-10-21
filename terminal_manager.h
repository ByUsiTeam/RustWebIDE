#ifndef TERMINAL_MANAGER_H
#define TERMINAL_MANAGER_H

#include <string>
#include <unordered_map>
#include <memory>
#include <mutex>
#include <thread>
#include <atomic>

struct TerminalSession {
    int master_fd;
    int slave_fd;
    pid_t child_pid;
    std::string workspace;
    std::atomic<bool> active;
    std::thread read_thread;
};

class TerminalManager {
public:
    static TerminalManager& getInstance();
    
    std::string createSession(const std::string& workspace);
    bool executeCommand(const std::string& session_id, const std::string& command, std::string& output);
    bool closeSession(const std::string& session_id);
    std::string readOutput(const std::string& session_id, size_t max_bytes = 4096);
    
private:
    TerminalManager() = default;
    ~TerminalManager();
    
    std::unordered_map<std::string, std::unique_ptr<TerminalSession>> sessions_;
    std::mutex mutex_;
    
    bool createPty(TerminalSession& session);
    bool spawnShell(TerminalSession& session, const std::string& workspace);
    void startOutputReader(TerminalSession& session);
};

extern "C" {
    const char* start_terminal_session(const char* workspace);
    int execute_terminal_command(const char* session_id, const char* command, char* output, size_t output_size);
    int close_terminal_session(const char* session_id);
}

#endif