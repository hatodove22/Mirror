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
WEB_HTTPS="${VITE_HTTPS:-true}"

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
  local https_env=()
  if [ "$WEB_HTTPS" = "true" ] || [ "$WEB_HTTPS" = "1" ] || [ "$WEB_HTTPS" = "yes" ]; then
    local cert_path="${VITE_HTTPS_CERT:-$TMP/hpc-https.crt}"
    local key_path="${VITE_HTTPS_KEY:-$TMP/hpc-https.key}"
    if [ ! -f "$cert_path" ] || [ ! -f "$key_path" ]; then
      if ! command -v openssl >/dev/null 2>&1; then
        echo "openssl is required to generate the HTTPS certificate" >&2
        return 1
      fi
      local host_ip
      host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
      host_ip="${host_ip:-127.0.0.1}"
      cat > "$TMP/hpc-https.cnf" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
x509_extensions = v3_req
distinguished_name = dn

[dn]
CN = $host_ip

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
IP.2 = $host_ip
EOF
      openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
        -keyout "$key_path" \
        -out "$cert_path" \
        -config "$TMP/hpc-https.cnf" >/dev/null 2>&1
      chmod 600 "$key_path"
      echo "generated self-signed HTTPS certificate: $cert_path"
    fi
    https_env=(VITE_HTTPS_KEY="$key_path" VITE_HTTPS_CERT="$cert_path")
  fi

  (
    cd "$ROOT"
    nohup env \
      VITE_HOST="$WEB_HOST" \
      VITE_PORT="$WEB_PORT" \
      VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-http://127.0.0.1:${API_PORT}}" \
      "${https_env[@]}" \
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
