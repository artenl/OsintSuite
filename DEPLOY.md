# Deploy Guide

## Prerequisites on VPS
- Ubuntu 22.04+
- Ports 80 and 443 open in firewall
- DNS: `your-domain.example.com` A record → VPS IP

## Step 1 — Install Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
```

## Step 2 — Upload project

From your local machine:
```bash
scp -r ./osint-suite root@YOUR_VPS_IP:/opt/osint-suite
```

Or on VPS:
```bash
mkdir -p /opt/osint-suite
# Then upload files via scp or git clone
```

## Step 3 — Configure environment

```bash
cd /opt/osint-suite
cp .env.example .env
nano .env
```

Fill in:
```
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-password-here
```

## Step 4 — Get SSL certificate (first time)

Start nginx in HTTP-only mode first:
```bash
# Temporarily comment out the SSL server block in nginx/nginx.conf
# Only keep the HTTP block that serves /.well-known/acme-challenge/

docker compose up -d nginx

docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d your-domain.example.com \
  --email your@email.com \
  --agree-tos --no-eff-email
```

Then restore the full nginx.conf and restart:
```bash
docker compose restart nginx
```

## Step 5 — Launch everything

```bash
docker compose up -d --build
```

Check logs:
```bash
docker compose logs -f app
```

## Updating

```bash
cd /opt/osint-suite
git pull  # if using git
docker compose up -d --build app
```

## Access

- App: https://your-domain.example.com
- SpiderFoot: internal only (port 5001, not exposed publicly)

## First login

Username and password are what you set in `.env` (ADMIN_USERNAME / ADMIN_PASSWORD).
Change password in Settings after first login.
