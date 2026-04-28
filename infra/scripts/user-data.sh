#!/bin/bash
set -euo pipefail

# =============================================================================
# Super Agent Platform - EC2 Bootstrap (Ubuntu 22.04 ARM64)
# Installs: Node.js 22, PostgreSQL client, Redis 7, Nginx, Claude Code CLI
# =============================================================================

export DEBIAN_FRONTEND=noninteractive

echo ">>> Updating system packages..."
apt-get update -y
apt-get upgrade -y

# LibreOffice (headless, for document conversion: pptx/docx/xlsx → PDF)
echo ">>> Installing LibreOffice..."
apt-get install -y libreoffice-core libreoffice-impress libreoffice-writer libreoffice-calc \
  fonts-noto-cjk fonts-wqy-zenhei

# Node.js 22
echo ">>> Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# PostgreSQL client
echo ">>> Installing PostgreSQL client..."
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
apt-get update -y
apt-get install -y postgresql-client-16

# AWS CLI
echo ">>> Installing AWS CLI..."
apt-get install -y unzip jq
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
/tmp/aws/install
rm -rf /tmp/aws /tmp/awscliv2.zip

# CloudWatch Agent
echo ">>> Installing CloudWatch Agent..."
curl -fsSL "https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/arm64/latest/amazon-cloudwatch-agent.deb" -o /tmp/cw-agent.deb
dpkg -i /tmp/cw-agent.deb
rm -f /tmp/cw-agent.deb

mkdir -p /opt/aws/amazon-cloudwatch-agent/etc
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'CW_CONFIG'
{
  "agent": { "run_as_user": "root", "region": "us-west-2" },
  "logs": { "logs_collected": { "files": { "collect_list": [
    { "file_path": "/opt/super-agent/logs/backend.log", "log_group_name": "/super-agent/backend", "log_stream_name": "{instance_id}/backend", "retention_in_days": 30 },
    { "file_path": "/opt/super-agent/logs/backend-error.log", "log_group_name": "/super-agent/backend-errors", "log_stream_name": "{instance_id}/backend-errors", "retention_in_days": 30 },
    { "file_path": "/var/log/nginx/access.log", "log_group_name": "/super-agent/nginx-access", "log_stream_name": "{instance_id}/nginx-access", "retention_in_days": 14 },
    { "file_path": "/var/log/nginx/error.log", "log_group_name": "/super-agent/nginx-errors", "log_stream_name": "{instance_id}/nginx-errors", "retention_in_days": 14 }
  ] } } }
}
CW_CONFIG

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s
systemctl enable amazon-cloudwatch-agent

# Redis 7
echo ">>> Installing Redis 7..."
curl -fsSL https://packages.redis.io/gpg | gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" > /etc/apt/sources.list.d/redis.list
apt-get update -y
apt-get install -y redis-server
# Local Redis kept as fallback — disabled when ElastiCache is configured.
# deploy.sh sets REDIS_HOST to the ElastiCache endpoint; the backend
# connects to whichever host is in .env.
sed -i 's/^# requirepass .*/requirepass super-agent-redis-password/' /etc/redis/redis.conf
sed -i 's/^requirepass .*/requirepass super-agent-redis-password/' /etc/redis/redis.conf
systemctl restart redis-server
systemctl enable redis-server

# Nginx
echo ">>> Installing Nginx..."
apt-get install -y nginx
mkdir -p /etc/nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/selfsigned.key \
  -out /etc/nginx/ssl/selfsigned.crt \
  -subj "/CN=super-agent"

# Claude Code CLI
echo ">>> Installing Claude Code CLI..."
npm install -g @anthropic-ai/claude-code || true

# Application directory
echo ">>> Setting up application directory..."
mkdir -p /opt/super-agent/{workspaces,logs}
chown -R ubuntu:ubuntu /opt/super-agent

# Nginx config — supports both direct and CloudFront modes.
# Port 80: proxies /api/* and /ws/* (CloudFront origin), redirects rest to HTTPS.
# Port 443: self-signed cert, serves frontend + proxies API/WS.
cat > /etc/nginx/sites-available/super-agent << 'NGINX_CONF'
server {
    listen 80 default_server;
    server_name _;

    # API/WS proxy on port 80 (for CloudFront HTTP origin)
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 50M;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl default_server;
    server_name _;

    ssl_certificate /etc/nginx/ssl/selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/selfsigned.key;

    # Enable gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 1000;

    root /opt/super-agent/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 50M;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX_CONF

ln -sf /etc/nginx/sites-available/super-agent /etc/nginx/sites-enabled/super-agent
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
systemctl enable nginx

# Systemd service
cat > /etc/systemd/system/backend.service << 'SERVICE'
[Unit]
Description=Super Agent Backend
After=network.target redis-server.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/super-agent/backend
EnvironmentFile=/opt/super-agent/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
StandardOutput=append:/opt/super-agent/logs/backend.log
StandardError=append:/opt/super-agent/logs/backend-error.log

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload

# Helper: fetch RDS credentials → DATABASE_URL
cat > /opt/super-agent/fetch-db-url.sh << 'FETCHSCRIPT'
#!/bin/bash
SECRET_ARN="${1:?Usage: fetch-db-url.sh <SECRET_ARN>}"
# Extract region from ARN (4th field: arn:aws:secretsmanager:<region>:...)
REGION=$(echo "$SECRET_ARN" | cut -d: -f4)
if [ -z "$REGION" ]; then
  REGION="${AWS_REGION:-us-west-2}"
fi
SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --region "$REGION" --query SecretString --output text)
DB_USER=$(echo "$SECRET_JSON" | jq -r '.username')
DB_PASS=$(echo "$SECRET_JSON" | jq -r '.password')
DB_HOST=$(echo "$SECRET_JSON" | jq -r '.host')
DB_PORT=$(echo "$SECRET_JSON" | jq -r '.port')
DB_NAME=$(echo "$SECRET_JSON" | jq -r '.dbname // "super_agent"')
ENCODED_PASS=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$DB_PASS', safe=''))")
echo "postgresql://${DB_USER}:${ENCODED_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=no-verify"
FETCHSCRIPT

chmod +x /opt/super-agent/fetch-db-url.sh
chown ubuntu:ubuntu /opt/super-agent/fetch-db-url.sh

# Placeholder .env
cat > /opt/super-agent/.env << 'ENVFILE'
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info
DATABASE_URL=CHANGE_ME
REDIS_HOST=CHANGE_ME
REDIS_PORT=CHANGE_ME
REDIS_PASSWORD=CHANGE_ME
AUTH_MODE=local
JWT_SECRET=CHANGE_ME
AWS_REGION=CHANGE_ME
S3_BUCKET_NAME=CHANGE_ME
CORS_ORIGIN=CHANGE_ME
CLAUDE_CODE_USE_BEDROCK=1
CLAUDE_MODEL=claude-sonnet-4-6
AGENT_WORKSPACE_BASE_DIR=/opt/super-agent/workspaces
AGENT_RUNTIME=claude
ENVFILE

chown ubuntu:ubuntu /opt/super-agent/.env
chmod 600 /opt/super-agent/.env

echo ">>> Bootstrap complete."
