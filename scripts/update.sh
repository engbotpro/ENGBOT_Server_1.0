#!/bin/bash
# Script de atualização do EngBot na EC2
# Executa: docker pull + docker compose up -d --force-recreate

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$SERVER_DIR/docker-compose.prod.yml"

cd "$SERVER_DIR"

echo "🔄 Baixando nova imagem do Docker Hub..."
docker pull $(grep 'image:' "$COMPOSE_FILE" | grep engbot-server | awk '{print $2}')

echo "🚀 Reiniciando containers..."
if command -v docker-compose >/dev/null 2>&1; then
  docker-compose -f docker-compose.prod.yml up -d --force-recreate
elif docker compose version >/dev/null 2>&1; then
  docker compose -f docker-compose.prod.yml up -d --force-recreate
else
  echo "❌ Instale docker-compose ou o plugin docker compose"
  exit 1
fi

echo "✅ Atualização concluída!"
