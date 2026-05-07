# Mirror Docs

This folder keeps the working record for the Mirror research-presentation assistant.

- `PROJECT_STATUS.md`: current stable MVP state, task board, verification log, and known notes.
- `BURNDOWN.md`: points, burndown chart, and approximate session time log.
- `DECISIONS.md`: decision history, including superseded VibeVoice, MuseTalk, and Wav2Lip experiments.
- `SLIDE_NARRATION_PROMPT.md`: prompt for preparing slide narration, Q&A notes, and retrieval metadata from a PDF deck.

The stable runtime is React/Vite, FastAPI, Ollama `gemma4:e2b`, Windows SAPI TTS, browser or local Whisper STT, prepared JP/EN presentation videos, PDF slide images for Q&A, and a Stack-chan style avatar driven by response or video audio levels.
