# 2048 3D 部署指南

## 🎯 最简方案：Spring Boot fat jar（推荐新手）

整个后端只有静态文件托管，jar 里自带 Tomcat，**服务器装个 JDK 就能跑**。

### 前置
- 一台云服务器（阿里云/腾讯云/AWS/Vultr，最低配 1核1G 就行）
- 服务器系统：Ubuntu 22.04 / Debian 12 / CentOS 8+
- 一个域名（可选，没域名直接用 IP 也行）

### Step 1 —— 本地打包
```powershell
.\mvnw.cmd clean package -DskipTests
```
产出：`target/game-0.0.1-SNAPSHOT.jar`（~19MB）

### Step 2 —— 上传到服务器
```bash
scp target/game-0.0.1-SNAPSHOT.jar root@你的服务器IP:/opt/game/
```

### Step 3 —— 服务器上装 JDK 并运行
```bash
# Ubuntu/Debian
apt update && apt install -y openjdk-17-jre-headless

# CentOS/RHEL
dnf install -y java-17-openjdk-headless

# 直接跑（临时测试，Ctrl+C 就停）
java -jar /opt/game/game-0.0.1-SNAPSHOT.jar

# 后台常驻 + 开机自启（生产环境）
# 见 deploy/game.service 和 deploy/deploy.sh
```

### Step 4 —— 开防火墙
```bash
# Spring Boot 直出
ufw allow 8080/tcp       # Ubuntu
firewall-cmd --add-port=8080/tcp --permanent && firewall-cmd --reload  # CentOS
```
浏览器访问 `http://你的服务器IP:8080` 就能看到了。

---

## 🚀 进阶方案：systemd + nginx（生产级）

### 一键部署
```bash
# 改 deploy/deploy.sh 里的 SERVER 变量，然后：
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

### 手动部署

**systemd 服务文件** → `/etc/systemd/system/game.service`
（内容见 `deploy/game.service`）

```bash
systemctl daemon-reload
systemctl enable game      # 开机自启
systemctl start game       # 启动
systemctl status game      # 看状态
journalctl -u game -f      # 看实时日志
```

**nginx 反代** → `/etc/nginx/sites-available/game.conf`
（内容见 `deploy/game-nginx.conf`，记得改 server_name）

```bash
ln -s /etc/nginx/sites-available/game.conf /etc/nginx/sites-enabled/
nginx -t                    # 测试配置
systemctl reload nginx      # 重载
```

### 加 HTTPS（强烈建议）
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

---

## 💰 零成本方案：免费云平台

### Railway（最简单，5 分钟搞定）
1. 把整个项目 push 到 GitHub
2. 注册 https://railway.app → New Project → Deploy from GitHub
3. 自动识别 Spring Boot，点 Deploy 就行
4. 给你一个 `*.up.railway.app` 域名，直接访问

### Render（有免费额度）
1. https://render.com → New + → Web Service
2. 连 GitHub，Build Command: `./mvnw package -DskipTests`，Start Command: `java -jar target/game-0.0.1-SNAPSHOT.jar`
3. 免费版会休眠，访问一次自动唤醒（~3 秒延迟）

### Cloudflare Pages（纯静态，最快）
> ⚠️ 这个游戏后端只有静态文件，可以完全去掉 Java，变成纯静态站
> 步骤：`static/` 目录里的全部文件 + 把 `index.html` 放进去
> 然后直接拖到 https://pages.cloudflare.com 或者连 GitHub
> 自带全球 CDN + 免费 HTTPS，永久免费

---

## 📦 服务器最低资源需求

| 资源 | 最低 | 推荐 |
|------|------|------|
| CPU  | 1 核 | 1 核 |
| 内存 | 256MB | 512MB |
| 磁盘 | 2GB | 10GB |
| 带宽 | 1Mbps | 3Mbps |

Spring Boot 空闲时内存 ~80MB，Three.js 的 833KB 库让 nginx gzip 后只有 ~250KB，**全球访问无压力**。

---

## 🔧 运维速查

```bash
# 查看服务状态
systemctl status game

# 查看实时日志
journalctl -u game -f --no-pager

# 重启服务
systemctl restart game

# 直接跑最新 jar（跳过 systemd）
pkill -f game-0.0.1
java -jar -Xms128m -Xmx256m target/game-0.0.1-SNAPSHOT.jar
```