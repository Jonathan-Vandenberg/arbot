#!/usr/bin/env bash
set -euo pipefail

echo "========================================"
echo "🚀 Arbot Server Setup Starting..."
echo "========================================"

# --- CONFIG ---
REPO_URL="git@github.com:Jonathan-Vandenberg/arbot.git"
APP_DIR="$HOME/arbot"
DOCKER_COMPOSE_FILE="$APP_DIR/infra/docker-compose.yml"

# --- CHECKS ---
if [[ -z "${GHCR_PAT:-}" ]]; then
  echo "❌ ERROR: GHCR_PAT environment variable not set."
  echo "   Export your GitHub Container Registry token before running:"
  echo "   export GHCR_PAT=your_token_here"
  exit 1
fi

# --- INSTALL DEPENDENCIES ---
echo "📦 Installing Docker and Docker Compose..."
if ! command -v docker &>/dev/null; then
  apt-get update -y
  apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
else
  echo "✅ Docker already installed."
fi

# --- CLONE REPO ---
if [[ ! -d "$APP_DIR" ]]; then
  echo "📥 Cloning repository..."
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "🔄 Repo already exists, pulling latest changes..."
  cd "$APP_DIR"
  git pull origin main || true
fi

cd "$APP_DIR"

# --- LOGIN TO GHCR ---
echo "🔑 Logging into GitHub Container Registry..."
echo "$GHCR_PAT" | docker login ghcr.io -u Jonathan-Vandenberg --password-stdin || {
  echo "❌ Failed to login to GHCR. Check your GHCR_PAT token."
  exit 1
}

# --- RUN DOCKER COMPOSE ---
echo "🐳 Starting services with Docker Compose..."
docker compose -f "$DOCKER_COMPOSE_FILE" up -d --build || {
  echo "❌ Docker Compose failed to start services."
  exit 1
}

echo "========================================"
echo "✅ Arbot Server Setup Complete!"
echo "   Services are running via Docker Compose."
echo "========================================"
