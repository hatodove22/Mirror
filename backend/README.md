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
- `MIRROR_TTS_ENGINE`: `windows-sapi`, `voicevox`, or `style-bert-vits2`. Defaults to `windows-sapi`.
- `MIRROR_AVATAR_ENGINE`: defaults to `stack-chan`, which is rendered entirely in the frontend.
- `MIRROR_SPEAK_MAX_CHARS`: maximum text chunk length for one speech synthesis call. Defaults to `260`.
- `MIRROR_STYLE_BERT_VITS2_URL`: local Style-Bert-VITS2 FastAPI server URL. Defaults to `http://127.0.0.1:5000`.
- `MIRROR_STYLE_BERT_VITS2_MODEL`: optional Style-Bert-VITS2 `model_name`.
- `MIRROR_STYLE_BERT_VITS2_SPEAKER`: optional `speaker_name` or numeric `speaker_id`.
- `MIRROR_STYLE_BERT_VITS2_STYLE`: optional style name. Defaults to `Neutral`.
- `MIRROR_STYLE_BERT_VITS2_STYLE_WEIGHT`: optional style strength. Defaults to `1.0`.
- `MIRROR_STYLE_BERT_VITS2_LENGTH`: optional speech length/speed control. Defaults to `1.0`.
- `MIRROR_STYLE_BERT_VITS2_REFERENCE_AUDIO`: optional local WAV path for Style-Bert-VITS2 style reference. Use only recordings you own or have explicit permission to use.
- `MIRROR_VOICEVOX_URL`: optional VOICEVOX engine URL for voices such as Zundamon. Defaults to `http://127.0.0.1:50021`.
- `MIRROR_VOICEVOX_SPEAKER`: default VOICEVOX speaker id. Defaults to `3`.
- `MIRROR_FFMPEG_PATH`: optional explicit ffmpeg executable path; winget `Gyan.FFmpeg` is auto-detected.
- `MIRROR_DEFAULT_SLIDE_VIDEO`: optional prepared MP4 path. If unset, Mirror detects JP/EN videos beside the default deck or at the project root.
- `MIRROR_DEFAULT_SLIDE_VIDEO_CUES`: optional JSON cue file for mapping slide pages to video times.
- `BACKEND_CORS_ORIGINS`: comma-separated allowed origins. Defaults to `*`.
- `BACKEND_REQUEST_TIMEOUT_SECONDS`: upstream timeout for non-streaming calls. Defaults to `120`.

## Endpoints

- `GET /api/health`: service status and configured local adapters.
- `POST /api/chat`: Ollama chat adapter. Accepts `{ "model": "...", "messages": [...], "stream": false }`. When `stream` is true, returns Ollama newline-delimited JSON.
- `POST /api/transcribe`: upload a file as multipart form field `file`. Text files are passed through; audio files use local `faster-whisper` when available.
- `POST /api/speak`: speech adapter. Accepts `{ "text": "...", "voice": "optional" }`, normalizes text for reading, splits long text, and returns `audio/wav`.
- `POST /api/slides/action`: sends Windows slide-control keys for `next`, `previous`, `first`, `last`, `start`, or `stop`.
- `POST /api/slides/select`: ranks relevant slide evidence for a question and returns the selected slide plus candidate slides.
- `GET /api/slides/deck`: returns the active deck, prepared video URLs, and optional video cues.
- `GET /api/slides/video`: serves the default prepared MP4 when configured.
- `GET /api/slides/video/{language}`: serves the prepared `ja`/`en` MP4 for language-specific presentation playback.
- `GET /api/slides/page/{page}.png`: renders the active PDF slide page to a cached PNG for in-app display.

## Prepared Slide Videos

For the default General Meeting deck, Mirror detects these files without additional configuration:

```text
General Meeting_JP.mp4
General Meeting_EN.mp4
```

Optional cue files can be added as `General Meeting_JP.video.json` and `General Meeting_EN.video.json`. If cues are absent, the frontend treats the selected language video as a full presentation video. During Q&A the frontend switches back to PDF slide PNGs for evidence display.

## Style-Bert-VITS2

Mirror integrates Style-Bert-VITS2 as an optional local HTTP adapter. `Start-Mirror.bat` starts the local Style-Bert-VITS2 FastAPI server for the trained `Ota` model, then starts the Mirror API with:

```powershell
MIRROR_TTS_ENGINE=style-bert-vits2
MIRROR_STYLE_BERT_VITS2_URL=http://127.0.0.1:5000
MIRROR_STYLE_BERT_VITS2_MODEL=Ota
MIRROR_STYLE_BERT_VITS2_SPEAKER=Ota
```

Mirror calls `POST /voice` and falls back to Windows SAPI if the Style-Bert-VITS2 server is unavailable or returns non-WAV audio.

For personal voice matching, train or configure a Style-Bert-VITS2 model from recordings of your own voice, then set `MIRROR_STYLE_BERT_VITS2_MODEL` and `MIRROR_STYLE_BERT_VITS2_SPEAKER`. `MIRROR_STYLE_BERT_VITS2_REFERENCE_AUDIO` may be used as a local reference-audio path for style control, but it should be your own recording or material you have explicit permission to use.
