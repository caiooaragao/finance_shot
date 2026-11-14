#!/usr/bin/env bash
# Deploy local: Postgres em 127.0.0.1:7001 (host) e app em http://0.0.0.0:7000.
# Uso (Git Bash / WSL): ./deploy.sh          (Postgres no Docker + next start)
#                      ./deploy.sh docker    (Postgres + app no Docker)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MODE="${1:-host}"
APP_PORT="${APP_PORT:-7000}"
POSTGRES_PORTS="${POSTGRES_PORTS:-127.0.0.1:7001:5432}"
DATABASE_URL="${DATABASE_URL:-postgresql://finance:finance@127.0.0.1:7001/finance_shot}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Instale o Docker Desktop e deixe-o em execução." >&2
  exit 1
fi

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "Docker Compose não encontrado." >&2
    exit 1
  fi
}

export POSTGRES_PORTS

echo "Subindo Postgres (${POSTGRES_PORTS})…"
if compose up -d --wait postgres 2>/dev/null; then
  :
else
  compose up -d postgres
  ready=0
  for _ in $(seq 1 45); do
    if compose exec -T postgres pg_isready -U finance -d finance_shot >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "$ready" -ne 1 ]]; then
    echo "Postgres não ficou pronto a tempo." >&2
    exit 1
  fi
fi

if [[ "$MODE" == "docker" ]]; then
  echo "Build e subida do app no Docker (porta ${APP_PORT})…"
  APP_PORT="$APP_PORT" compose -f docker-compose.yml -f docker-compose.deploy.yml --profile app up -d --build
  echo
  echo "Banco (host):  ${POSTGRES_PORTS} → postgres:5432 no container"
  echo "Front (host):  http://localhost:${APP_PORT}"
  echo "Parar: compose -f docker-compose.yml -f docker-compose.deploy.yml --profile app down"
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Instale o Node.js (npm)." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Instalando dependências…"
  npm install
fi

echo "Build de produção…"
npm run build

echo
echo "Banco:  $DATABASE_URL"
echo "Front:  http://localhost:${APP_PORT}"
echo "Dica: se o Next falhar ao abrir a porta 7000, use: ./deploy.sh docker"
echo

export DATABASE_URL
export PORT="$APP_PORT"
exec npm run start:deploy