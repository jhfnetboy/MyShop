#!/bin/bash
# start.sh - 启动 EchoRank AI Backend 服务

echo "=================================="
echo "EchoRank AI Backend Service"
echo "=================================="
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# 优先使用 Conda 环境 (echorank_v2)
CONDA_PYTHON="/usr/local/Caskroom/miniconda/base/envs/echorank_v2/bin/python"
if [ -x "$CONDA_PYTHON" ]; then
    echo "Using dedicated Conda environment: echorank_v2"
    PYTHON_CMD="$CONDA_PYTHON"
else
    # 尝试激活本地虚拟环境
    if [ -d ".venv" ]; then
        echo "Activating local virtual environment..."
        source .venv/bin/activate
        PYTHON_CMD="python3"
    else
        PYTHON_CMD="python3"
    fi
fi

# 检查 Python 版本
$PYTHON_CMD --version

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found!"
    # 自动从父目录或示例文件尝试
    if [ -f "../../.env" ]; then
        cp "../../.env" .env
        echo "Copied .env from root"
    fi
fi

# 检查依赖 (如果不是用 Conda，可能需要安装)
if [[ "$PYTHON_CMD" != "$CONDA_PYTHON" ]]; then
    echo "Checking dependencies..."
    if ! $PYTHON_CMD -c "import fastapi" 2>/dev/null; then
        echo "Installing missing dependencies..."
        $PYTHON_CMD -m pip install -r requirements.txt
    fi
fi

# 启动服务
echo ""
echo "Starting service..."
echo "API will be available at: http://localhost:8001"
echo ""

$PYTHON_CMD app.py