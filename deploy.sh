#!/bin/bash
set -e

echo "==> Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

echo "==> Installing Docker Compose plugin..."
apt-get install -y docker-compose-plugin 2>/dev/null || true

echo "==> Creating project directory..."
mkdir -p /opt/osint-suite
cp -r . /opt/osint-suite/
cd /opt/osint-suite

echo "==> Setting up .env..."
if [ ! -f .env ]; then
  cp .env.example .env 2>/dev/null || true
  JWT=$(openssl rand -hex 32)
  sed -i "s/REPLACE_WITH_64_CHAR_RANDOM_STRING/$JWT/" .env
  echo ""
  echo "!! IMPORTANT: edit /opt/osint-suite/.env and set ADMIN_PASSWORD !!"
  echo "   Run: nano /opt/osint-suite/.env"
  echo ""
  read -p "Press Enter after setting your password..."
fi

echo "==> Starting services (HTTP only for cert)..."
# Temporarily use HTTP-only nginx config
cat > /tmp/nginx-http.conf << 'EOF'
server {
    listen 80;
    server_name your-domain.example.com;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 200 'Setting up SSL...';
        add_header Content-Type text/plain;
    }
}
EOF

docker compose up -d nginx

echo "==> Obtaining SSL certificate..."
read -p "Enter your email for Let's Encrypt: " EMAIL
docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d your-domain.example.com \
  --email "$EMAIL" \
  --agree-tos --no-eff-email

echo "==> Starting full stack..."
docker compose up -d --build

echo ""
echo "✓ Done! Your OSINT suite is live at https://your-domain.example.com"
echo "  First login with credentials from .env (ADMIN_USERNAME / ADMIN_PASSWORD)"
