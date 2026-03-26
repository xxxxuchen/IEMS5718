#!/usr/bin/env bash
set -euo pipefail


EC2_HOST="54.79.184.85"
DOMAIN_NAME="s30.iems5718.iecuhk.cc"
EC2_USER="ubuntu"
SSH_KEY="../iems5718-key.pem" # Path relative to the script execution directory
REMOTE_APP_DIR="/home/ubuntu/iems5718"

########################################
# Pre-flight checks
########################################
if [ ! -f "$SSH_KEY" ]; then
  echo "Error: SSH key not found at $SSH_KEY"
  exit 1
fi

# Auto-fix key permission
chmod 400 "$SSH_KEY" 2>/dev/null || true

echo "==> [1/6] Build frontend (Vite)"
npm run build

echo "==> [2/6] Prepare backend bundle"
# Exclude node_modules, the database file (to prevent overwriting production data), and local .env
TMP_TAR="$(mktemp -t backend.XXXXXX.tar.gz)"
tar --exclude='backend/node_modules' \
    --exclude='backend/db/shop.db' \
    --exclude='backend/.env' \
    --exclude='.DS_Store' \
    -czf "$TMP_TAR" backend

echo "==> [3/6] Upload dist/ to EC2 (/tmp/dist)"
if command -v rsync >/dev/null 2>&1; then
  rsync -az --delete -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new" \
    dist/ "${EC2_USER}@${EC2_HOST}:/tmp/dist/"
else
  scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -r dist "${EC2_USER}@${EC2_HOST}:/tmp/"
fi

echo "==> [4/6] Upload backend tarball to EC2 (/tmp/backend.tar.gz)"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$TMP_TAR" "${EC2_USER}@${EC2_HOST}:/tmp/backend.tar.gz"
rm -f "$TMP_TAR"

# Upload local .env if it doesn't exist on the server (first time setup)

# scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new backend/.env "${EC2_USER}@${EC2_HOST}:/tmp/.env.tmp" || true

echo "==> [5/6] Remote deploy: update files, install deps, restart PM2 & Nginx"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "${EC2_USER}@${EC2_HOST}" bash -s <<EOF
set -euo pipefail

REMOTE_APP_DIR="${REMOTE_APP_DIR}"
DOMAIN_NAME="${DOMAIN_NAME}"

echo "  -> Ensure app directories exist"
mkdir -p "\$REMOTE_APP_DIR/backend/db"
mkdir -p "\$REMOTE_APP_DIR/backend/uploads"

echo "  -> Deploy frontend to /var/www/html"
sudo rm -rf /var/www/html/*
sudo cp -r /tmp/dist/* /var/www/html/
sudo chown -R www-data:www-data /var/www/html

echo "  -> Deploy backend to \$REMOTE_APP_DIR/backend"
# Extract over existing files, but don't delete the whole directory to preserve db/ and uploads/
tar -xzf /tmp/backend.tar.gz -C "\$REMOTE_APP_DIR"
rm -f /tmp/backend.tar.gz

# Handle .env (if uploaded as tmp)
if [ -f /tmp/.env.tmp ]; then
  echo "  -> Setting up initial .env file"
  mv /tmp/.env.tmp "\$REMOTE_APP_DIR/backend/.env"
fi

echo "  -> Install backend deps"
cd "\$REMOTE_APP_DIR/backend"
npm install --production

# Initialize DB only if it doesn't exist
if [ ! -f "db/shop.db" ]; then
  echo "  -> Initializing database for the first time"
  node init-db.js
else
  echo "  -> Database already exists, skipping initialization"
fi

echo "  -> Start/Reload backend with PM2"
if ! command -v pm2 >/dev/null 2>&1; then
  echo "  -> Installing PM2 globally"
  sudo npm install -g pm2
fi

# Set NODE_ENV to production for secure cookies and optimizations
export NODE_ENV=production

pm2 start server.js --name iems5718-backend --update-env || pm2 restart iems5718-backend
pm2 save

echo "  -> Validate and reload nginx"
sudo nginx -t
sudo systemctl restart nginx

echo "  -> Done on server"
EOF

echo "==> [6/6] Done! Test URLs:"
echo "    Main:  https://${DOMAIN_NAME}/"
echo "    Admin: https://${DOMAIN_NAME}/admin/"
echo "    API:   https://${DOMAIN_NAME}/api/categories"
echo ""
