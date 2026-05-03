# Mirror

Mirror is a local research-presentation assistant with a Vite frontend and FastAPI backend. It listens continuously, answers through local speech, shows the active PDF slide, and uses a lightweight Stack-chan style avatar for lip-flap and idle motion.

## Prerequisites

- Node.js 20 or newer
- Python 3.11 or newer
- PowerShell
- Ollama with `gemma4:e2b`
- ffmpeg for backend Whisper audio decoding

## Setup

```powershell
cd C:\Users\tesul\Mirror
.\scripts\setup.ps1
```

The default avatar is frontend-only. MuseTalk, Wav2Lip, and VibeVoice are no longer part of the default runtime.

## Run

Double-click:

```text
Start-Mirror.bat
```

This opens separate API and frontend terminal windows, then opens `http://127.0.0.1:5173` in the browser.

Command line:

```powershell
npm run dev
```

This starts:

- Vite on `http://127.0.0.1:5173`
- FastAPI via `python -m uvicorn backend.app.main:app --reload` on `http://127.0.0.1:8004`

The Vite dev server proxies `/api` requests to `VITE_API_PROXY_TARGET`.

## Live Conversation

Open `http://127.0.0.1:5173`. Mirror now arms live listening on startup:

- Browser continuous speech recognition is the default STT mode.
- The mic pauses while the avatar speaks, then resumes automatically.
- If browser speech recognition is unavailable, switch Speech recognition to `Backend Whisper windows` in Settings.
- Backend Whisper uses `faster-whisper` on CPU/int8 by default; the first real transcription may download the selected model.
- `/api/speak` uses Windows SAPI by default, splits long speech text into readable chunks, and returns WAV audio.
- Set `MIRROR_TTS_ENGINE=voicevox` and run VOICEVOX locally on `http://127.0.0.1:50021` to try voices such as Zundamon.
- Upload a slide PDF from the Slides panel to index page summaries; questions will select a relevant page before answering.
- By default, Mirror loads `data/decks/general-meeting/General Meeting.pdf` and the prepared narration metadata in `General Meeting.json`.
- The avatar is a Stack-chan style CSS/React character. It lip-flaps from playback volume and sways by listening/speaking state.
- Use Interrupt to stop the current generation or playback and return to listening.
- If Ollama is not running yet, `/api/chat` returns a local fallback response so STT, playback, and avatar motion can still be tested.

## Expected App Layout

Application code lives in the conventional layout below:

```text
frontend/         Vite React frontend package
backend/          FastAPI backend package
tests/            Optional Python API tests
```

If the FastAPI app module differs from `backend.app.main:app`, set `API_APP_MODULE` in `.env`.

## Useful Commands

```powershell
npm run dev       # run frontend and API together
npm run dev:web   # run only Vite
npm run dev:api   # run only FastAPI
npm run build     # build frontend
npm run preview   # preview built frontend
npm run check     # TypeScript typecheck
```

## Project Docs

- [Project Status](docs/PROJECT_STATUS.md)
- [Burndown](docs/BURNDOWN.md)
- [Decisions](docs/DECISIONS.md)
