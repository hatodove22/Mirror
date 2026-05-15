#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$ROOT/tmp"

PID_FILES=(
  "$TMP/hpc-web.pid"
  "$TMP/hpc-api.pid"
  "$TMP/hpc-sbv2.pid"
  "$TMP/hpc-ollama.pid"
)

for file in "${PID_FILES[@]}"; do
  if [ -f "$file" ]; then
    pid="$(cat "$file")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "stopping $(basename "$file" .pid): $pid"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$file"
  fi
done

sleep 2

for port in "${VITE_PORT:-5173}" "${API_PORT:-8004}" "${SBV2_PORT:-5000}" "${OLLAMA_PORT:-11434}"; do
  pids="$(
    ss -ltnp 2>/dev/null \
      | awk -v p=":$port" '$0 ~ p {print $NF}' \
      | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' \
      | sort -u
  )"
  if [ -n "$pids" ]; then
    echo "stopping port $port: $pids"
    kill $pids 2>/dev/null || true
  fi
done

echo "Mirror HPC services stopped."
