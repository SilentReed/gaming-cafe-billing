# 🎮 游戏主机计费管理系统

多商户游戏主机计费管理平台，支持网吧、游戏馆、电竞酒店等场景。

## ✨ 核心功能

### 平台管理（超管）
- 📊 平台概览 - 商户统计、用户统计
- 🏢 商户管理 - 创建/编辑/禁用商户、管理登录账户
- 🧩 功能配置 - 控制商户可用功能模块
- ⏰ 授权期限 - 设置商户授权到期时间

### 店铺管理（商户/员工）
- 🎮 收银台 - 主机状态、快速开台/结账
- 📋 计费大厅 - 实时计时、暂停/恢复
- 👥 会员管理 - 充值、积分、等级
- 📄 账单记录 - 消费明细、结账
- 📦 时段套餐 - 包时套餐管理
- ☕ 餐饮商品 - 商品销售
- 📊 报表统计 - 营业分析
- 🔄 交班管理 - 班次交接
- 👤 员工管理 - 账户管理

## 🚀 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 克隆代码
git clone https://github.com/SilentReed/gaming-cafe-billing.git
cd gaming-cafe-billing

# 创建环境配置
cp .env.example .env
# 编辑 .env 设置 SECRET_KEY

# 启动服务
docker-compose up -d

# 访问 http://localhost:8000
```

### 方式二：手动部署

#### 环境要求
- Python 3.9+
- Node.js 14+（可选，用于前端开发）

#### 后端部署

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 初始化数据库
python init_db.py

# 启动服务
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

#### 前端部署

前端为纯静态文件，无需构建，直接由后端服务托管。

### 方式三：Nginx 反向代理

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /cafe/ {
        rewrite ^/cafe/(.*) /$1 break;
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket 支持
    location /cafe/ws/ {
        rewrite ^/cafe/(.*) /$1 break;
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

## 📁 项目结构

```
gaming-cafe-billing/
├── backend/
│   ├── app/
│   │   ├── models/          # 数据模型
│   │   ├── routers/         # API 路由
│   │   ├── schemas/         # Pydantic 模型
│   │   ├── services/        # 业务逻辑
│   │   ├── utils/           # 工具函数
│   │   ├── main.py          # 应用入口
│   │   ├── deps.py          # 依赖注入
│   │   ├── config.py        # 配置
│   │   └── database.py      # 数据库
│   ├── tests/               # 测试用例
│   ├── requirements.txt     # Python 依赖
│   └── init_db.py           # 数据库初始化
├── frontend/
│   ├── css/                 # 样式文件
│   ├── js/
│   │   ├── app.js           # 主应用逻辑
│   │   ├── components/      # 通用组件
│   │   └── pages/           # 页面模块
│   └── index.html           # 入口页面
├── docker-compose.yml       # Docker 编排
├── Dockerfile               # Docker 镜像
└── .env.example             # 环境变量示例
```

## 🔐 默认账户

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 超级管理员 | admin | admin123 |

> ⚠️ 首次部署后请立即修改默认密码！

## 📡 API 文档

启动服务后访问：
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## 🛠️ 配置说明

### 环境变量（.env）

```bash
# 密钥（必须修改）
SECRET_KEY=your-secret-key-here

# 数据库
DATABASE_URL=sqlite:///./gaming_cafe.db

# 其他可选
DEBUG=false
```

### 计费配置

在商户管理中可配置：
- 默认费率（元/小时）
- 最低计费时长
- 取整规则
- 免费时长

## 🧪 测试

```bash
cd backend
python -m pytest tests/ -v
```

## 📦 技术栈

- **后端**: FastAPI + SQLAlchemy + SQLite
- **前端**: 原生 HTML/CSS/JavaScript
- **实时通信**: WebSocket
- **部署**: Docker / Nginx

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 联系方式

- GitHub: [SilentReed](https://github.com/SilentReed)
