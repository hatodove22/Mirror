# Decisions

Last updated: 2026-05-04

## Accepted

### DEC-001: Use Vite for the Frontend Dev Server

- Date: 2026-05-01
- Status: Accepted
- Context: The project needs a lightweight frontend development setup.
- Decision: Use Vite with React support in the `frontend/` package.
- Consequences: Frontend source lives under `frontend/src/`, with root npm scripts delegating to the frontend package.

### DEC-002: Use FastAPI for the Backend Service

- Date: 2026-05-01
- Status: Accepted
- Context: The project needs an API service that can start quickly and support typed request/response models.
- Decision: Use FastAPI with Uvicorn as the local ASGI server.
- Consequences: Backend source lives under `backend/`, with the default app target `backend.app.main:app`.

### DEC-003: Keep App Source Out of the Scaffolding Slice

- Date: 2026-05-01
- Status: Accepted
- Context: Multiple workers may be editing the codebase concurrently.
- Decision: This slice only creates root setup/config, scripts, environment examples, README, and docs.
- Consequences: Build and API commands are wired but require app source files from the relevant feature owners before they can fully run.

### DEC-004: Use Ollama Gemma 4 E2B by Default

- Date: 2026-05-01
- Status: Accepted
- Context: The target machine has an RTX 3060 Ti with 8GB VRAM, and the app also needs STT, TTS, and avatar rendering headroom.
- Decision: Default to `gemma4:e2b` through Ollama and expose the model name in settings.
- Consequences: `gemma4:e4b` can be tried manually, but the default favors lower latency and fewer VRAM conflicts.

### DEC-005: Treat VibeVoice as an External Local Service

- Date: 2026-05-01
- Status: Superseded by DEC-009
- Context: VibeVoice-Realtime setup is heavier than the web/API scaffold and may run through WSL2 or a separate Python service.
- Decision: Clone official `microsoft/VibeVoice`, run the Realtime demo locally on port `3000`, and have the backend call its `/stream` WebSocket.
- Consequences: `/api/speak` now wraps VibeVoice PCM16 chunks as WAV and falls back to Windows SAPI/synthetic WAV only when VibeVoice is unavailable. On native Windows the model falls back from `flash_attention_2` to SDPA.

### DEC-006: Use the Existing Photo as the Default Avatar

- Date: 2026-05-01
- Status: Superseded by DEC-023 and DEC-025
- Context: `HirokiOta.jpg` exists in the project root.
- Decision: Copy it to `frontend/public/HirokiOta.jpg` and load it as the initial avatar image.
- Consequences: This was useful for the early photo-avatar prototype. The stable build now uses the Stack-chan style avatar, and the copied photo asset has been removed from the runtime.

### DEC-007: Defer Personal Voice Cloning

- Date: 2026-05-01
- Status: Accepted
- Context: Official VibeVoice-Realtime does not expose open voice cloning, and community options add reliability and safety risk.
- Decision: Keep personal voice as a post-MVP experiment.
- Consequences: MVP uses preset or external-service voices first.

### DEC-008: Let Avatar Image Adjustments Drive the Renderer State

- Date: 2026-05-01
- Status: Accepted
- Context: Image upload and adjustment changes need to be immediately visible on the avatar stage.
- Decision: Keep the normalized image in memory, guard stale image loads with request IDs, and pass zoom/X/Y transform state into the renderer and mouth landmark projection.
- Consequences: Image controls update the displayed avatar and lip-sync overlay together without waiting for another upload or face detection pass.

### DEC-009: Disable VibeVoice for the Default Product Path

- Date: 2026-05-01
- Status: Accepted
- Context: VibeVoice worked but was too heavy and slow for the research-presenter application.
- Decision: Make `windows-sapi` the default `MIRROR_TTS_ENGINE`, keep VibeVoice optional, and add a `voicevox` adapter for lighter character voices such as Zundamon.
- Consequences: Default speech is faster and simpler. VOICEVOX can be evaluated separately without changing the frontend.

### DEC-010: Optimize the Assistant for Spoken Research Explanation

- Date: 2026-05-01
- Status: Accepted
- Context: The final app should explain the user's research on their behalf, not behave like a generic chat bot.
- Decision: Add a research-presenter system prompt, a short chat-history window, token and speech-character limits, and output cleanup for emoji, Markdown, URLs, and hard-to-read symbols.
- Consequences: Responses are shorter and more suitable for TTS, but detailed explanations need to be broken into multiple turns or slide-driven segments.

### DEC-011: Use Windows Key Sends for Slide-Control MVP

- Date: 2026-05-01
- Status: Accepted
- Context: The app needs slide control, but robust PowerPoint/Google Slides integration can wait.
- Decision: Add `/api/slides/action` to send Windows presentation keys for start, stop, next, previous, first, and last.
- Consequences: It works with whichever slideshow is focused. A later task should add deliberate auto-cueing from generated explanations.

### DEC-012: Use Uploaded PDF Text as Slide Context

- Date: 2026-05-01
- Status: Accepted
- Context: The app should explain the user's research deck and answer questions while showing the relevant slide.
- Decision: Upload a PDF, extract page text with `pypdf`, store per-page summaries in memory, and select a slide by keyword overlap for each user question.
- Consequences: The app can pre-index the deck locally and send the slideshow to a matching page. A later pass should add rendered slide previews and improve matching with embeddings or LLM reranking.

### DEC-013: Add Immediate Speech Interruption

- Date: 2026-05-01
- Status: Accepted
- Context: The user needs to interrupt long generation or reading without pausing the whole live conversation.
- Decision: Add a frontend interrupt action that aborts current fetches, stops playback, clears the busy state, and resumes listening.
- Consequences: Long answers no longer trap the conversation loop; backend SAPI synthesis that is already running may finish server-side, but its result is ignored by the client.

### DEC-014: Separate Browser Preview Animation from Prepared Talking-Head Assets

- Date: 2026-05-01
- Status: Proposed
- Context: The current photo mouth patch warp is responsive but does not yet look like a real speaking face.
- Decision: Keep the browser renderer as the instant fallback. Prefer prepared local assets for presentation mode: an idle loop, a compact viseme image set, and cached speech clips. Evaluate MuseTalk first for high-quality preparation, then Wav2Lip if setup is unstable. Use SadTalker mainly for pre-rendered slide narration, and LivePortrait later for subtle head motion.
- Consequences: The live presentation path can stay fast and interruption-friendly. The system needs an avatar preparation step, asset caching, and playback logic for idle loops and viseme timelines.

### DEC-015: Use MuseTalk as the Primary Lip-Sync Route

- Date: 2026-05-01
- Status: Accepted
- Context: The user prefers MuseTalk for realistic mouth movement, and the project can prepare assets ahead of time for fast local presentation playback.
- Decision: Set `MIRROR_AVATAR_ENGINE=musetalk` and treat Wav2Lip/SadTalker/LivePortrait as alternatives rather than the main path.
- Consequences: MuseTalk is installed under `third_party/MuseTalk`; Mirror exposes speech caching and render endpoints for cached MP4 clips.

### DEC-016: Load General Meeting as the Default Research Deck

- Date: 2026-05-01
- Status: Accepted
- Context: The user provided `General Meeting.pdf` and `General Meeting.json` as the default explanation material.
- Decision: Store them under `data/decks/general-meeting`, load the prepared JSON on backend startup, expose it through `/api/slides/deck`, and keep the PDF available at `/api/slides/default-pdf`.
- Consequences: The app starts with the prepared 26-page research explanation without manual PDF upload.

### DEC-017: Pre-render Prepared Deck Narration Through Mirror APIs

- Date: 2026-05-01
- Status: Accepted
- Context: MuseTalk rendering is too slow for live turn-taking, but the General Meeting deck has prepared narration scripts that can be rendered ahead of time.
- Decision: Add a PowerShell batch entry point that reads `General Meeting.json`, uses `short_script` by default, optionally uses `spoken_script`, calls `/api/speech/cache` and `/api/avatar/render`, and records outputs in `data/avatar-cache/general-meeting-manifest.json`.
- Consequences: Presentation playback can reuse cached audio/video clips later. Full-deck rendering remains an explicit operator action because it may take significant GPU time.

### DEC-018: Play Prepared Narration Clips from the Slide Panel

- Date: 2026-05-01
- Status: Accepted
- Context: MuseTalk clips are most useful when the research deck has prepared narration that can be rendered ahead of time.
- Decision: Add a slide `Explain` action in the frontend that reads the active page's prepared script, caches speech, starts a MuseTalk render request, and overlays the resulting MP4 on the avatar stage when available.
- Consequences: Live Q&A remains responsive, while prepared slide explanations can use realistic cached talking-head clips. If a render is still slow, the audio response still plays and the clip is skipped for that turn.

### DEC-019: Defer VOICEVOX Until Character Voice Is the Priority

- Date: 2026-05-01
- Status: Accepted
- Context: The current bottleneck is realistic avatar presentation, not voice character selection.
- Decision: Keep Windows SAPI as the default TTS path and defer VOICEVOX/Zundamon installation until the user explicitly wants that voice direction next.
- Consequences: The MVP has fewer background services. The existing VOICEVOX adapter remains available for later testing.

### DEC-020: Make Slides the Primary Stage

- Date: 2026-05-03
- Status: Accepted
- Context: Full-frame MuseTalk video looked pasted onto the UI, and slides were not visible inside Mirror.
- Decision: Display the PDF slide inside the main stage and show the avatar as a 16:9 presenter picture-in-picture. Manual slide actions interrupt any current speech/video. Idle presentation alternates between prepared slide narration and a short Q&A prompt.
- Consequences: The app behaves more like a research presentation agent. Auto presentation uses cached MuseTalk clips when available and avoids triggering heavy renders during idle loops.

### DEC-021: Replace MuseTalk Default with Wav2Lip

- Date: 2026-05-03
- Status: Accepted
- Context: MuseTalk was too heavy for the current local research-presenter flow, and the user asked to switch the lip-sync engine to Wav2Lip.
- Decision: Set `MIRROR_AVATAR_ENGINE=wav2lip`, keep MuseTalk installed as an optional experiment, and use Wav2Lip for `/api/avatar/render`.
- Consequences: Wav2Lip rendering is serialized because the upstream repo writes shared files under `third_party/Wav2Lip/temp`. Prepared slide explanations now wait for a Wav2Lip clip before playback so the visible mouth motion is synchronized with the audio.

### DEC-022: Render PDF Slides to Images for the UI

- Date: 2026-05-03
- Status: Accepted
- Context: Browser PDF controls made the slide forward control look like a download control, and the PDF was not reliably rendered inside the app.
- Decision: Render the active PDF page to cached PNG images with PyMuPDF and show those images in `SlideStage`.
- Consequences: The slide viewport is a normal image element with no browser PDF toolbar. Uploaded PDFs also become renderable because the backend stores the uploaded PDF path.

### DEC-023: Use a Lightweight Stack-chan Style Avatar by Default

- Date: 2026-05-03
- Status: Accepted
- Context: Photorealistic lip-sync engines were too heavy for the presentation loop and did not add enough value for the current goal.
- Decision: Stop using server-side talking-head rendering in the default flow. Use a CSS/React robot avatar that lip-flaps from Web Audio playback level and gently sways by conversation state.
- Consequences: Responses begin faster, the UI is more stable, and Wav2Lip/MuseTalk remain optional experiments rather than runtime dependencies.

### DEC-024: Do Not Insert Q&A Time After Every Slide

- Date: 2026-05-03
- Status: Accepted
- Context: Asking for Q&A after every slide was too frequent for a natural research explanation.
- Decision: The idle loop now explains prepared slide narration and advances. User questions can still interrupt naturally at any point.
- Consequences: The presenter feels more like a talk and less like a stop-and-go tutorial.

### DEC-025: Freeze the Stable Build Around Stack-chan

- Date: 2026-05-03
- Status: Accepted
- Context: The current app shape is close to the desired research presenter, and the heavy lip-sync experiments are no longer needed for the stable path.
- Decision: Treat the stable build as React/Vite, FastAPI, Windows SAPI, optional VOICEVOX, PDF slide rendering, and the Stack-chan style avatar. Remove active setup scripts and dependency declarations for MuseTalk, Wav2Lip, and VibeVoice.
- Consequences: The project is smaller and faster to install. Historical notes may remain in decision history, but experiment files can be deleted after explicit cleanup confirmation.

### DEC-026: Keep the Default Deck in `data/decks`

- Date: 2026-05-03
- Status: Accepted
- Context: `General Meeting.pdf` existed both at the project root and under the default deck directory.
- Decision: Keep `data/decks/general-meeting/General Meeting.pdf` and `General Meeting.json` as the canonical default presentation assets, and remove the root-level duplicate PDF.
- Consequences: Startup deck loading is deterministic, the workspace root stays clean, and generated slide PNGs can be recreated from the canonical PDF when needed.

### DEC-027: Put Q&A Only After the Final Slide

- Date: 2026-05-03
- Status: Accepted
- Context: Per-slide Q&A pauses are too frequent, but a talk still needs a clear audience-question period.
- Decision: After the final prepared slide narration finishes, start a 3-minute Q&A window with an on-slide countdown ring. During that window, automatic slide narration pauses and live user questions take priority.
- Consequences: The presenter flow feels closer to a real talk, and the app loops back to the first slide after the Q&A timer ends.

### DEC-028: Ground Answers in Ranked Slide Evidence

- Date: 2026-05-03
- Status: Accepted
- Context: Research Q&A should answer while showing the slide that supports the answer.
- Decision: Treat each slide as a retrieval unit using title, summary, scripts, keywords, notes, and likely Q&A. `/api/slides/select` returns ranked candidates; the frontend displays the primary evidence slide and passes only the selected evidence text to the LLM for factual grounding.
- Consequences: Answers are easier to audit against the displayed slide. The retrieval scorer is lightweight and local, and can later be replaced by embeddings without changing the UI contract.

### DEC-029: Prefer Browser Preloading for Faster Slide Changes

- Date: 2026-05-03
- Status: Accepted
- Context: Rendering slide PNGs on first display can make slide changes feel slow.
- Decision: Preload the active slide, nearby slides, and evidence candidate slides in the frontend using the existing PNG endpoint.
- Consequences: Common next/previous and evidence jumps feel faster without adding another backend queue.

### DEC-030: Share the Conversation Flow Between Voice and Keyboard

- Date: 2026-05-04
- Status: Accepted
- Context: Users need to ask questions even when speech recognition is inconvenient or unavailable.
- Decision: Add a keyboard chat composer to the conversation panel and route typed messages through the same slide-evidence selection, LLM answer, and speech playback flow as voice input.
- Consequences: Voice and text stay behaviorally consistent. Typed messages can interrupt an active reply, then Mirror resumes listening if live mode is enabled.

### DEC-031: Do Not Drive External Slideshow Keys During Evidence Search

- Date: 2026-05-04
- Status: Accepted
- Context: Chat questions should change Mirror's in-app evidence slide, but they should not restart an external slideshow or jump to page 1 when retrieval has no strong match.
- Decision: Frontend slide evidence search calls `/api/slides/select` with `auto_show: false` and passes the current page. The backend keeps the current page first when all retrieval scores are zero.
- Consequences: Manual slide controls remain available, while Q&A evidence selection is stable and does not reset the presentation.

### DEC-032: Let Evidence Drive the Visible Slide During Q&A

- Date: 2026-05-04
- Status: Accepted
- Context: Showing an evidence badge is not enough if the central slide image can remain on another page.
- Decision: While evidence candidates are active, the primary evidence page drives the visible slide image and notes. Manual slide actions or automatic narration clear the evidence state.
- Consequences: During question answering, the audience sees the slide that grounds the answer.

### DEC-033: Sequence Multi-Slide Evidence During Answer Playback

- Date: 2026-05-04
- Status: Accepted
- Context: Some answers depend on multiple slides, and holding only the first slide hides part of the reasoning.
- Decision: When multiple evidence candidates are active, cycle the visible slide through those candidates while the answer audio is playing. During final Q&A waiting, center Stack-chan with a question-waiting bubble and hide the small picture-in-picture avatar.
- Consequences: Answers can visually walk through several supporting slides, and the Q&A wait state is obvious to the audience.

### DEC-034: Advance Auto Narration Immediately After Speech

- Date: 2026-05-04
- Status: Accepted
- Context: A long idle delay after every prepared narration makes the talk feel slow.
- Decision: For non-final prepared slide narration, clear the idle delay as soon as speech playback finishes so the next slide explanation can begin on the next presenter tick.
- Consequences: The automatic slide explanation feels more rhythmic while the final-slide Q&A timer still pauses the loop.

## Proposed

- Decide CI provider and required checks.
- Decide whether frontend and backend will share generated API types.

## Historical Notes

DEC-005, DEC-015, DEC-017, DEC-018, and DEC-021 describe useful lip-sync and TTS experiments, but they are no longer part of the stable runtime. The current frozen MVP follows DEC-023, DEC-025, DEC-027, DEC-028, DEC-033, and DEC-034.
