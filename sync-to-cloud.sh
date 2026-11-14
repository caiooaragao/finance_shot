#!/usr/bin/env bash
# Copia dados do Postgres local (docker-compose) para um Postgres na nuvem.
#
# Uso (Git Bash / WSL):
#   CLOUD_DATABASE_URL='postgresql://user:pass@host:5432/db' ./sync-to-cloud.sh
#   ./sync-to-cloud.sh 'postgresql://user:pass@host:5432/db'
#
# Opções:
#   --apply-schema   Aplica server/db/schema.sql na nuvem antes do import (banco vazio).
#   --dry-run        Só gera o dump em .sync/finance_shot_data.sql; não importa.
#   -y, --yes        Não pede confirmação antes de importar na nuvem.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

APPLY_SCHEMA=0
DRY_RUN=0
ASSUME_YES=0
CLOUD_URL="${CLOUD_DATABASE_URL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply-schema) APPLY_SCHEMA=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      if [[ -z "$CLOUD_URL" ]]; then
        CLOUD_URL="$1"
      else
        echo "Argumento desconhecido: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ "$DRY_RUN" -eq 0 && -z "$CLOUD_URL" ]]; then
  echo "Defina CLOUD_DATABASE_URL ou passe a URL como argumento." >&2
  echo "Ex.: CLOUD_DATABASE_URL='postgresql://...' ./sync-to-cloud.sh" >&2
  exit 1
fi

if [[ -n "$CLOUD_URL" ]] && [[ "$CLOUD_URL" =~ (localhost|127\.0\.0\.1):(5432|5434|7000|7001)(/|$) ]]; then
  echo "CLOUD_DATABASE_URL parece apontar para o Postgres local (portas dev/deploy)." >&2
  echo "Para VPS via túnel SSH, use outra porta local (ex.: 15432): ssh -L 15432:127.0.0.1:7001 …" >&2
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

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker é necessário para ler o banco local." >&2
  exit 1
fi

echo "Garantindo Postgres local…"
compose up -d postgres
ready=0
for _ in $(seq 1 30); do
  if compose exec -T postgres pg_isready -U finance -d finance_shot >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "Postgres local não ficou pronto." >&2
  exit 1
fi

run_psql() {
  local url="$1"
  local file="$2"
  if command -v psql >/dev/null 2>&1; then
    psql "$url" -v ON_ERROR_STOP=1 -f "$file"
  else
    docker run --rm \
      -v "${file}:/tmp/import.sql:ro" \
      postgres:16 \
      psql "$url" -v ON_ERROR_STOP=1 -f /tmp/import.sql
  fi
}

SYNC_DIR="$ROOT/.sync"
mkdir -p "$SYNC_DIR"
DUMP="$SYNC_DIR/finance_shot_data.sql"
SCHEMA="$ROOT/server/db/schema.sql"

TABLES=(
  senate_filings
  senate_trades
  house_filings
  house_trades
  scrape_state
)

dump_args=(pg_dump -U finance -d finance_shot --data-only --no-owner --no-privileges)
for t in "${TABLES[@]}"; do
  dump_args+=(-t "$t")
done

echo "Exportando dados locais → $DUMP"
compose exec -T postgres "${dump_args[@]}" >"$DUMP"

lines=$(wc -l <"$DUMP" | tr -d ' ')
if [[ "$lines" -lt 5 ]]; then
  echo "Dump muito pequeno ($lines linhas). O banco local tem dados?" >&2
  exit 1
fi

echo "Dump: $lines linhas."

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry-run: import não executado. Arquivo: $DUMP"
  exit 0
fi

if [[ "$APPLY_SCHEMA" -eq 1 ]]; then
  echo "Aplicando schema na nuvem…"
  run_psql "$CLOUD_URL" "$SCHEMA"
fi

if [[ "$ASSUME_YES" -ne 1 ]]; then
  echo
  echo "Isso vai inserir/atualizar linhas na nuvem (pode falhar se já existirem as mesmas PKs)."
  echo "Destino: ${CLOUD_URL%%@*}@…"
  read -r -p "Continuar? [y/N] " ans
  if [[ ! "$ans" =~ ^[Yy]$ ]]; then
    echo "Cancelado. Dump mantido em $DUMP"
    exit 0
  fi
fi

echo "Importando na nuvem…"
run_psql "$CLOUD_URL" "$DUMP"

echo "Concluído. Confira com: SELECT COUNT(*) FROM senate_trades;"