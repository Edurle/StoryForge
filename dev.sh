#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_DIR="$ROOT/.pids"
BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
BACKEND_PORT="${PORT:-8888}"
FRONTEND_PORT="${FRONTEND_PORT:-3456}"
BACKEND_LOG="$PID_DIR/backend.log"
FRONTEND_LOG="$PID_DIR/frontend.log"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

read_pid() {
  local file="$1"
  if [ -f "$file" ]; then
    cat "$file"
  fi
}

is_alive() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

stop_service() {
  local name="$1"
  local pid_file="$2"
  local pid
  pid=$(read_pid "$pid_file")
  if is_alive "$pid"; then
    kill "$pid" 2>/dev/null || true
    # Wait up to 5s for graceful shutdown
    for i in $(seq 1 10); do
      if ! is_alive "$pid"; then break; fi
      sleep 0.5
    done
    # Force kill if still alive
    if is_alive "$pid"; then
      kill -9 "$pid" 2>/dev/null || true
    fi
    log "$name stopped (PID $pid)"
  else
    log "$name not running"
  fi
  rm -f "$pid_file"
}

stop() {
  log "Stopping StoryForge..."
  stop_service "Backend" "$BACKEND_PID_FILE"
  stop_service "Frontend" "$FRONTEND_PID_FILE"
  # Kill any lingering processes on our ports
  for port in $BACKEND_PORT $FRONTEND_PORT; do
    local pids
    pids=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
      log "Killing stale processes on port $port: $pids"
      kill $pids 2>/dev/null || true
    fi
  done
  rm -rf "$PID_DIR"
  log "All services stopped."
}

start() {
  if [ -d "$PID_DIR" ]; then
    local bp fp
    bp=$(read_pid "$BACKEND_PID_FILE")
    fp=$(read_pid "$FRONTEND_PID_FILE")
    if is_alive "$bp" || is_alive "$fp"; then
      log "Services already running. Run '$0 stop' first."
      exit 1
    fi
    rm -rf "$PID_DIR"
  fi

  mkdir -p "$PID_DIR"

  # --- Backend ---
  log "Starting backend on :$BACKEND_PORT ..."
  nohup npx tsx "$ROOT/src/server/start.ts" > "$BACKEND_LOG" 2>&1 &
  echo $! > "$BACKEND_PID_FILE"

  # Wait for backend to be ready (up to 15s)
  for i in $(seq 1 30); do
    if curl -sf "http://localhost:$BACKEND_PORT/api/projects" > /dev/null 2>&1; then
      break
    fi
    if ! is_alive "$(read_pid "$BACKEND_PID_FILE")"; then
      log "ERROR: Backend failed to start. See $BACKEND_LOG"
      cat "$BACKEND_LOG"
      rm -rf "$PID_DIR"
      exit 1
    fi
    sleep 0.5
  done

  log "Backend ready (PID $(read_pid "$BACKEND_PID_FILE"), port $BACKEND_PORT)"

  # --- Frontend ---
  log "Starting frontend on :$FRONTEND_PORT ..."
  nohup bash -c "cd '$ROOT/web' && npx vite --port $FRONTEND_PORT --clearScreen false" > "$FRONTEND_LOG" 2>&1 &
  echo $! > "$FRONTEND_PID_FILE"

  sleep 1
  if ! is_alive "$(read_pid "$FRONTEND_PID_FILE")"; then
    log "ERROR: Frontend failed to start. See $FRONTEND_LOG"
    cat "$FRONTEND_LOG"
    stop_service "Backend" "$BACKEND_PID_FILE"
    rm -rf "$PID_DIR"
    exit 1
  fi

  log ""
  log "========================================"
  log "  书灵 StoryForge is running!"
  log "  Frontend: http://localhost:$FRONTEND_PORT"
  log "  Backend:  http://localhost:$BACKEND_PORT"
  log "  Logs:     $PID_DIR/*.log"
  log "  Stop:     $0 stop"
  log "========================================"
  log ""
}

status() {
  local bp fp
  bp=$(read_pid "$BACKEND_PID_FILE")
  fp=$(read_pid "$FRONTEND_PID_FILE")

  if is_alive "$bp"; then
    log "Backend: running (PID $bp, port $BACKEND_PORT)"
  else
    log "Backend: not running"
  fi

  if is_alive "$fp"; then
    log "Frontend: running (PID $fp, port $FRONTEND_PORT)"
  else
    log "Frontend: not running"
  fi
}

case "${1:-start}" in
  start)   start ;;
  stop)    stop ;;
  restart) stop; sleep 1; start ;;
  status)  status ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
