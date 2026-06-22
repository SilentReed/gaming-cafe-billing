#!/bin/bash
# 游戏主机计费系统 - 启动脚本
# 后端API: http://localhost:8000
# 前端界面: http://localhost:8080

cd "$(dirname "$0")"

echo "检查依赖..."
pip install -q -r backend/requirements.txt 2>/dev/null

if [ ! -f backend/gaming_cafe.db ]; then
    echo "初始化数据库..."
    cd backend && python init_db.py && cd ..
fi

echo "启动后端 API → http://localhost:8000"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo "启动前端 → http://localhost:8080"
cd frontend && python -m http.server 8080 &
FRONTEND_PID=$!

echo ""
echo "========================================="
echo "  游戏主机计费系统已启动"
echo "  前端界面: http://localhost:8080"
echo "  API文档:  http://localhost:8000/docs"
echo "  默认账号: admin / admin123"
echo "========================================="
echo ""
echo "按 Ctrl+C 停止所有服务"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
