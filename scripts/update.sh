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
docker compose -f docker-compose.prod.yml up -d --force-recreate

echo "✅ Atualização concluída!"
