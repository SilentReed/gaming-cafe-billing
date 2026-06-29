# 🚀 部署指南

## 目录

1. [环境要求](#环境要求)
2. [Docker 部署](#docker-部署)
3. [手动部署](#手动部署)
4. [Nginx 反向代理](#nginx-反向代理)
5. [SSL 证书配置](#ssl-证书配置)
6. [生产环境优化](#生产环境优化)
7. [故障排除](#故障排除)

---

## 环境要求

### 最低配置
- CPU: 1 核
- 内存: 512MB
- 磁盘: 1GB
- Python: 3.9+

### 推荐配置
- CPU: 2 核
- 内存: 1GB
- 磁盘: 10GB
- Python: 3.11+

---

## Docker 部署

### 1. 安装 Docker

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# CentOS
yum install -y docker
systemctl start docker
systemctl enable docker
```

### 2. 安装 Docker Compose

```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 3. 部署项目

```bash
# 克隆代码
git clone https://github.com/SilentReed/gaming-cafe-billing.git
cd gaming-cafe-billing

# 创建环境配置
cp .env.example .env

# 编辑 .env 文件
nano .env
```

**.env 配置说明：**

```bash
# 必须修改：生成随机密钥
SECRET_KEY=your-random-secret-key-here

# 数据库路径（Docker 内部）
DATABASE_URL=sqlite:///./gaming_cafe.db

# 调试模式（生产环境设为 false）
DEBUG=false
```

**生成随机密钥：**

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 4. 启动服务

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart
```

### 5. 访问系统

- 本地访问：`http://localhost:8000`
- 局域网访问：`http://服务器IP:8000`

### 6. 数据持久化

Docker 部署时，数据存储在 Docker Volume 中：

```bash
# 查看 Volume
docker volume ls

# 备份数据
docker run --rm -v gaming-cafe-billing_app-data:/data -v $(pwd)/backup:/backup alpine tar czf /backup/data.tar.gz -C /data .

# 恢复数据
docker run --rm -v gaming-cafe-billing_app-data:/data -v $(pwd)/backup:/backup alpine tar xzf /backup/data.tar.gz -C /data
```

---

## 手动部署

### 1. 安装系统依赖

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y python3 python3-pip python3-venv git

# CentOS
sudo yum install -y python3 python3-pip git
```

### 2. 克隆代码

```bash
git clone https://github.com/SilentReed/gaming-cafe-billing.git
cd gaming-cafe-billing/backend
```

### 3. 创建虚拟环境

```bash
python3 -m venv venv
source venv/bin/activate
```

### 4. 安装依赖

```bash
pip install -r requirements.txt
```

### 5. 配置环境变量

```bash
# 创建 .env 文件
cat > .env << EOF
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
DATABASE_URL=sqlite:///./gaming_cafe.db
DEBUG=false
EOF
```

### 6. 初始化数据库

```bash
python init_db.py
```

### 7. 启动服务

```bash
# 开发模式
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 生产模式
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### 8. 设置 systemd 服务（可选）

```bash
sudo tee /etc/systemd/system/gaming-cafe.service << EOF
[Unit]
Description=Gaming Cafe Billing System
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/gaming-cafe-billing/backend
Environment="PATH=/path/to/gaming-cafe-billing/backend/venv/bin"
ExecStart=/path/to/gaming-cafe-billing/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable gaming-cafe
sudo systemctl start gaming-cafe
```

---

## Nginx 反向代理

### 1. 安装 Nginx

```bash
# Ubuntu/Debian
sudo apt install -y nginx

# CentOS
sudo yum install -y nginx
```

### 2. 配置 Nginx

```bash
sudo tee /etc/nginx/sites-available/gaming-cafe << 'EOF'
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书（见下文配置）
    ssl_certificate /etc/nginx/ssl/your-domain.com.crt;
    ssl_certificate_key /etc/nginx/ssl/your-domain.com.key;
    
    # SSL 优化
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 安全头
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # 主应用
    location /cafe/ {
        rewrite ^/cafe/(.*) /$1 break;
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }

    # WebSocket 支持
    location /cafe/ws/ {
        rewrite ^/cafe/(.*) /$1 break;
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
EOF
```

### 3. 启用配置

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/gaming-cafe /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

---

## SSL 证书配置

### 方式一：Let's Encrypt（免费）

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 申请证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

### 方式二：阿里云 SSL 证书

```bash
# 安装 acme.sh
curl https://get.acme.sh | sh

# 配置阿里云 DNS
export Ali_Key="your-access-key"
export Ali_Secret="your-access-secret"

# 申请证书
~/.acme.sh/acme.sh --issue -d your-domain.com --dns dns_ali

# 安装证书
~/.acme.sh/acme.sh --install-cert -d your-domain.com \
    --key-file /etc/nginx/ssl/your-domain.com.key \
    --fullchain-file /etc/nginx/ssl/your-domain.com.crt \
    --reloadcmd "systemctl reload nginx"
```

---

## 生产环境优化

### 1. 数据库优化

对于高并发场景，建议使用 PostgreSQL：

```bash
# 安装 PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# 创建数据库
sudo -u postgres psql
CREATE DATABASE gaming_cafe;
CREATE USER cafe_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE gaming_cafe TO cafe_user;
\q

# 修改 .env
DATABASE_URL=postgresql://cafe_user:your_password@localhost/gaming_cafe
```

### 2. 使用 Gunicorn

```bash
pip install gunicorn

# 启动
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

### 3. 配置缓存（可选）

```bash
# 安装 Redis
sudo apt install -y redis-server

# 修改 .env
REDIS_URL=redis://localhost:6379/0
```

### 4. 日志配置

```bash
# 创建日志目录
sudo mkdir -p /var/log/gaming-cafe
sudo chown www-data:www-data /var/log/gaming-cafe

# 配置 logrotate
sudo tee /etc/logrotate.d/gaming-cafe << EOF
/var/log/gaming-cafe/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        systemctl reload gaming-cafe
    endscript
}
EOF
```

---

## 故障排除

### 问题：端口被占用

```bash
# 查看端口占用
sudo lsof -i :8000

# 杀死进程
sudo kill -9 <PID>
```

### 问题：数据库锁定

```bash
# 检查数据库文件
ls -la backend/gaming_cafe.db*

# 删除临时文件
rm -f backend/gaming_cafe.db-shm backend/gaming_cafe.db-wal

# 重启服务
sudo systemctl restart gaming-cafe
```

### 问题：权限错误

```bash
# 修复权限
sudo chown -R www-data:www-data /path/to/gaming-cafe-billing
sudo chmod -R 755 /path/to/gaming-cafe-billing
```

### 问题：Nginx 502 错误

```bash
# 检查后端服务
sudo systemctl status gaming-cafe

# 查看日志
sudo journalctl -u gaming-cafe -f

# 检查端口
sudo netstat -tlnp | grep 8000
```

### 问题：WebSocket 连接失败

确保 Nginx 配置包含 WebSocket 支持：

```nginx
location /cafe/ws/ {
    rewrite ^/cafe/(.*) /$1 break;
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;
}
```

---

## 性能监控

### 1. 系统监控

```bash
# 安装 htop
sudo apt install -y htop

# 查看资源使用
htop
```

### 2. 应用监控

```bash
# 查看服务状态
sudo systemctl status gaming-cafe

# 查看日志
sudo journalctl -u gaming-cafe -f

# 查看数据库大小
ls -lh backend/gaming_cafe.db
```

### 3. 健康检查

```bash
# API 健康检查
curl http://localhost:8000/health

# 检查响应时间
curl -o /dev/null -s -w "%{time_total}" http://localhost:8000/
```

---

## 更新升级

### Docker 部署更新

```bash
cd gaming-cafe-billing

# 拉取最新代码
git pull

# 重新构建并启动
docker-compose down
docker-compose up -d --build
```

### 手动部署更新

```bash
cd gaming-cafe-billing

# 拉取最新代码
git pull

# 激活虚拟环境
cd backend
source venv/bin/activate

# 更新依赖
pip install -r requirements.txt

# 重启服务
sudo systemctl restart gaming-cafe
```

---

## 备份策略

### 自动备份脚本

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/path/to/backup"
DATE=$(date +%Y%m%d_%H%M%S)
DB_PATH="/path/to/gaming-cafe-billing/backend/gaming_cafe.db"

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份数据库
cp $DB_PATH "$BACKUP_DIR/gaming_cafe_$DATE.db"

# 压缩备份
tar -czf "$BACKUP_DIR/backup_$DATE.tar.gz" -C $BACKUP_DIR "gaming_cafe_$DATE.db"

# 删除 30 天前的备份
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +30 -delete

echo "Backup completed: backup_$DATE.tar.gz"
```

### 设置定时备份

```bash
# 添加到 crontab
crontab -e

# 每天凌晨 3 点备份
0 3 * * * /path/to/backup.sh
```

---

## 安全建议

1. **修改默认密码**：首次部署后立即修改 admin 密码
2. **使用 HTTPS**：生产环境必须配置 SSL 证书
3. **限制访问**：使用防火墙限制端口访问
4. **定期备份**：设置自动备份策略
5. **更新依赖**：定期更新 Python 依赖包
6. **监控日志**：定期检查系统日志

---

## 技术支持

- GitHub Issues: [提交问题](https://github.com/SilentReed/gaming-cafe-billing/issues)
- 文档: [查看文档](docs/)
