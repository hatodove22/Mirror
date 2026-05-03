# Mirror Backend

FastAPI backend slice for local development on Windows.

## Setup

```powershell
cd C:\Users\tesul\Mirror\backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Environment

- `MIRROR_OLLAMA_URL`: Ollama server URL. Defaults to `http://127.0.0.1:11434`.
- `MIRROR_LLM_MODEL`: default model for `/api/chat`. Defaults to `gemma4:e2b`.
- `MIRROR_TTS_ENGINE`: `windows-sapi` or `voicevox` for the stable runtime. Defaults to `windows-sapi`.
- `MIRROR_AVATAR_ENGINE`: defaults to `stack-chan`, which is rendered entirely in the frontend.
- `MIRROR_SPEAK_MAX_CHARS`: maximum text chunk length for one speech synthesis call. Defaults to `260`.
- `MIRROR_VOICEVOX_URL`: optional VOICEVOX engine URL for voices such as Zundamon. Defaults to `http://127.0.0.1:50021`.
- `MIRROR_VOICEVOX_SPEAKER`: default VOICEVOX speaker id. Defaults to `3`.
- `MIRROR_FFMPEG_PATH`: optional explicit ffmpeg executable path; winget `Gyan.FFmpeg` is auto-detected.
- `BACKEND_CORS_ORIGINS`: comma-separated allowed origins. Defaults to `*`.
- `BACKEND_REQUEST_TIMEOUT_SECONDS`: upstream timeout for non-streaming calls. Defaults to `120`.

## Endpoints

- `GET /api/health`: service status and configured local adapters.
- `POST /api/chat`: Ollama chat adapter. Accepts `{ "model": "...", "messages": [...], "stream": false }`. When `stream` is true, returns Ollama newline-delimited JSON.
- `POST /api/transcribe`: upload a file as multipart form field `file`. Text files are passed through; audio files use local `faster-whisper` when available.
- `POST /api/speak`: speech adapter. Accepts `{ "text": "...", "voice": "optional" }`, normalizes text for reading, splits long text, and returns `audio/wav`.
- `POST /api/slides/action`: sends Windows slide-control keys for `next`, `previous`, `first`, `last`, `start`, or `stop`.
- `POST /api/slides/select`: ranks relevant slide evidence for a question and returns the selected slide plus candidate slides.
- `GET /api/slides/page/{page}.png`: renders the active PDF slide page to a cached PNG for in-app display.
