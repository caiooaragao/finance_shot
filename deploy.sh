#!/usr/bin/env bash
# Deploy local: Postgres em 127.0.0.1:7001 (host) e app em http://0.0.0.0:7000.
# Uso:
#   ./deploy.sh              Postgres no Docker + next start em background (sobrevive ao fechar o SSH)
#   ./deploy.sh docker       Postgres + app no Docker
#   ./deploy.sh stop         Para o next do modo host
#   ./deploy.sh status       Mostra se o app host está no ar
#   ./deploy.sh logs         Acompanha o log (.deploy/app.log)
#   ./deploy.sh fg           next start em primeiro plano (debug)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

ACTION="${1:-deploy}"
APP_PORT="${APP_PORT:-7000}"
POSTGRES_PORTS="${POSTGRES_PORTS:-127.0.0.1:7001:5432}"
DATABASE_URL="${DATABASE_URL:-postgresql://finance:finance@127.0.0.1:7001/finance_shot}"
RUN_DIR="${ROOT}/.deploy"
PID_FILE="${RUN_DIR}/app.pid"
APP_LOG="${RUN_DIR}/app.log"

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

COMPOSE_DEPLOY=( -f docker-compose.yml -f docker-compose.deploy.yml --profile app )

port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -lnt "sport = :${APP_PORT}" 2>/dev/null | grep -q LISTEN
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti ":${APP_PORT}" >/dev/null 2>&1
    return
  fi
  return 1
}

free_app_port() {
  local pid=""
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${APP_PORT}/tcp" 2>/dev/null || true
    sleep 1
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    pid="$(lsof -ti ":${APP_PORT}" 2>/dev/null || true)"
  elif command -v ss >/dev/null 2>&1; then
    pid="$(ss -lptn "sport = :${APP_PORT}" 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)"
  fi
  if [[ -n "${pid}" ]]; then
    echo "Encerrando processo na porta ${APP_PORT} (pid ${pid})…"
    kill "${pid}" 2>/dev/null || true
    sleep 1
    kill -9 "${pid}" 2>/dev/null || true
  fi
}

stop_host_app() {
  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid="$(tr -d '[:space:]' <"${PID_FILE}")"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      echo "Parando app (pid ${pid})…"
      kill "${pid}" 2>/dev/null || true
      local i
      for i in $(seq 1 15); do
        kill -0 "${pid}" 2>/dev/null || break
        sleep 1
      done
      kill -9 "${pid}" 2>/dev/null || true
    fi
    rm -f "${PID_FILE}"
  fi
  free_app_port
}

cmd_status() {
  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid="$(tr -d '[:space:]' <"${PID_FILE}")"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null && port_in_use; then
      echo "Rodando — pid ${pid}, http://0.0.0.0:${APP_PORT}"
      echo "Log: ${APP_LOG}"
      exit 0
    fi
  fi
  if port_in_use; then
    echo "Porta ${APP_PORT} em uso, mas sem pid em ${PID_FILE}."
    exit 0
  fi
  echo "App host parado."
  exit 1
}

cmd_logs() {
  mkdir -p "${RUN_DIR}"
  if [[ ! -f "${APP_LOG}" ]]; then
    echo "Ainda não há log em ${APP_LOG}." >&2
    exit 1
  fi
  exec tail -f "${APP_LOG}"
}

teardown_previous_stack() {
  # Não derruba o Postgres. `compose down` manda SIGTERM e o banco responde
  # 57P01 ("terminating connection due to administrator command") para quem
  # ainda está consultando. O volume e o container ficam; só o app sai.
  echo "Removendo container antigo do app (o Postgres continua no ar)…"
  compose "${COMPOSE_DEPLOY[@]}" stop app >/dev/null 2>&1 || true
  compose "${COMPOSE_DEPLOY[@]}" rm -f app >/dev/null 2>&1 || true
}

start_postgres() {
  echo "Subindo Postgres (${POSTGRES_PORTS})…"
  if compose up -d --wait postgres 2>/dev/null; then
    :
  else
    compose up -d postgres
    local ready=0
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
}

start_host_app_detached() {
  mkdir -p "${RUN_DIR}"
  stop_host_app

  export DATABASE_URL
  export PORT="$APP_PORT"

  echo "Iniciando app em background (nohup)…"
  # shellcheck disable=SC2091
  nohup npm run start:deploy >>"${APP_LOG}" 2>&1 &
  local app_pid=$!
  echo "${app_pid}" >"${PID_FILE}"
  disown "${app_pid}" 2>/dev/null || true

  local i
  for i in $(seq 1 45); do
    if port_in_use; then
      echo
      echo "Banco:  ${DATABASE_URL}"
      echo "Front:  http://0.0.0.0:${APP_PORT}"
      echo "PID:    ${app_pid}  ·  Log: ${APP_LOG}"
      echo "Parar:  ./deploy.sh stop"
      echo "Status: ./deploy.sh status"
      return 0
    fi
    if ! kill -0 "${app_pid}" 2>/dev/null; then
      echo "O app encerrou ao subir. Últimas linhas do log:" >&2
      tail -30 "${APP_LOG}" >&2 || true
      rm -f "${PID_FILE}"
      exit 1
    fi
    sleep 1
  done

  echo "Timeout aguardando a porta ${APP_PORT}. Ver ${APP_LOG}" >&2
  exit 1
}

case "${ACTION}" in
  stop)
    stop_host_app
    echo "App host parado."
    exit 0
    ;;
  status)
    cmd_status
    ;;
  logs)
    cmd_logs
    ;;
  fg|foreground)
    ACTION=fg
    ;;
  docker|deploy|host|"")
    ;;
  *)
    echo "Ação desconhecida: ${ACTION}" >&2
    echo "Uso: ./deploy.sh [deploy|docker|stop|status|logs|fg]" >&2
    exit 1
    ;;
esac

teardown_previous_stack
start_postgres

if [[ "${ACTION}" == "docker" ]]; then
  echo "Build e subida do app no Docker (porta ${APP_PORT})…"
  APP_PORT="$APP_PORT" compose "${COMPOSE_DEPLOY[@]}" up -d --build
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

if [[ "${ACTION}" == "fg" ]]; then
  stop_host_app
  echo
  echo "Banco:  ${DATABASE_URL}"
  echo "Front:  http://localhost:${APP_PORT}"
  echo
  export DATABASE_URL
  export PORT="$APP_PORT"
  exec npm run start:deploy
fi

start_host_app_detached