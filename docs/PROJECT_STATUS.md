# Project Status

Last updated: 2026-05-04

## Stable MVP State

Mirror now has a runnable vertical slice:

- FastAPI backend with health, chat, transcription, and speech endpoints.
- React/Vite frontend with conversation UI, keyboard chat input, settings, microphone capture, audio playback, slide stage, and Stack-chan style avatar.
- Live conversation starts automatically, pauses while Mirror replies, then resumes listening.
- Keyboard chat input is also available; typed questions use the same RAG slide evidence, LLM answer, and optional speech playback path as voice input.
- Chat and voice questions no longer send external slideshow start keys during evidence search; if no slide evidence matches, the current slide is kept instead of jumping to the first slide.
- During Q&A, the primary evidence slide is now the displayed slide image and notes source, not just a badge.
- If Q&A evidence spans multiple slides, Mirror cycles through the evidence slides while the answer audio is playing.
- During the final Q&A wait window, Stack-chan appears centered with a question-waiting speech bubble.
- Automatic prepared narration now advances to the next slide immediately after speech finishes instead of waiting for another idle delay.
- Speech recognition defaults to browser continuous recognition and can switch to backend `faster-whisper` windows; backend Whisper is pinned to CPU/int8 to avoid missing CUDA DLL failures.
- Ollama 0.22.1 is installed, `gemma4:e2b` is pulled, and the frontend now talks to the refreshed API through `/api` proxied to port `8004`.
- VibeVoice Realtime was tested and then removed from the default product path because it is too heavy for this app's live flow.
- TTS now defaults to Windows SAPI, splits long text into readable chunks, and has an optional VOICEVOX adapter for voices such as Zundamon.
- Prompting is tuned for a research-presenter avatar: short Japanese speech, no emoji, no Markdown, no hard-to-read symbols.
- Slide control has a Windows key-send endpoint plus UI controls for start, previous, next, and stop.
- PDF slide decks can be uploaded; backend extracts page text, builds per-page summaries, and can select a relevant slide for a question.
- `data/decks/general-meeting/General Meeting.pdf` and `General Meeting.json` are the default deck and prepared explanation source.
- Generated answers receive the selected slide summary as context and the app sends the slideshow to the selected page.
- Question answers now use a RAG-style slide evidence flow: the backend ranks top slides, the frontend displays the primary evidence slide, and the LLM receives only the selected evidence context for factual grounding.
- A strong-AI prompt for preparing per-slide narration and Q&A metadata is stored in `docs/SLIDE_NARRATION_PROMPT.md`.
- Current speech/generation can be interrupted from the conversation panel.
- Photorealistic lip sync was dropped from the active product path.
- The default presentation avatar is now a lightweight Stack-chan style robot that lip-flaps from playback volume and gently sways while idle/listening/speaking.
- The slide panel has an `Explain` action that reads the prepared narration for the current slide without waiting for server-side avatar video rendering.
- PDF pages are rendered server-side to PNG via PyMuPDF and shown as plain images in the Mirror UI, avoiding browser PDF toolbar/download controls.
- Slides are now displayed inside the Mirror UI, with the avatar shown as a 16:9 presenter picture-in-picture over the slide area.
- When no user question arrives, the app loops through prepared slide narration and advances slides; live user turns interrupt and take priority.
- After the final prepared slide narration finishes, the app enters a 3-minute Q&A window with an on-slide countdown ring, then restarts from the first slide.
- Slide image switching is faster because the frontend preloads the active page, adjacent pages, and evidence candidate pages.
- The Stack-chan style avatar is more active, with stronger talk sway, antenna glow, eye motion, and small arm movement.
- ffmpeg is installed and auto-detected for backend Whisper decoding.
- `Start-Mirror.bat` can be double-clicked to launch the API, frontend, and browser.
- Heavy experiment worktrees and generated assets for VibeVoice, MuseTalk, Wav2Lip, old avatar photos, and render caches were removed from the stable workspace.
- Smoke tests and build checks pass.

## How to Read These Docs

- `README.md` is the operator quick start.
- `docs/PROJECT_STATUS.md` is the current task board and verification log.
- `docs/BURNDOWN.md` records points and approximate elapsed work by session.
- `docs/DECISIONS.md` keeps the technical decision history, including superseded VibeVoice, MuseTalk, and Wav2Lip experiments.

## Todo Board

| ID | Points | Work Item | Status | Notes |
| --- | ---: | --- | --- | --- |
| MIR-001 | 13 | Project scaffold | Done | Root scripts, Vite frontend, FastAPI backend, env template. |
| MIR-002 | 8 | Local dependency health | Done | `/api/health` reports backend, Ollama URL, model, STT/TTS backend. |
| MIR-003 | 13 | Ollama/Gemma adapter | Done | `/api/chat`, default `gemma4:e2b`, frontend model setting. Ollama is installed and model is pulled. |
| MIR-004 | 8 | STT MVP | Done | Browser continuous STT by default; backend `faster-whisper` installed for local audio windows. |
| MIR-005 | 13 | VibeVoice TTS adapter | Replaced | Verified, then disabled. Windows SAPI is now the default TTS path. |
| MIR-006 | 13 | Avatar display | Replaced | The old photo avatar path was replaced by the Stack-chan style presentation avatar. |
| MIR-007 | 8 | Audio-synced lip movement | Done | Presentation mode uses a lightweight Stack-chan style avatar driven by Web Audio volume. |
| MIR-008 | 8 | UI integration | Done | Conversation, settings, privacy toggles, logs, status states, slide controls. |
| MIR-009 | 8 | E2E local flow | Done | Live loop, Ollama, Windows SAPI playback, and avatar lip sync are wired. |
| MIR-010 | 5 | Privacy/safety display | Done | Local-only defaults and microphone/transcript toggles. |
| MIR-011 | 8 | Verification and tuning | Done | Build, import, smoke tests, and browser verification pass for the stable flow. |
| MIR-012 | 13 | Personal voice experiment | Not Started | MVP follow-up. Official VibeVoice Realtime does not support open voice cloning. |
| MIR-013 | 5 | Lightweight TTS strategy | Done | `MIRROR_TTS_ENGINE=windows-sapi` default, optional `voicevox`, speech chunking. |
| MIR-014 | 5 | Research presenter prompting | Done | System prompt, short history window, token/character controls, emoji/Markdown cleanup. |
| MIR-015 | 5 | Slide control MVP | Done | Manual slide keys plus PDF upload, page summaries, question-based slide selection. |
| MIR-017 | 5 | Speech interrupt | Done | Interrupt aborts current request/playback and resumes listening. |
| MIR-016 | 8 | Realistic photo lip sync | Replaced | Photorealistic lip sync was intentionally dropped in favor of a lightweight robot avatar. |
| MIR-018 | 0 | Slide narration generation prompt | Done | Prompt file created for a strong AI to convert PDF slides into speech scripts, Q&A notes, and search metadata. |
| MIR-019 | 0 | Avatar animation method survey | Archived | Used to decide against photorealistic lip sync for the stable build. |
| MIR-020 | 0 | Pre-generated avatar runtime plan | Archived | Superseded by the lightweight Stack-chan avatar. |
| MIR-021 | 1 | Double-click launcher | Done | `Start-Mirror.bat` starts API, frontend, and browser. |
| MIR-022 | 3 | Default General Meeting deck | Done | Moved PDF/JSON into `data/decks/general-meeting`, auto-loads 26 prepared slide scripts. |
| MIR-023 | 0 | MuseTalk selected for lip sync | Archived | Removed from default scripts and docs for the stable build. |
| MIR-024 | 6 | MuseTalk local setup | Archived | Heavy experimental setup is no longer required. |
| MIR-025 | 5 | MuseTalk render API | Archived | Server-side avatar rendering is no longer used by the frontend. |
| MIR-026 | 2 | Batch pre-render General Meeting narration | Archived | Pre-rendered talking-head assets are no longer part of the stable flow. |
| MIR-027 | 3 | Frontend MuseTalk clip playback | Archived | Replaced by Stack-chan avatar motion. |
| MIR-028 | 5 | In-app slide presenter loop | Done | PDF slide preview, presenter PiP, manual slide interrupt, and idle explain/Q&A loop. |
| MIR-029 | 4 | Server-rendered slide images | Done | `/api/slides/page/{page}.png` renders cached PNGs from the active PDF via PyMuPDF. |
| MIR-030 | 6 | Wav2Lip default engine | Replaced | Wav2Lip remains available, but no longer drives the default presentation UI. |
| MIR-031 | 3 | Stack-chan style avatar | Done | CSS/React robot avatar lip-flaps from playback level and sways by conversation state. |
| MIR-032 | 2 | Simplify idle presenter loop | Done | Removed per-slide Q&A pauses from the active idle flow; it now explains and advances. |
| MIR-033 | 1 | Stable build cleanup | Done | Removed heavy experiment folders, stale logs/caches, unused avatar photos, active scripts, dependency declarations, and obsolete docs. |
| MIR-034 | 2 | Final Q&A countdown | Done | Last-slide narration starts a 3-minute Q&A window with an on-slide countdown ring before the presenter loops back to the first slide. |
| MIR-035 | 5 | Slide evidence RAG | Done | `/api/slides/select` returns ranked candidates; answers use top evidence slides and show the primary evidence page. |
| MIR-036 | 2 | Faster slide switching | Done | Frontend preloads active, neighboring, and evidence slide PNGs. |
| MIR-037 | 2 | More active Stack-chan avatar | Done | Added stronger speaking sway, antenna glow, eye motion, and small arm movement. |
| MIR-038 | 3 | Keyboard chat input | Done | Conversation panel accepts typed questions with Enter-to-send and Shift+Enter newline; it uses the same RAG/TTS path as voice input. |
| MIR-039 | 1 | Chat slide-jump fix | Done | Evidence search no longer sends slideshow start keys, and no-match queries preserve the current slide. |
| MIR-040 | 1 | Evidence slide display lock | Done | Q&A display now prioritizes the primary evidence slide image and notes while evidence is active. |
| MIR-041 | 3 | Sequential evidence display | Done | Multi-slide evidence is displayed in order during answer playback; final Q&A wait shows centered Stack-chan. |
| MIR-042 | 1 | Faster auto narration advance | Done | Non-final prepared narration clears the idle delay as soon as speech playback finishes. |

## Verification

Passed:

- `cmd /c npm install`
- `cmd /c npm install` in `frontend`
- `cmd /c npm --prefix frontend run build`
- `py -m compileall backend`
- Backend import smoke: `from app.main import app`
- Backend smoke tests: `11 passed`
- `/api/health` reports `stt_backend: faster-whisper:base:cpu:int8`.
- `/api/health` reports `tts_engine: windows-sapi`, `speech_backend: windows-sapi`, and the ffmpeg path.
- `/api/transcribe` on a generated WAV returns `engine: faster-whisper` instead of a 500; the English test phrase was recognized phonetically as Japanese because backend Whisper currently uses `language="ja"`.
- Ollama API reports `gemma4:e2b`; Mirror API on the active `8004` backend returns real `message.content` with `think=false`.
- `/api/speak` returns `audio/wav` with `X-Speech-Backend: windows-sapi`; Japanese test output was 439520 bytes.
- `/api/slides/deck` returns the current uploaded PDF summary state.
- `/api/slides/deck` returns the default `General Meeting.pdf` deck with 26 prepared pages on startup.
- `/api/slides/default-pdf` returns the default PDF file.
- `/api/health` reports `avatar_engine: stack-chan` with a frontend-only avatar detail.
- `/api/speech/cache` writes valid WAV assets under `data/avatar-cache/speech`.
- `cmd /c npm --prefix frontend run build`
- `py -m pytest`: `11 passed`
- `/api/slides/page/1.png?width=640` returns a 244005-byte PNG through the backend and Vite proxy.
- Browser verification at `http://127.0.0.1:5173`: default `General Meeting.pdf` loaded as an in-app image, `Explain` read the prepared narration, the Stack-chan style avatar appeared, and no `video` element or `/api/avatar/render` call was used.
- Frontend build verifies the final-slide Q&A countdown state and `SlideStage` overlay compile successfully.
- `/api/slides/select` returns `selected` plus three ranked `candidates` with `evidence_text`.
- Frontend build verifies evidence badges, related slide chips, slide preloading, and active Stack-chan motion compile successfully.
- Frontend build verifies the keyboard composer and typed-message flow compile successfully.
- `/api/slides/select` with no matching query and `current_page: 5` returns slide 5 through both the API and Vite proxy.
- Frontend build verifies the displayed slide is derived from the primary evidence page while evidence is active.
- Frontend build verifies evidence slide sequencing, centered Q&A waiting avatar, and immediate auto-advance compile successfully.

Known notes:

- PowerShell blocks `npm.ps1`; use `npm.cmd` or `cmd /c npm ...`.
- Stale unkillable listeners remain on old API ports `8002` and `8003`; the active backend is now `8004`, and the frontend uses relative `/api`.
- Four old API log files are currently locked by stale Windows handles and can be deleted after those handles close or after a restart: `api-8002.err.log`, `api-8002.log`, `api-8003.err.log`, and `api-8003.log`.
- The canonical default deck remains at `data/decks/general-meeting/General Meeting.pdf` with `General Meeting.json`; the root-level duplicate PDF was removed.
- VOICEVOX/Zundamon is deferred unless character voice becomes the next priority; it would require a local VOICEVOX engine on `http://127.0.0.1:50021` and `MIRROR_TTS_ENGINE=voicevox`.
Suggested final live checks:

- Manually allow microphone access in the browser and confirm continuous browser STT final transcripts.
- Browser-test `http://127.0.0.1:5173` with microphone, Windows SAPI playback, slide controls, Stack-chan avatar motion, slide-evidence Q&A, and user interruption.
