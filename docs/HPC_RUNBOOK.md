# Mirror HPC Runbook

This note summarizes the basic commands for running Mirror on a Linux HPC host over SSH.

It assumes the project lives at:

```bash
~/Mirror
```

Do not commit passwords, `.env`, voice recordings, generated videos, or model weights. The Ota Style-Bert-VITS2 model should be placed outside Git under:

```bash
~/Mirror/third_party/Style-Bert-VITS2/model_assets/Ota/
```

Prepared presentation videos, if used, should be placed outside Git at:

```bash
~/Mirror/General Meeting_JP.mp4
~/Mirror/General Meeting_EN.mp4
```

## Connect From Your PC

For private access, open an SSH tunnel and keep this terminal open:

```powershell
ssh -L 5173:127.0.0.1:5173 <user>@<hpc-host>
```

Then open:

```text
http://127.0.0.1:5173/
```

Use `http://`, not `https://`.

For direct port access, start the frontend with `VITE_HOST=0.0.0.0` and open:

```text
http://<hpc-host>:5173/
```

In this mode, only the frontend dev server should be exposed. Keep the Mirror API, Style-Bert-VITS2, and Ollama bound to `127.0.0.1`; the frontend proxies `/api` to the local backend.

## Start Services

Run these on the HPC host.

```bash
cd ~/Mirror
chmod +x scripts/hpc-start.sh scripts/hpc-stop.sh scripts/hpc-status.sh
scripts/hpc-start.sh
```

The start script launches Ollama, Style-Bert-VITS2, the Mirror API, and the frontend. It is safe to run again; already-listening services are skipped.

The default direct-access URL is:

```text
http://<hpc-host>:5173/
```

## Stop Services

```bash
cd ~/Mirror
scripts/hpc-stop.sh
```

## Check Status

```bash
cd ~/Mirror
scripts/hpc-status.sh
```

## Manual Commands

The helper scripts above are preferred. The following commands show what they do internally.

```bash
cd ~/Mirror
mkdir -p tmp
```

Start Ollama:

```bash
nohup env \
  CUDA_VISIBLE_DEVICES=1 \
  OLLAMA_HOST=127.0.0.1:11434 \
  OLLAMA_MODELS=$HOME/.ollama/models \
  ollama serve > tmp/hpc-ollama.log 2>&1 &
echo $! > tmp/hpc-ollama.pid
```

Start Style-Bert-VITS2:

```bash
cd ~/Mirror/third_party/Style-Bert-VITS2
nohup env \
  CUDA_VISIBLE_DEVICES=1 \
  venv/bin/python server_fastapi.py > ~/Mirror/tmp/hpc-sbv2.log 2>&1 &
echo $! > ~/Mirror/tmp/hpc-sbv2.pid
```

Start the Mirror API:

```bash
cd ~/Mirror
nohup env \
  API_HOST=127.0.0.1 \
  API_PORT=8004 \
  API_RELOAD=false \
  MIRROR_FFMPEG_PATH=/usr/bin/ffmpeg \
  MIRROR_OLLAMA_URL=http://127.0.0.1:11434 \
  MIRROR_LLM_MODEL=gemma4:e2b \
  MIRROR_TTS_ENGINE=style-bert-vits2 \
  MIRROR_STYLE_BERT_VITS2_URL=http://127.0.0.1:5000 \
  MIRROR_STYLE_BERT_VITS2_MODEL=Ota \
  MIRROR_STYLE_BERT_VITS2_SPEAKER=Ota \
  MIRROR_STYLE_BERT_VITS2_STYLE=Neutral \
  MIRROR_SPEAK_MAX_CHARS=260 \
  .venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8004 \
  > tmp/hpc-api.log 2>&1 &
echo $! > tmp/hpc-api.pid
```

Start the frontend:

```bash
cd ~/Mirror
nohup env \
  VITE_HOST=0.0.0.0 \
  VITE_PORT=5173 \
  VITE_API_PROXY_TARGET=http://127.0.0.1:8004 \
  npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173 \
  > tmp/hpc-web.log 2>&1 &
echo $! > tmp/hpc-web.pid
```

## Manual Stop Commands

The helper script is preferred:

```bash
cd ~/Mirror
scripts/hpc-stop.sh
```

If you need to stop processes by hand:

```bash
cd ~/Mirror
for f in tmp/hpc-web.pid tmp/hpc-api.pid tmp/hpc-sbv2.pid tmp/hpc-ollama.pid; do
  if [ -f "$f" ]; then
    kill "$(cat "$f")" 2>/dev/null || true
  fi
done
```

If a port is still occupied, clean it up by port:

```bash
for port in 5173 8004 5000 11434; do
  pids=$(ss -ltnp 2>/dev/null \
    | awk -v p=":$port" '$0 ~ p {print $NF}' \
    | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' \
    | sort -u)
  if [ -n "$pids" ]; then
    echo "stopping port $port: $pids"
    kill $pids 2>/dev/null || true
  fi
done
```

## Manual Status Commands

Ports:

```bash
ss -ltnp | grep -E ':(5173|8004|5000|11434)\b' || true
```

Mirror health:

```bash
curl -fsS http://127.0.0.1:8004/api/health | python3 -m json.tool
```

Ollama:

```bash
curl -fsS http://127.0.0.1:11434/api/tags | python3 -m json.tool
```

Style-Bert-VITS2:

```bash
curl -fsS http://127.0.0.1:5000/models/info | python3 -m json.tool
```

Prepared videos:

```bash
curl -fsS -r 0-0 -D - -o /tmp/video-ja.byte http://127.0.0.1:8004/api/slides/video/ja
curl -fsS -r 0-0 -D - -o /tmp/video-en.byte http://127.0.0.1:8004/api/slides/video/en
```

## Logs

```bash
tail -f ~/Mirror/tmp/hpc-web.log
tail -f ~/Mirror/tmp/hpc-api.log
tail -f ~/Mirror/tmp/hpc-sbv2.log
tail -f ~/Mirror/tmp/hpc-ollama.log
```

## Quick Smoke Test

```bash
curl -fsS http://127.0.0.1:8004/api/health | python3 -m json.tool

curl -fsS \
  -H 'Content-Type: application/json' \
  -d '{"action":"next"}' \
  http://127.0.0.1:8004/api/slides/action
```

On Linux, slide action should return:

```json
{"ok":true,"action":"next","mode":"internal"}
```

That means Mirror controls the browser-based slide/video view internally, instead of sending OS-level PowerPoint key events.
