#!/bin/bash
# 一键部署脚本 —— 在你的本地 Windows 上用 Git Bash / WSL / PowerShell 执行
# 把 SERVER 改成你的服务器地址

set -e

SERVER="root@your-server-ip"
REMOTE_DIR="/opt/game"
LOCAL_JAR="target/game-0.0.1-SNAPSHOT.jar"

echo "==> 上传 jar 到服务器..."
scp "$LOCAL_JAR" "$SERVER:$REMOTE_DIR/game-0.0.1-SNAPSHOT.jar"

echo "==> 上传 systemd 服务文件..."
scp deploy/game.service "$SERVER:/etc/systemd/system/game.service"

echo "==> 上传 nginx 配置..."
scp deploy/game-nginx.conf "$SERVER:/etc/nginx/sites-available/game.conf"

echo "==> 在服务器上重启服务..."
ssh "$SERVER" "
    mkdir -p $REMOTE_DIR
    systemctl daemon-reload
    systemctl enable game
    systemctl restart game
    ln -sf /etc/nginx/sites-available/game.conf /etc/nginx/sites-enabled/game.conf
    nginx -t && systemctl reload nginx
    echo '--- status ---'
    systemctl status game --no-pager -l
"

echo ""
echo "✅ 部署完成！浏览器访问 http://your-server-ip"