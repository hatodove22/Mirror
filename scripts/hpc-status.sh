#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Ports:"
ss -ltnp 2>/dev/null | grep -E ':(5173|8004|5000|11434)\b' || echo "  no Mirror ports are listening"

echo
echo "PID files:"
for file in "$ROOT"/tmp/hpc-{web,api,sbv2,ollama}.pid; do
  if [ -f "$file" ]; then
    pid="$(cat "$file")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "  $(basename "$file"): $pid running"
    else
      echo "  $(basename "$file"): $pid not running"
    fi
  else
    echo "  $(basename "$file"): missing"
  fi
done

echo
echo "HTTP checks:"
check_url() {
  local label="$1"
  local url="$2"
  local code
  code="$(curl -k -sS -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || true)"
  if [ "$code" = "200" ]; then
    echo "  $label: ok ($url)"
  else
    echo "  $label: not ready ($code) ($url)"
  fi
}

check_url "frontend HTTP" "http://127.0.0.1:${VITE_PORT:-5173}/"
check_url "frontend HTTPS" "https://127.0.0.1:${VITE_PORT:-5173}/"
check_url "Mirror API" "http://127.0.0.1:${API_PORT:-8004}/api/health"
check_url "Style-Bert-VITS2" "http://127.0.0.1:${SBV2_PORT:-5000}/models/info"
check_url "Ollama" "http://127.0.0.1:${OLLAMA_PORT:-11434}/api/tags"
