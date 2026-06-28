#!/bin/bash
# Bilingual PDF Audio Player - One-Click Remote Deployer
# Runs on your local machine to pull updates and deploy on the server.

set -e

# Configuration
DEPLOY_DIR="/root/py-app/pdf-audio"
HOST_CONFIG_FILE=".deploy_host"

# Check if server host is passed as argument or env var
SERVER_HOST=""
if [ -n "$1" ]; then
    SERVER_HOST="$1"
    # Proactively save custom inputs for convenience next time
    echo "$SERVER_HOST" > "$HOST_CONFIG_FILE"
elif [ -n "$PDF_AUDIO_SERVER" ]; then
    SERVER_HOST="$PDF_AUDIO_SERVER"
elif [ -f "$HOST_CONFIG_FILE" ]; then
    SERVER_HOST=$(cat "$HOST_CONFIG_FILE")
else
    # Prompt the user for the host configuration
    echo -n "请输入服务器的 SSH 别名或登录连接串 (例如 opp 或 root@192.168.1.44): "
    read -r user_input
    if [ -z "$user_input" ]; then
        echo -e "\033[1;31m[ERROR]\033[0m 未指定服务器连接地址。部署中止。"
        exit 1
    fi
    SERVER_HOST="$user_input"
    echo "$SERVER_HOST" > "$HOST_CONFIG_FILE"
    echo "默认服务器地址已保存至 $HOST_CONFIG_FILE"
fi

# Visual Helper
info() { echo -e "\033[1;34m[LOCAL]\033[0m $*"; }
success() { echo -e "\033[1;32m[LOCAL]\033[0m $*"; }

info "Connecting to remote host: $SERVER_HOST..."
info "Executing cd + git pull + ./deploy.sh + systemd restart on server..."

# SSH remote command pipeline
ssh -t "$SERVER_HOST" "
    set -e
    echo -e '\033[1;34m[SERVER]\033[0m Navigating to deploy folder...'
    cd '$DEPLOY_DIR'
    
    echo -e '\033[1;34m[SERVER]\033[0m Pulling latest commit from git...'
    git pull
    
    echo -e '\033[1;34m[SERVER]\033[0m Running deployment compilation & migrations...'
    bash deploy.sh
    
    echo -e '\033[1;34m[SERVER]\033[0m Restarting systemd backend and worker services...'
    sudo systemctl restart pdf-audio-backend pdf-audio-worker
    
    echo -e '\033[1;32m[SERVER]\033[0m Services restarted successfully!'
"

echo ""
success "========================================================"
success "     REMOTE DEPLOYMENT FINISHED SUCCESSFULLY!           "
success "========================================================"
echo "您的服务器端代码已拉取最新提交，编译静态页面挂载，并平滑重启了后台服务。"
echo "请访问您的服务器端口验证服务状态。"
