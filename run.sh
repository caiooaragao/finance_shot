#!/usr/bin/env bash
# Sobe o Postgres (Docker) e o Next.js em http://localhost:3000.
# Uso (Git Bash / WSL / macOS / Linux): ./run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

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

if [[ ! -f .env.local ]]; then
  echo "Criando .env.local a partir de example.env"
  cp example.env .env.local
fi

echo "Subindo Postgres na porta 5434…"
if compose up -d --wait postgres 2>/dev/null; then
  :
else
  compose up -d postgres
  echo "Aguardando Postgres aceitar conexões…"
  ready=0
  for _ in $(seq 1 45); do
    if compose exec -T postgres pg_isready -U finance -d finance_shot >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [[ "$ready" -ne 1 ]]; then
    echo "Postgres não ficou pronto a tempo. Veja: docker compose logs postgres" >&2
    exit 1
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Instale o Node.js (npm) para subir o frontend." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Instalando dependências…"
  npm install
fi

echo
echo "Banco:  postgresql://finance:finance@localhost:5434/finance_shot"
echo "Front:  http://localhost:3000"
echo "Ctrl+C encerra o Next.js; o Postgres no Docker continua no ar."
echo

exec npm run dev