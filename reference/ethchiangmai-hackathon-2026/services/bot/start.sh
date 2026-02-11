#!/bin/bash
# start.sh - 启动 EchoRank Bot 服务

echo "=================================="
echo "EchoRank Bot Service"
echo "=================================="
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 1. 清理已有的 Bot 进程 (Kill existing instances)
echo "Cleaning up existing bot processes..."
pkill -f "python.*bot.py"
sleep 1

# 2. 检查环境
if [ -d ".venv" ]; then
    echo "Activating local virtual environment..."
    source .venv/bin/activate
    PYTHON_CMD="python3"
else
    PYTHON_CMD="python3"
fi

# 3. 启动服务
echo "Starting bot service..."
# 我们使用 nohup 并在后台运行，同时将日志定向到 bot_service.log
nohup $PYTHON_CMD bot.py > bot_service.log 2>&1 &

# 获取新 PID
NEW_PID=$!
echo "✅ Bot started with PID: $NEW_PID"
echo "Logs are being written to bot_service.log"
echo "=================================="
