#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$ROOT/tmp"
mkdir -p "$TMP"
export PATH="$HOME/.local/bin:$PATH"

GPU_DEVICE="${MIRROR_GPU_DEVICE:-1}"
OLLAMA_PORT="${OLLAMA_PORT:-11434}"
SBV2_PORT="${SBV2_PORT:-5000}"
API_PORT="${API_PORT:-8004}"
WEB_PORT="${VITE_PORT:-5173}"
WEB_HOST="${VITE_HOST:-0.0.0.0}"

is_listening() {
  local port="$1"
  ss -ltnp 2>/dev/null | grep -qE ":${port}\b"
}

start_ollama() {
  if is_listening "$OLLAMA_PORT"; then
    echo "ollama already listening on ${OLLAMA_PORT}"
    return
  fi
  if ! command -v ollama >/dev/null 2>&1; then
    echo "ollama command was not found; install Ollama first" >&2
    return 1
  fi

  echo "starting ollama on 127.0.0.1:${OLLAMA_PORT}"
  nohup env \
    CUDA_VISIBLE_DEVICES="$GPU_DEVICE" \
    OLLAMA_HOST="127.0.0.1:${OLLAMA_PORT}" \
    OLLAMA_MODELS="${OLLAMA_MODELS:-$HOME/.ollama/models}" \
    ollama serve > "$TMP/hpc-ollama.log" 2>&1 &
  echo $! > "$TMP/hpc-ollama.pid"
}

start_style_bert() {
  if is_listening "$SBV2_PORT"; then
    echo "Style-Bert-VITS2 already listening on ${SBV2_PORT}"
    return
  fi

  local sbv2_dir="${STYLE_BERT_VITS2_DIR:-$ROOT/third_party/Style-Bert-VITS2}"
  local python="$sbv2_dir/venv/bin/python"
  if [ ! -x "$python" ] || [ ! -f "$sbv2_dir/server_fastapi.py" ]; then
    echo "Style-Bert-VITS2 is not ready at $sbv2_dir" >&2
    return 1
  fi

  echo "starting Style-Bert-VITS2 on ${SBV2_PORT}"
  (
    cd "$sbv2_dir"
    nohup env CUDA_VISIBLE_DEVICES="${STYLE_BERT_GPU_DEVICE:-$GPU_DEVICE}" \
      "$python" server_fastapi.py > "$TMP/hpc-sbv2.log" 2>&1 &
    echo $! > "$TMP/hpc-sbv2.pid"
  )
}

start_api() {
  if is_listening "$API_PORT"; then
    echo "Mirror API already listening on ${API_PORT}"
    return
  fi
  if [ ! -x "$ROOT/.venv/bin/python" ]; then
    echo "Mirror backend venv is missing; run setup before starting the API" >&2
    return 1
  fi

  echo "starting Mirror API on 127.0.0.1:${API_PORT}"
  (
    cd "$ROOT"
    nohup env \
      API_HOST="${API_HOST:-127.0.0.1}" \
      API_PORT="$API_PORT" \
      API_RELOAD="${API_RELOAD:-false}" \
      MIRROR_FFMPEG_PATH="${MIRROR_FFMPEG_PATH:-/usr/bin/ffmpeg}" \
      MIRROR_OLLAMA_URL="${MIRROR_OLLAMA_URL:-http://127.0.0.1:${OLLAMA_PORT}}" \
      MIRROR_LLM_MODEL="${MIRROR_LLM_MODEL:-gemma4:e2b}" \
      MIRROR_TTS_ENGINE="${MIRROR_TTS_ENGINE:-style-bert-vits2}" \
      MIRROR_STYLE_BERT_VITS2_URL="${MIRROR_STYLE_BERT_VITS2_URL:-http://127.0.0.1:${SBV2_PORT}}" \
      MIRROR_STYLE_BERT_VITS2_MODEL="${MIRROR_STYLE_BERT_VITS2_MODEL:-Ota}" \
      MIRROR_STYLE_BERT_VITS2_SPEAKER="${MIRROR_STYLE_BERT_VITS2_SPEAKER:-Ota}" \
      MIRROR_STYLE_BERT_VITS2_STYLE="${MIRROR_STYLE_BERT_VITS2_STYLE:-Neutral}" \
      MIRROR_SPEAK_MAX_CHARS="${MIRROR_SPEAK_MAX_CHARS:-260}" \
      .venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port "$API_PORT" \
      > "$TMP/hpc-api.log" 2>&1 &
    echo $! > "$TMP/hpc-api.pid"
  )
}

start_frontend() {
  if is_listening "$WEB_PORT"; then
    echo "Mirror frontend already listening on ${WEB_PORT}"
    return
  fi
  if [ ! -d "$ROOT/frontend/node_modules" ]; then
    echo "frontend/node_modules is missing; run npm --prefix frontend install first" >&2
    return 1
  fi

  echo "starting Mirror frontend on ${WEB_HOST}:${WEB_PORT}"
  (
    cd "$ROOT"
    nohup env \
      VITE_HOST="$WEB_HOST" \
      VITE_PORT="$WEB_PORT" \
      VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-http://127.0.0.1:${API_PORT}}" \
      npm --prefix frontend run dev -- --host "$WEB_HOST" --port "$WEB_PORT" \
      > "$TMP/hpc-web.log" 2>&1 &
    echo $! > "$TMP/hpc-web.pid"
  )
}

start_ollama
start_style_bert
start_api
start_frontend

echo
"$ROOT/scripts/hpc-status.sh"
