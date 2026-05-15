from __future__ import annotations

import asyncio
import hashlib
import io
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
from urllib.parse import urlencode, urlparse, urlunparse
import wave
from pathlib import Path
from typing import Any, AsyncIterator, Literal

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field


OLLAMA_BASE_URL = os.getenv("MIRROR_OLLAMA_URL", os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")).rstrip("/")
DEFAULT_LLM_MODEL = os.getenv("MIRROR_LLM_MODEL", os.getenv("OLLAMA_MODEL", "gemma4:e2b"))
VIBEVOICE_BASE_URL = os.getenv("MIRROR_VIBEVOICE_URL", os.getenv("VIBEVOICE_BASE_URL", "")).rstrip("/")
TTS_ENGINE = os.getenv("MIRROR_TTS_ENGINE", "windows-sapi").strip().lower()
if TTS_ENGINE != "vibevoice":
    VIBEVOICE_BASE_URL = ""
STYLE_BERT_VITS2_BASE_URL = os.getenv(
    "MIRROR_STYLE_BERT_VITS2_URL",
    "http://127.0.0.1:5000",
).rstrip("/")
STYLE_BERT_VITS2_MODEL = os.getenv("MIRROR_STYLE_BERT_VITS2_MODEL", "").strip()
STYLE_BERT_VITS2_SPEAKER = os.getenv("MIRROR_STYLE_BERT_VITS2_SPEAKER", "").strip()
STYLE_BERT_VITS2_STYLE = os.getenv("MIRROR_STYLE_BERT_VITS2_STYLE", "Neutral").strip()
STYLE_BERT_VITS2_STYLE_WEIGHT = float(os.getenv("MIRROR_STYLE_BERT_VITS2_STYLE_WEIGHT", "1.0"))
STYLE_BERT_VITS2_LENGTH = float(os.getenv("MIRROR_STYLE_BERT_VITS2_LENGTH", "1.0"))
STYLE_BERT_VITS2_REFERENCE_AUDIO = os.getenv("MIRROR_STYLE_BERT_VITS2_REFERENCE_AUDIO", "").strip()
VOICEVOX_BASE_URL = os.getenv("MIRROR_VOICEVOX_URL", "http://127.0.0.1:50021").rstrip("/")
VOICEVOX_SPEAKER = int(os.getenv("MIRROR_VOICEVOX_SPEAKER", "3"))
SPEAK_MAX_CHARS = int(os.getenv("MIRROR_SPEAK_MAX_CHARS", "260"))
REQUEST_TIMEOUT_SECONDS = float(os.getenv("MIRROR_REQUEST_TIMEOUT_SECONDS", os.getenv("BACKEND_REQUEST_TIMEOUT_SECONDS", "120")))
CORS_ORIGINS = os.getenv("MIRROR_CORS_ORIGINS", os.getenv("BACKEND_CORS_ORIGINS", "*")).split(",")
WHISPER_MODEL = os.getenv("MIRROR_WHISPER_MODEL", "base")
WHISPER_DEVICE = os.getenv("MIRROR_WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.getenv("MIRROR_WHISPER_COMPUTE_TYPE", "int8")
ALLOW_CHAT_FALLBACK = os.getenv("MIRROR_ALLOW_CHAT_FALLBACK", "true").lower() in {"1", "true", "yes"}
VIBEVOICE_CFG_SCALE = float(os.getenv("MIRROR_VIBEVOICE_CFG_SCALE", "1.5"))
VIBEVOICE_STEPS = os.getenv("MIRROR_VIBEVOICE_STEPS", "").strip()
FFMPEG_PATH = os.getenv("MIRROR_FFMPEG_PATH", "").strip()
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SLIDE_PDF = Path(
    os.getenv(
        "MIRROR_DEFAULT_SLIDE_PDF",
        str(PROJECT_ROOT / "data" / "decks" / "general-meeting" / "General Meeting.pdf"),
    )
)
DEFAULT_SLIDE_JSON = Path(
    os.getenv(
        "MIRROR_DEFAULT_SLIDE_JSON",
        str(PROJECT_ROOT / "data" / "decks" / "general-meeting" / "General Meeting.json"),
    )
)
DEFAULT_SLIDE_VIDEO = Path(
    os.getenv(
        "MIRROR_DEFAULT_SLIDE_VIDEO",
        str(DEFAULT_SLIDE_PDF.with_suffix(".mp4")),
    )
)
DEFAULT_SLIDE_VIDEO_CUES = Path(
    os.getenv(
        "MIRROR_DEFAULT_SLIDE_VIDEO_CUES",
        str(DEFAULT_SLIDE_PDF.with_suffix(".video.json")),
    )
)
AVATAR_ENGINE = os.getenv("MIRROR_AVATAR_ENGINE", "stack-chan").strip().lower()
MUSE_TALK_DIR = Path(os.getenv("MIRROR_MUSETALK_DIR", str(PROJECT_ROOT / "third_party" / "MuseTalk")))
MUSE_TALK_PYTHON = Path(
    os.getenv("MIRROR_MUSETALK_PYTHON", str(MUSE_TALK_DIR / ".venv-musetalk" / "Scripts" / "python.exe"))
)
WAV2LIP_DIR = Path(os.getenv("MIRROR_WAV2LIP_DIR", str(PROJECT_ROOT / "third_party" / "Wav2Lip")))
WAV2LIP_PYTHON = Path(
    os.getenv("MIRROR_WAV2LIP_PYTHON", str(WAV2LIP_DIR / ".venv-wav2lip" / "Scripts" / "python.exe"))
)
WAV2LIP_CHECKPOINT = Path(
    os.getenv("MIRROR_WAV2LIP_CHECKPOINT", str(WAV2LIP_DIR / "checkpoints" / "wav2lip_gan.pth"))
)
WAV2LIP_FACE_DET_BATCH_SIZE = int(os.getenv("MIRROR_WAV2LIP_FACE_DET_BATCH_SIZE", "4"))
WAV2LIP_BATCH_SIZE = int(os.getenv("MIRROR_WAV2LIP_BATCH_SIZE", "16"))
AVATAR_CACHE_DIR = Path(os.getenv("MIRROR_AVATAR_CACHE_DIR", str(PROJECT_ROOT / "data" / "avatar-cache")))
DEFAULT_AVATAR_IMAGE = Path(os.getenv("MIRROR_DEFAULT_AVATAR_IMAGE", str(PROJECT_ROOT / "data" / "avatar-source.jpg")))
UPLOADED_SLIDE_PDF = PROJECT_ROOT / "data" / "decks" / "uploaded" / "current.pdf"
SLIDE_RENDER_CACHE_DIR = PROJECT_ROOT / "data" / "slide-cache"
_WHISPER = None
_SLIDE_DECK: dict[str, Any] = {
    "filename": "",
    "pages": [],
    "source": "empty",
    "pdf_path": "",
    "deck_title": "",
    "deck_goal": "",
    "opening_script": "",
    "closing_script": "",
    "qa_index": [],
    "video_path": "",
    "video_paths": {},
    "video_url": "",
    "video_urls": {},
    "video_cues": [],
    "video_cues_by_language": {},
}


def _configure_ffmpeg_path() -> str:
    candidates: list[Path] = []
    if FFMPEG_PATH:
        candidates.append(Path(FFMPEG_PATH))

    local_app_data = os.getenv("LOCALAPPDATA")
    if local_app_data:
        winget_root = Path(local_app_data) / "Microsoft" / "WinGet" / "Packages"
        candidates.extend(winget_root.glob("Gyan.FFmpeg*/ffmpeg-*/bin/ffmpeg.exe"))

    for candidate in candidates:
        if candidate.is_file():
            os.environ["PATH"] = f"{candidate.parent}{os.pathsep}{os.environ.get('PATH', '')}"
            return str(candidate)

    return ""


RESOLVED_FFMPEG_PATH = _configure_ffmpeg_path()


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"] = "user"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(default_factory=list)
    model: str = Field(default_factory=lambda: DEFAULT_LLM_MODEL)
    stream: bool = False
    think: bool | str | None = False
    options: dict[str, Any] | None = None
    keep_alive: str | int | None = None


class SpeakRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)
    voice: str | None = None
    sample_rate: int = Field(default=24_000, ge=8_000, le=48_000)
    format: Literal["wav"] = "wav"


class SpeechCacheRequest(SpeakRequest):
    pass


class AvatarRenderRequest(BaseModel):
    text: str | None = Field(default=None, max_length=8000)
    speech_audio_id: str | None = None
    voice: str | None = None
    avatar_image_path: str | None = None
    use_float16: bool = True
    batch_size: int = Field(default=2, ge=1, le=16)
    cache_only: bool = False


class SlideActionRequest(BaseModel):
    action: Literal["next", "previous", "first", "last", "start", "stop"]


class SlideSelectRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    auto_show: bool = True
    top_k: int = Field(default=3, ge=1, le=5)
    current_page: int | None = Field(default=None, ge=1)


app = FastAPI(title="Mirror Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials="*" not in CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

_WAV2LIP_RENDER_LOCK = asyncio.Lock()


@app.exception_handler(httpx.ConnectError)
async def http_connect_error_handler(_, exc: httpx.ConnectError) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={
            "error": "upstream_unavailable",
            "detail": str(exc),
        },
    )


@app.exception_handler(httpx.TimeoutException)
async def http_timeout_error_handler(_, exc: httpx.TimeoutException) -> JSONResponse:
    return JSONResponse(
        status_code=504,
        content={
            "error": "upstream_timeout",
            "detail": str(exc),
        },
    )


@app.get("/api/health")
async def health() -> dict[str, Any]:
    vibevoice_probe = await _probe_vibevoice() if TTS_ENGINE == "vibevoice" else {
        "connected": False,
        "detail": "VibeVoice is disabled.",
    }
    style_bert_vits2_probe = await _probe_style_bert_vits2() if TTS_ENGINE == "style-bert-vits2" else {
        "connected": False,
        "detail": "Style-Bert-VITS2 is not selected.",
    }
    voicevox_probe = await _probe_voicevox() if TTS_ENGINE == "voicevox" else {
        "connected": False,
        "detail": "VOICEVOX is not selected.",
    }
    return {
        "ok": True,
        "service": "mirror-backend",
        "ollama_base_url": OLLAMA_BASE_URL,
        "default_llm_model": DEFAULT_LLM_MODEL,
        "tts_engine": TTS_ENGINE,
        "speech_backend": _speech_backend_name(vibevoice_probe, voicevox_probe, style_bert_vits2_probe),
        "speech_max_chars": SPEAK_MAX_CHARS,
        "vibevoice_base_url": VIBEVOICE_BASE_URL if TTS_ENGINE == "vibevoice" else "",
        "vibevoice_connected": vibevoice_probe["connected"],
        "vibevoice_detail": vibevoice_probe["detail"],
        "style_bert_vits2_base_url": STYLE_BERT_VITS2_BASE_URL,
        "style_bert_vits2_connected": style_bert_vits2_probe["connected"],
        "style_bert_vits2_detail": style_bert_vits2_probe["detail"],
        "voicevox_base_url": VOICEVOX_BASE_URL,
        "voicevox_connected": voicevox_probe["connected"],
        "voicevox_detail": voicevox_probe["detail"],
        "slide_deck": {
            "filename": _SLIDE_DECK["filename"],
            "pages": len(_SLIDE_DECK["pages"]),
            "source": _SLIDE_DECK["source"],
            "deck_title": _SLIDE_DECK["deck_title"],
        },
        "avatar_engine": AVATAR_ENGINE,
        "avatar_detail": _avatar_engine_detail(),
        "stt_backend": _stt_backend_name(),
        "ffmpeg_path": RESOLVED_FFMPEG_PATH,
        "chat_fallback": ALLOW_CHAT_FALLBACK,
    }


@app.post("/api/chat")
async def chat(request: ChatRequest) -> Response:
    if not request.messages:
        raise HTTPException(
            status_code=400,
            detail={"error": "missing_messages", "message": "At least one chat message is required."},
        )

    payload: dict[str, Any] = {
        "model": request.model,
        "messages": [message.model_dump() for message in request.messages],
        "stream": request.stream,
    }
    if request.think is not None:
        payload["think"] = request.think
    if request.options is not None:
        payload["options"] = request.options
    if request.keep_alive is not None:
        payload["keep_alive"] = request.keep_alive

    if request.stream:
        return StreamingResponse(
            _stream_ollama_chat(payload),
            media_type="application/x-ndjson",
            headers={"X-Accel-Buffering": "no"},
        )

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            upstream = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
    except httpx.HTTPError as exc:
        if ALLOW_CHAT_FALLBACK:
            return JSONResponse(content=_fallback_chat_response(request.messages, request.model, str(exc)))
        raise
    if upstream.status_code >= 400:
        if ALLOW_CHAT_FALLBACK:
            return JSONResponse(
                content=_fallback_chat_response(
                    request.messages,
                    request.model,
                    f"Ollama returned HTTP {upstream.status_code}: {_safe_response_text(upstream)}",
                )
            )
        raise HTTPException(
            status_code=502,
            detail={
                "error": "ollama_error",
                "status_code": upstream.status_code,
                "message": _safe_response_text(upstream),
            },
        )
    try:
        return JSONResponse(content=upstream.json())
    except json.JSONDecodeError:
        if ALLOW_CHAT_FALLBACK:
            return JSONResponse(
                content=_fallback_chat_response(
                    request.messages,
                    request.model,
                    "Ollama returned a non-JSON response.",
                )
            )
        raise HTTPException(
            status_code=502,
            detail={
                "error": "ollama_invalid_response",
                "message": _safe_response_text(upstream),
            },
        ) from None


@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...), language: Literal["auto", "ja", "en"] = Form("auto")) -> dict[str, Any]:
    data = await file.read()
    if not data:
        raise HTTPException(
            status_code=400,
            detail={"error": "empty_upload", "message": "Upload an audio or text file to transcribe."},
        )

    content_type = file.content_type or "application/octet-stream"
    text = ""
    confidence = 0.0
    engine = "placeholder"

    if content_type.startswith("text/") or (file.filename or "").lower().endswith((".txt", ".md")):
        text = data.decode("utf-8", errors="replace").strip()
        confidence = 1.0
        engine = "text-file"
    else:
        transcript = await _try_transcribe_with_faster_whisper(data, file.filename or "utterance.webm", language)
        if transcript is not None:
            text = transcript
            confidence = 0.75
            engine = "faster-whisper"

    return {
        "text": text,
        "engine": engine,
        "confidence": confidence,
        "filename": file.filename,
        "content_type": content_type,
        "bytes": len(data),
        "language": language,
        "message": _transcribe_status_message(engine),
    }


@app.post("/api/speak")
async def speak(request: SpeakRequest) -> Response:
    audio, backend, chunk_count = await _synthesize_speech_wav(request)
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"X-Speech-Backend": backend, "X-Speech-Chunks": str(chunk_count)},
    )


@app.post("/api/speech/cache")
async def cache_speech(request: SpeechCacheRequest) -> dict[str, Any]:
    audio, backend, chunk_count = await _synthesize_speech_wav(request)
    audio_id = _hash_bytes(audio)[:24]
    audio_path = _speech_cache_dir() / f"{audio_id}.wav"
    cached = audio_path.is_file()
    if not cached:
        audio_path.write_bytes(audio)
    return {
        "ok": True,
        "speech_audio_id": audio_id,
        "audio_url": f"/api/avatar/assets/speech/{audio_id}.wav",
        "backend": backend,
        "chunks": chunk_count,
        "bytes": len(audio),
        "cached": cached,
    }


@app.post("/api/avatar/render")
async def render_avatar(request: AvatarRenderRequest) -> dict[str, Any]:
    if request.speech_audio_id:
        audio_id = _safe_asset_id(request.speech_audio_id)
        audio_path = _speech_cache_dir() / f"{audio_id}.wav"
        if not audio_path.is_file():
            raise HTTPException(status_code=404, detail="Speech audio id was not found.")
    elif request.text:
        speech = await cache_speech(SpeechCacheRequest(text=request.text, voice=request.voice))
        audio_id = speech["speech_audio_id"]
        audio_path = _speech_cache_dir() / f"{audio_id}.wav"
    else:
        raise HTTPException(status_code=400, detail="Provide text or speech_audio_id.")

    avatar_path = Path(request.avatar_image_path) if request.avatar_image_path else DEFAULT_AVATAR_IMAGE
    if not avatar_path.is_file():
        raise HTTPException(status_code=404, detail=f"Avatar image was not found: {avatar_path}")

    if AVATAR_ENGINE == "wav2lip":
        return await _render_avatar_wav2lip(request, avatar_path, audio_path)
    if AVATAR_ENGINE == "musetalk":
        return await _render_avatar_musetalk(request, avatar_path, audio_path)
    if AVATAR_ENGINE in {"stack-chan", "browser-stack", "none"}:
        raise HTTPException(
            status_code=409,
            detail="Server-side avatar rendering is disabled; the frontend uses the lightweight Stack-chan style avatar.",
        )
    raise HTTPException(status_code=400, detail=f"Unknown avatar engine: {AVATAR_ENGINE}")


async def _render_avatar_musetalk(request: AvatarRenderRequest, avatar_path: Path, audio_path: Path) -> dict[str, Any]:
    _ensure_musetalk_ready()
    render_id = _hash_text("|".join([str(avatar_path.resolve()), str(audio_path.resolve()), "musetalk-v15"]))[:24]
    output_path = _render_cache_dir() / f"{render_id}.mp4"
    if output_path.is_file():
        return _avatar_render_response(render_id, output_path, cached=True, engine="musetalk")
    if request.cache_only:
        raise HTTPException(status_code=404, detail="Cached MuseTalk render was not found.")

    work_dir = _render_work_dir(render_id)
    config_path = work_dir / "musetalk.yaml"
    result_name = f"{render_id}.mp4"
    config_path.write_text(
        "\n".join(
            [
                "task_0:",
                f' video_path: "{_yaml_path(avatar_path)}"',
                f' audio_path: "{_yaml_path(audio_path)}"',
                f' result_name: "{result_name}"',
                "",
            ]
        ),
        encoding="utf-8",
    )

    cmd = [
        str(MUSE_TALK_PYTHON),
        "-m",
        "scripts.inference",
        "--inference_config",
        str(config_path),
        "--result_dir",
        str(work_dir),
        "--unet_model_path",
        "models\\musetalkV15\\unet.pth",
        "--unet_config",
        "models\\musetalkV15\\musetalk.json",
        "--version",
        "v15",
        "--batch_size",
        str(request.batch_size),
        "--ffmpeg_path",
        str(Path(RESOLVED_FFMPEG_PATH).parent if RESOLVED_FFMPEG_PATH else ""),
    ]
    if request.use_float16:
        cmd.append("--use_float16")

    result = await asyncio.to_thread(
        subprocess.run,
        cmd,
        cwd=MUSE_TALK_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=REQUEST_TIMEOUT_SECONDS,
        check=False,
    )
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "musetalk_failed",
                "returncode": result.returncode,
                "stdout": result.stdout[-4000:],
                "stderr": result.stderr[-4000:],
            },
        )

    generated = work_dir / "v15" / result_name
    if not generated.is_file():
        matches = list((work_dir / "v15").glob("*.mp4"))
        generated = matches[0] if matches else generated
    if not generated.is_file():
        raise HTTPException(status_code=500, detail="MuseTalk completed but no MP4 was produced.")
    shutil.copy2(generated, output_path)
    return _avatar_render_response(render_id, output_path, cached=False, engine="musetalk")


async def _render_avatar_wav2lip(request: AvatarRenderRequest, avatar_path: Path, audio_path: Path) -> dict[str, Any]:
    _ensure_wav2lip_ready()
    render_id = _hash_text("|".join([str(avatar_path.resolve()), str(audio_path.resolve()), "wav2lip-gan"]))[:24]
    output_path = _render_cache_dir() / f"{render_id}.mp4"
    if output_path.is_file():
        return _avatar_render_response(render_id, output_path, cached=True, engine="wav2lip")
    if request.cache_only:
        raise HTTPException(status_code=404, detail="Cached Wav2Lip render was not found.")

    work_dir = _render_work_dir(render_id)
    outfile = work_dir / f"{render_id}.mp4"
    cmd = [
        str(WAV2LIP_PYTHON),
        "inference.py",
        "--checkpoint_path",
        str(WAV2LIP_CHECKPOINT),
        "--face",
        str(avatar_path),
        "--audio",
        str(audio_path),
        "--outfile",
        str(outfile),
        "--static",
        "True",
        "--pads",
        "0",
        "20",
        "0",
        "0",
        "--resize_factor",
        "1",
        "--face_det_batch_size",
        str(WAV2LIP_FACE_DET_BATCH_SIZE),
        "--wav2lip_batch_size",
        str(min(request.batch_size * 8, WAV2LIP_BATCH_SIZE)),
    ]
    # Upstream Wav2Lip writes shared files under third_party/Wav2Lip/temp.
    # Serializing renders prevents concurrent requests from clobbering temp/result.avi.
    async with _WAV2LIP_RENDER_LOCK:
        result = await asyncio.to_thread(
            subprocess.run,
            cmd,
            cwd=WAV2LIP_DIR,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=REQUEST_TIMEOUT_SECONDS,
            check=False,
        )
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "wav2lip_failed",
                "returncode": result.returncode,
                "stdout": result.stdout[-4000:],
                "stderr": result.stderr[-4000:],
            },
        )
    if not outfile.is_file():
        raise HTTPException(
            status_code=500,
            detail={
                "error": "wav2lip_missing_output",
                "stdout": result.stdout[-4000:],
                "stderr": result.stderr[-4000:],
            },
        )
    shutil.copy2(outfile, output_path)
    return _avatar_render_response(render_id, output_path, cached=False, engine="wav2lip")


@app.get("/api/avatar/assets/{asset_type}/{filename}")
async def avatar_asset(asset_type: Literal["speech", "render"], filename: str) -> FileResponse:
    if asset_type == "speech":
        asset_dir = _speech_cache_dir()
        media_type = "audio/wav"
    else:
        asset_dir = _render_cache_dir()
        media_type = "video/mp4"
    asset_path = asset_dir / Path(filename).name
    if not asset_path.is_file():
        raise HTTPException(status_code=404, detail="Avatar asset was not found.")
    return FileResponse(asset_path, media_type=media_type, filename=asset_path.name)


@app.post("/api/slides/action")
async def slide_action(request: SlideActionRequest) -> dict[str, Any]:
    if os.name != "nt":
        raise HTTPException(status_code=400, detail="Slide control is only implemented on Windows.")

    sent = _send_slide_key(request.action)
    return {"ok": sent, "action": request.action}


@app.post("/api/slides/pdf")
async def upload_slide_pdf(file: UploadFile = File(...)) -> dict[str, Any]:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Upload a PDF file.")

    try:
        pages = _extract_pdf_pages(data)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read PDF: {exc}") from exc

    _SLIDE_DECK["filename"] = file.filename or "slides.pdf"
    _SLIDE_DECK["pages"] = pages
    _SLIDE_DECK["source"] = "upload"
    UPLOADED_SLIDE_PDF.parent.mkdir(parents=True, exist_ok=True)
    UPLOADED_SLIDE_PDF.write_bytes(data)
    _SLIDE_DECK["pdf_path"] = str(UPLOADED_SLIDE_PDF)
    _SLIDE_DECK["deck_title"] = ""
    _SLIDE_DECK["deck_goal"] = ""
    _SLIDE_DECK["opening_script"] = ""
    _SLIDE_DECK["closing_script"] = ""
    _SLIDE_DECK["qa_index"] = []
    _SLIDE_DECK["video_path"] = ""
    _SLIDE_DECK["video_paths"] = {}
    _SLIDE_DECK["video_url"] = ""
    _SLIDE_DECK["video_urls"] = {}
    _SLIDE_DECK["video_cues"] = []
    _SLIDE_DECK["video_cues_by_language"] = {}
    return {
        "ok": True,
        "filename": _SLIDE_DECK["filename"],
        "pages": pages,
        "source": _SLIDE_DECK["source"],
    }


@app.get("/api/slides/deck")
async def slide_deck() -> dict[str, Any]:
    return {
        "filename": _SLIDE_DECK["filename"],
        "pages": _SLIDE_DECK["pages"],
        "source": _SLIDE_DECK["source"],
        "deck_title": _SLIDE_DECK["deck_title"],
        "deck_goal": _SLIDE_DECK["deck_goal"],
        "opening_script": _SLIDE_DECK["opening_script"],
        "closing_script": _SLIDE_DECK["closing_script"],
        "qa_index": _SLIDE_DECK["qa_index"],
        "video_url": _SLIDE_DECK["video_url"],
        "video_urls": _SLIDE_DECK["video_urls"],
        "video_cues": _SLIDE_DECK["video_cues"],
        "video_cues_by_language": _SLIDE_DECK["video_cues_by_language"],
    }


@app.get("/api/slides/default-pdf")
async def default_slide_pdf() -> FileResponse:
    pdf_path = Path(_SLIDE_DECK["pdf_path"])
    if not pdf_path.is_file():
        raise HTTPException(status_code=404, detail="Default slide PDF is not configured.")
    return FileResponse(pdf_path, media_type="application/pdf", filename=pdf_path.name)


@app.get("/api/slides/video")
async def slide_video() -> FileResponse:
    video_path = Path(_SLIDE_DECK["video_path"])
    if not video_path.is_file():
        raise HTTPException(status_code=404, detail="Slide video is not configured.")
    return FileResponse(video_path, media_type="video/mp4", filename=video_path.name)


@app.get("/api/slides/video/{language}")
async def slide_video_for_language(language: Literal["ja", "jp", "en"]) -> FileResponse:
    key = "ja" if language == "jp" else language
    video_paths = _SLIDE_DECK.get("video_paths", {})
    video_path = Path(str(video_paths.get(key, "")))
    if not video_path.is_file():
        raise HTTPException(status_code=404, detail=f"Slide video is not configured for {key}.")
    return FileResponse(video_path, media_type="video/mp4", filename=video_path.name)


@app.get("/api/slides/page/{page}.png")
async def slide_page_image(page: int, width: int = 1440) -> FileResponse:
    if page < 1:
        raise HTTPException(status_code=400, detail="Page must be 1 or greater.")
    pdf_path = Path(_SLIDE_DECK["pdf_path"])
    if not pdf_path.is_file():
        raise HTTPException(status_code=404, detail="No slide PDF is configured.")

    image_path = await asyncio.to_thread(_render_slide_page_image, pdf_path, page, width)
    return FileResponse(image_path, media_type="image/png")


@app.post("/api/slides/select")
async def select_slide(request: SlideSelectRequest) -> dict[str, Any]:
    if not _SLIDE_DECK["pages"]:
        raise HTTPException(status_code=404, detail="No slide PDF has been loaded.")

    matches = _select_slides_for_query(request.query, request.top_k, request.current_page)
    match = matches[0]
    if request.auto_show:
        _send_slide_key("start")
        if match["page"] == 1:
            _send_slide_key("first")
        else:
            _send_slide_number(match["page"])

    return {
        "ok": True,
        "selected": match,
        "candidates": matches,
        "instruction": f"Explain slide {match['page']}: {match['summary']}",
    }


async def _stream_ollama_chat(payload: dict[str, Any]) -> AsyncIterator[bytes]:
    try:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", f"{OLLAMA_BASE_URL}/api/chat", json=payload) as upstream:
                if upstream.status_code >= 400:
                    body = await upstream.aread()
                    yield _json_line(
                        {
                            "error": "ollama_error",
                            "status_code": upstream.status_code,
                            "message": body.decode("utf-8", errors="replace"),
                        }
                    )
                    return
                async for line in upstream.aiter_lines():
                    if line:
                        yield f"{line}\n".encode("utf-8")
    except httpx.ConnectError as exc:
        yield _json_line({"error": "upstream_unavailable", "detail": str(exc)})
    except httpx.TimeoutException as exc:
        yield _json_line({"error": "upstream_timeout", "detail": str(exc)})
    except httpx.HTTPError as exc:
        yield _json_line({"error": "upstream_http_error", "detail": str(exc)})


async def _try_vibevoice(request: SpeakRequest) -> bytes | None:
    audio = await _try_vibevoice_http(request)
    if audio:
        return audio
    return await _try_vibevoice_websocket(request)


def _send_slide_key(action: str) -> bool:
    key_map = {
        "next": "{RIGHT}",
        "previous": "{LEFT}",
        "first": "{HOME}",
        "last": "{END}",
        "start": "{F5}",
        "stop": "{ESC}",
    }
    key = key_map.get(action)
    if not key:
        return False

    script = """
$shell = New-Object -ComObject WScript.Shell
Start-Sleep -Milliseconds 80
$shell.SendKeys($env:MIRROR_SLIDE_KEY)
"""
    env = os.environ.copy()
    env["MIRROR_SLIDE_KEY"] = key
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            env=env,
            capture_output=True,
            timeout=5,
            check=False,
        )
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def _send_slide_number(page: int) -> bool:
    script = """
$shell = New-Object -ComObject WScript.Shell
Start-Sleep -Milliseconds 80
$shell.SendKeys($env:MIRROR_SLIDE_PAGE)
$shell.SendKeys("{ENTER}")
"""
    env = os.environ.copy()
    env["MIRROR_SLIDE_PAGE"] = str(max(1, page))
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            env=env,
            capture_output=True,
            timeout=5,
            check=False,
        )
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def _extract_pdf_pages(data: bytes) -> list[dict[str, Any]]:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    pages: list[dict[str, Any]] = []
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        normalized = _normalize_slide_text(text)
        pages.append(
            {
                "page": index,
                "title": _guess_slide_title(normalized, index),
                "summary": _summarize_slide_text(normalized),
                "text": normalized[:2500],
            }
        )
    return pages


def _load_default_slide_deck() -> None:
    if DEFAULT_SLIDE_JSON.is_file():
        with DEFAULT_SLIDE_JSON.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        pages = [_normalize_prepared_slide(slide) for slide in payload.get("slides", [])]
        if pages:
            _SLIDE_DECK["filename"] = DEFAULT_SLIDE_PDF.name if DEFAULT_SLIDE_PDF.is_file() else DEFAULT_SLIDE_JSON.name
            _SLIDE_DECK["pages"] = pages
            _SLIDE_DECK["source"] = "default-json"
            _SLIDE_DECK["pdf_path"] = str(DEFAULT_SLIDE_PDF) if DEFAULT_SLIDE_PDF.is_file() else ""
            _SLIDE_DECK["deck_title"] = str(payload.get("deck_title", ""))
            _SLIDE_DECK["deck_goal"] = str(payload.get("deck_goal", ""))
            _SLIDE_DECK["opening_script"] = str(payload.get("opening_script", ""))
            _SLIDE_DECK["closing_script"] = str(payload.get("closing_script", ""))
            _SLIDE_DECK["qa_index"] = payload.get("qa_index", [])
            _load_default_slide_video_metadata()
            return

    if DEFAULT_SLIDE_PDF.is_file():
        pages = _extract_pdf_pages(DEFAULT_SLIDE_PDF.read_bytes())
        _SLIDE_DECK["filename"] = DEFAULT_SLIDE_PDF.name
        _SLIDE_DECK["pages"] = pages
        _SLIDE_DECK["source"] = "default-pdf"
        _SLIDE_DECK["pdf_path"] = str(DEFAULT_SLIDE_PDF)
        _SLIDE_DECK["deck_title"] = ""
        _SLIDE_DECK["deck_goal"] = ""
        _SLIDE_DECK["opening_script"] = ""
        _SLIDE_DECK["closing_script"] = ""
        _SLIDE_DECK["qa_index"] = []
        _load_default_slide_video_metadata()


def _load_default_slide_video_metadata() -> None:
    _SLIDE_DECK["video_path"] = ""
    _SLIDE_DECK["video_paths"] = {}
    _SLIDE_DECK["video_url"] = ""
    _SLIDE_DECK["video_urls"] = {}
    _SLIDE_DECK["video_cues"] = []
    _SLIDE_DECK["video_cues_by_language"] = {}

    video_paths = _default_slide_video_paths()
    if not video_paths:
        return

    default_language = "ja" if "ja" in video_paths else sorted(video_paths)[0]
    default_video_path = video_paths[default_language]
    common_cues = _load_video_cues(DEFAULT_SLIDE_VIDEO_CUES)
    cues_by_language = {
        language: cues
        for language, cues in (
            (language, _load_video_cues(_video_cue_path_for(video_path)))
            for language, video_path in video_paths.items()
        )
        if cues
    }

    _SLIDE_DECK["video_path"] = str(default_video_path)
    _SLIDE_DECK["video_paths"] = {language: str(path) for language, path in video_paths.items()}
    _SLIDE_DECK["video_url"] = "/api/slides/video"
    _SLIDE_DECK["video_urls"] = {
        language: f"/api/slides/video/{language}"
        for language in video_paths
    }
    _SLIDE_DECK["video_cues"] = common_cues or cues_by_language.get(default_language, [])
    _SLIDE_DECK["video_cues_by_language"] = cues_by_language


def _default_slide_video_paths() -> dict[str, Path]:
    if DEFAULT_SLIDE_VIDEO.is_file():
        return {"ja": DEFAULT_SLIDE_VIDEO}

    deck_dir = DEFAULT_SLIDE_PDF.parent
    root_dir = PROJECT_ROOT
    stem = DEFAULT_SLIDE_PDF.stem
    candidates: dict[str, list[Path]] = {
        "ja": [
            deck_dir / f"{stem}_JP.mp4",
            deck_dir / f"{stem}_JA.mp4",
            deck_dir / f"{stem}.ja.mp4",
            root_dir / f"{stem}_JP.mp4",
            root_dir / f"{stem}_JA.mp4",
            root_dir / f"{stem}.ja.mp4",
        ],
        "en": [
            deck_dir / f"{stem}_EN.mp4",
            deck_dir / f"{stem}.en.mp4",
            root_dir / f"{stem}_EN.mp4",
            root_dir / f"{stem}.en.mp4",
        ],
    }
    paths: dict[str, Path] = {}
    for language, language_candidates in candidates.items():
        match = next((candidate for candidate in language_candidates if candidate.is_file()), None)
        if match is not None:
            paths[language] = match
    return paths


def _video_cue_path_for(video_path: Path) -> Path:
    name = video_path.name
    if name.endswith("_JP.mp4"):
        return video_path.with_name(f"{name[:-4]}.video.json")
    if name.endswith("_JA.mp4"):
        return video_path.with_name(f"{name[:-4]}.video.json")
    if name.endswith("_EN.mp4"):
        return video_path.with_name(f"{name[:-4]}.video.json")
    return video_path.with_suffix(".video.json")


def _load_video_cues(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    with path.open("r", encoding="utf-8") as handle:
        return _normalize_video_cues(json.load(handle))


def _normalize_video_cues(payload: Any) -> list[dict[str, Any]]:
    raw_cues = payload
    if isinstance(payload, dict):
        raw_cues = payload.get("video_cues") or payload.get("cues") or payload.get("slides") or []
    if not isinstance(raw_cues, list):
        return []

    cues: list[dict[str, Any]] = []
    for item in raw_cues:
        if not isinstance(item, dict):
            continue
        page = _parse_positive_int(item.get("page") or item.get("slide") or item.get("slide_page"))
        start_sec = _parse_time_seconds(item.get("start_sec") or item.get("start") or item.get("time"))
        if page is None or start_sec is None:
            continue
        end_sec = _parse_time_seconds(item.get("end_sec") or item.get("end"))
        cue: dict[str, Any] = {
            "page": page,
            "start_sec": start_sec,
        }
        if end_sec is not None and end_sec > start_sec:
            cue["end_sec"] = end_sec
        if item.get("title"):
            cue["title"] = str(item["title"])
        cues.append(cue)

    cues.sort(key=lambda cue: (cue["page"], cue["start_sec"]))
    return cues


def _parse_positive_int(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _parse_time_seconds(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, int | float):
        return float(value) if value >= 0 else None
    text = str(value).strip()
    if not text:
        return None
    if re.fullmatch(r"\d+(?:\.\d+)?", text):
        return float(text)
    parts = text.split(":")
    if not all(re.fullmatch(r"\d+(?:\.\d+)?", part.strip()) for part in parts):
        return None
    seconds = 0.0
    for part in parts:
        seconds = seconds * 60 + float(part.strip())
    return seconds


def _normalize_prepared_slide(slide: dict[str, Any]) -> dict[str, Any]:
    likely_questions = slide.get("likely_questions", [])
    question_text = " ".join(
        f"{item.get('question', '')} {item.get('answer', '')}"
        for item in likely_questions
        if isinstance(item, dict)
    )
    supplemental = " ".join(str(item) for item in slide.get("supplemental_notes", []))
    keywords = [str(item) for item in slide.get("keywords", [])]
    spoken_script = str(slide.get("spoken_script", ""))
    short_script = str(slide.get("short_script", ""))
    summary = str(slide.get("one_sentence_summary") or short_script or spoken_script[:160])
    text = " ".join(
        part
        for part in [
            str(slide.get("title", "")),
            summary,
            spoken_script,
            short_script,
            supplemental,
            " ".join(keywords),
            question_text,
        ]
        if part
    )

    return {
        "page": int(slide.get("page", 0) or 0),
        "title": str(slide.get("title", "")),
        "summary": summary,
        "text": _normalize_slide_text(text)[:5000],
        "spoken_script": spoken_script,
        "short_script": short_script,
        "role_in_talk": str(slide.get("role_in_talk", "")),
        "keywords": keywords,
        "supplemental_notes": slide.get("supplemental_notes", []),
        "likely_questions": likely_questions,
        "transition_to_next": str(slide.get("transition_to_next", "")),
        "tts_warnings": slide.get("tts_warnings", []),
    }


def _normalize_slide_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _render_slide_page_image(pdf_path: Path, page: int, width: int) -> Path:
    try:
        import fitz
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="PyMuPDF is not installed.") from exc

    safe_width = max(640, min(2400, width))
    pdf_hash = _hash_text(f"{pdf_path.resolve()}:{pdf_path.stat().st_mtime_ns}")[:16]
    target_dir = SLIDE_RENDER_CACHE_DIR / pdf_hash
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"page-{page}-w{safe_width}.png"
    if target_path.is_file():
        return target_path

    document = fitz.open(pdf_path)
    try:
        if page > document.page_count:
            raise HTTPException(status_code=404, detail=f"PDF has only {document.page_count} pages.")
        pdf_page = document.load_page(page - 1)
        zoom = safe_width / max(1, pdf_page.rect.width)
        matrix = fitz.Matrix(zoom, zoom)
        pixmap = pdf_page.get_pixmap(matrix=matrix, alpha=False)
        pixmap.save(target_path)
        return target_path
    finally:
        document.close()


def _guess_slide_title(text: str, page: int) -> str:
    if not text:
        return f"Slide {page}"
    first = re.split(r"[。.!?\n]", text, maxsplit=1)[0].strip()
    return first[:60] or f"Slide {page}"


def _summarize_slide_text(text: str) -> str:
    if not text:
        return "No extractable text was found on this page."
    sentences = [part.strip() for part in re.split(r"(?<=[。.!?])\s*", text) if part.strip()]
    summary = " ".join(sentences[:3]) if sentences else text
    return summary[:420]


def _select_slide_for_query(query: str) -> dict[str, Any]:
    return _select_slides_for_query(query, top_k=1)[0]


def _select_slides_for_query(
    query: str,
    top_k: int = 3,
    current_page: int | None = None,
) -> list[dict[str, Any]]:
    query_terms = _tokenize_for_slide_search(query)
    query_text = " ".join(query_terms)
    scored_pages = [
        {
            **page,
            "score": _score_slide_for_query(page, query_terms, query_text),
            "evidence_text": _slide_evidence_text(page),
        }
        for page in _SLIDE_DECK["pages"]
    ]
    scored_pages.sort(key=lambda page: (page["score"], -abs(int(page.get("page", 0) or 0))), reverse=True)

    if scored_pages and scored_pages[0]["score"] <= 0 and current_page is not None:
        current_match = next(
            (page for page in scored_pages if int(page.get("page", 0) or 0) == current_page),
            None,
        )
        if current_match is not None:
            scored_pages = [current_match, *[page for page in scored_pages if page is not current_match]]

    limit = max(1, min(top_k, len(scored_pages)))
    return scored_pages[:limit]


def _score_slide_for_query(page: dict[str, Any], query_terms: list[str], query_text: str) -> float:
    title = str(page.get("title", "")).lower()
    summary = str(page.get("summary", "")).lower()
    body = str(page.get("text", "")).lower()
    keywords = " ".join(str(item).lower() for item in page.get("keywords", []))
    questions = " ".join(
        f"{item.get('question', '')} {item.get('answer', '')}".lower()
        for item in page.get("likely_questions", [])
        if isinstance(item, dict)
    )
    notes = " ".join(str(item).lower() for item in page.get("supplemental_notes", []))
    haystacks = [
        (title, 5.0),
        (keywords, 4.0),
        (questions, 3.5),
        (summary, 3.0),
        (notes, 2.0),
        (body, 1.0),
    ]

    score = 0.0
    for term in query_terms:
        term_weight = _slide_search_term_weight(term)
        for haystack, weight in haystacks:
            if not haystack:
                continue
            count = haystack.count(term)
            if count:
                score += weight * term_weight * (1 + min(count, 4) * 0.35)
        if len(term) >= 4:
            if term in title:
                score += 10.0 * term_weight
            if term in keywords:
                score += 6.0 * term_weight
            if term in summary:
                score += 3.0 * term_weight
    if query_text and query_text in f"{title} {summary} {keywords} {questions} {body}":
        score += 4.0
    if "柔らかさ" in query_terms and "柔らかさ" in title and "提示" in title:
        score += 8.0
    return round(score, 3)


def _slide_evidence_text(page: dict[str, Any]) -> str:
    likely_questions = page.get("likely_questions", [])
    qa_text = " ".join(
        f"Q: {item.get('question', '')} A: {item.get('answer', '')}"
        for item in likely_questions[:3]
        if isinstance(item, dict)
    )
    parts = [
        f"Slide {page.get('page')}: {page.get('title', '')}",
        str(page.get("summary", "")),
        str(page.get("short_script", "")),
        str(page.get("spoken_script", ""))[:900],
        " / ".join(str(item) for item in page.get("supplemental_notes", [])[:4]),
        "Keywords: " + ", ".join(str(item) for item in page.get("keywords", [])[:8]),
        qa_text,
    ]
    return _normalize_slide_text(" ".join(part for part in parts if part))[:1800]


def _tokenize_for_slide_search(query: str) -> list[str]:
    lowered = query.lower()
    normalized = _normalize_japanese_query(lowered)
    raw_terms = re.findall(r"[a-zA-Z0-9_+-]{2,}|[\u3040-\u30ff\u3400-\u9fff]{2,}", normalized)
    terms: list[str] = []
    for term in raw_terms:
        terms.append(term)
        if re.search(r"[\u3040-\u30ff\u3400-\u9fff]", term):
            terms.extend(_cjk_ngrams(term))
    terms.extend(_slide_search_synonyms(normalized, terms))
    return list(dict.fromkeys(term for term in terms if term)) or [lowered.strip()]


def _normalize_japanese_query(query: str) -> str:
    text = query
    replacements = [
        "について",
        "に関して",
        "にかんして",
        "とは",
        "って",
        "を教えて",
        "教えて",
        "ください",
        "下さい",
        "ですか",
        "ますか",
        "です",
        "ます",
        "何",
        "なに",
        "どんな",
        "どの",
        "この",
        "その",
    ]
    for phrase in replacements:
        text = text.replace(phrase, " ")
    return re.sub(r"\s+", " ", text).strip()


def _cjk_ngrams(text: str) -> list[str]:
    compact = re.sub(r"[^\u3040-\u30ff\u3400-\u9fff]", "", text)
    grams: list[str] = []
    for size in range(2, min(6, len(compact)) + 1):
        grams.extend(compact[index:index + size] for index in range(0, len(compact) - size + 1))
    return grams


def _slide_search_synonyms(query: str, terms: list[str]) -> list[str]:
    text = " ".join([query, *terms])
    groups = [
        ("触覚", "haptic", "haptics", "tactile"),
        ("フィードバック", "feedback"),
        ("柔らかさ", "softness", "soft", "柔らか", "軟らか"),
        ("硬さ", "stiffness", "hardness", "stiff", "硬い"),
        ("慣性", "inertia", "inertial"),
        ("変形", "deformation", "deformable", "deform"),
        ("圧縮", "compression", "compressible", "compress"),
        ("把持", "grasp", "grasping", "grab"),
        ("力", "force"),
        ("重さ", "weight"),
        ("重心", "weight shifting"),
        ("視覚", "visual", "vision"),
        ("一貫性", "coherence", "consistency"),
        ("期待", "expectation", "expected"),
        ("推定", "estimation", "estimate"),
        ("デバイス", "device"),
        ("分類", "classification", "type"),
        ("評価", "evaluation", "result", "results"),
    ]
    expanded: list[str] = []
    for group in groups:
        if any(item in text for item in group):
            expanded.extend(group)
    return expanded


def _slide_search_term_weight(term: str) -> float:
    if re.fullmatch(r"[\u3040-\u30ff\u3400-\u9fff]{2}", term):
        return 0.35
    if re.fullmatch(r"[\u3040-\u30ff\u3400-\u9fff]{3}", term):
        return 0.65
    return 1.0


async def _synthesize_speech_wav(request: SpeakRequest) -> tuple[bytes, str, int]:
    speech_text = _normalize_speech_text(request.text)
    chunks = _split_speech_text(speech_text, SPEAK_MAX_CHARS)

    if TTS_ENGINE == "voicevox":
        audio = await _try_voicevox(request, speech_text)
        if audio:
            return audio, "voicevox", 1

    if TTS_ENGINE == "vibevoice" and VIBEVOICE_BASE_URL:
        audio = await _try_vibevoice(request.model_copy(update={"text": speech_text}))
        if audio:
            return audio, "vibevoice", 1

    if TTS_ENGINE == "style-bert-vits2":
        audio = await _try_style_bert_vits2(request.model_copy(update={"text": speech_text}))
        if audio:
            return audio, "style-bert-vits2", 1

    windows_chunks: list[bytes] = []
    for chunk in chunks:
        audio = await _try_windows_sapi(request.model_copy(update={"text": chunk}))
        if audio:
            windows_chunks.append(audio)

    audio = _concat_wavs(windows_chunks)
    if audio:
        return audio, "windows-sapi", len(windows_chunks)

    return _synthetic_wav(speech_text, sample_rate=request.sample_rate), "fallback-wav", 1


def _musetalk_status() -> dict[str, Any]:
    required = [
        MUSE_TALK_DIR / "scripts" / "inference.py",
        MUSE_TALK_PYTHON,
        MUSE_TALK_DIR / "models" / "musetalkV15" / "unet.pth",
        MUSE_TALK_DIR / "models" / "musetalkV15" / "musetalk.json",
        MUSE_TALK_DIR / "models" / "whisper" / "pytorch_model.bin",
        MUSE_TALK_DIR / "models" / "sd-vae" / "diffusion_pytorch_model.bin",
        MUSE_TALK_DIR / "models" / "dwpose" / "dw-ll_ucoco_384.pth",
        MUSE_TALK_DIR / "models" / "face-parse-bisent" / "79999_iter.pth",
    ]
    missing = [str(path) for path in required if not path.exists()]
    return {
        "configured": not missing,
        "dir": str(MUSE_TALK_DIR),
        "python": str(MUSE_TALK_PYTHON),
        "missing": missing,
    }


def _ensure_musetalk_ready() -> None:
    status = _musetalk_status()
    if not status["configured"]:
        raise HTTPException(status_code=503, detail={"error": "musetalk_not_ready", **status})


def _wav2lip_status() -> dict[str, Any]:
    required = [
        WAV2LIP_DIR / "inference.py",
        WAV2LIP_PYTHON,
        WAV2LIP_CHECKPOINT,
        WAV2LIP_DIR / "face_detection" / "detection" / "sfd" / "s3fd.pth",
    ]
    missing = [str(path) for path in required if not path.exists()]
    return {
        "configured": not missing,
        "dir": str(WAV2LIP_DIR),
        "python": str(WAV2LIP_PYTHON),
        "checkpoint": str(WAV2LIP_CHECKPOINT),
        "face_det_batch_size": WAV2LIP_FACE_DET_BATCH_SIZE,
        "wav2lip_batch_size": WAV2LIP_BATCH_SIZE,
        "missing": missing,
    }


def _ensure_wav2lip_ready() -> None:
    status = _wav2lip_status()
    if not status["configured"]:
        raise HTTPException(status_code=503, detail={"error": "wav2lip_not_ready", **status})


def _avatar_engine_detail() -> dict[str, Any]:
    if AVATAR_ENGINE == "musetalk":
        return {"mode": "server-render", "engine": "musetalk", **_musetalk_status()}
    if AVATAR_ENGINE == "wav2lip":
        return {"mode": "server-render", "engine": "wav2lip", **_wav2lip_status()}
    return {
        "mode": "frontend",
        "engine": "stack-chan",
        "detail": "Lightweight CSS/React avatar driven by playback volume.",
    }


def _speech_cache_dir() -> Path:
    path = AVATAR_CACHE_DIR / "speech"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _render_cache_dir() -> Path:
    path = AVATAR_CACHE_DIR / "renders"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _render_work_dir(render_id: str) -> Path:
    path = AVATAR_CACHE_DIR / "work" / render_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def _hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _safe_asset_id(value: str) -> str:
    if not re.fullmatch(r"[a-fA-F0-9]{8,64}", value):
        raise HTTPException(status_code=400, detail="Invalid asset id.")
    return value.lower()


def _yaml_path(path: Path) -> str:
    return str(path.resolve()).replace("\\", "/").replace('"', '\\"')


def _avatar_render_response(render_id: str, output_path: Path, cached: bool, engine: str) -> dict[str, Any]:
    return {
        "ok": True,
        "render_id": render_id,
        "video_url": f"/api/avatar/assets/render/{output_path.name}",
        "engine": engine,
        "cached": cached,
        "bytes": output_path.stat().st_size,
    }


async def _try_voicevox(request: SpeakRequest, text: str) -> bytes | None:
    speaker = _voicevox_speaker_id(request.voice)
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            query_response = await client.post(
                f"{VOICEVOX_BASE_URL}/audio_query",
                params={"text": text, "speaker": speaker},
            )
            if query_response.status_code >= 400:
                return None

            synthesis_response = await client.post(
                f"{VOICEVOX_BASE_URL}/synthesis",
                params={"speaker": speaker},
                json=query_response.json(),
            )
            if synthesis_response.status_code >= 400 or not synthesis_response.content:
                return None
            return synthesis_response.content
    except (httpx.HTTPError, json.JSONDecodeError):
        return None


def _voicevox_speaker_id(voice: str | None) -> int:
    if not voice:
        return VOICEVOX_SPEAKER
    match = re.search(r"\d+", voice)
    return int(match.group(0)) if match else VOICEVOX_SPEAKER


async def _try_style_bert_vits2(request: SpeakRequest) -> bytes | None:
    params: dict[str, Any] = {
        "text": request.text,
        "language": _style_bert_vits2_language(request.text),
        "style": STYLE_BERT_VITS2_STYLE,
        "style_weight": STYLE_BERT_VITS2_STYLE_WEIGHT,
        "length": STYLE_BERT_VITS2_LENGTH,
        "auto_split": "true",
    }
    if STYLE_BERT_VITS2_MODEL:
        params["model_name"] = STYLE_BERT_VITS2_MODEL
    speaker = _style_bert_vits2_speaker(request.voice)
    if speaker:
        if speaker.isdigit():
            params["speaker_id"] = int(speaker)
        else:
            params["speaker_name"] = speaker
    if STYLE_BERT_VITS2_REFERENCE_AUDIO:
        params["reference_audio_path"] = STYLE_BERT_VITS2_REFERENCE_AUDIO

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(f"{STYLE_BERT_VITS2_BASE_URL}/voice", params=params)
        if response.status_code >= 400 or not response.content:
            return None
        if not response.content.startswith(b"RIFF"):
            return None
        return response.content
    except httpx.HTTPError:
        return None


def _style_bert_vits2_language(text: str) -> str:
    if re.search(r"[\u3040-\u30ff\u3400-\u9fff]", text):
        return "JP"
    return "EN"


def _style_bert_vits2_speaker(voice: str | None) -> str:
    frontend_placeholders = {"", "windows-default", "style-bert-vits2"}
    candidate = (voice or "").strip()
    if candidate in frontend_placeholders or candidate.startswith("voicevox-"):
        return STYLE_BERT_VITS2_SPEAKER
    return candidate or STYLE_BERT_VITS2_SPEAKER


async def _try_vibevoice_http(request: SpeakRequest) -> bytes | None:
    payload = {
        "text": request.text,
        "voice": request.voice,
        "sample_rate": request.sample_rate,
        "format": request.format,
    }
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(f"{VIBEVOICE_BASE_URL}/api/speak", json=payload)
        if response.status_code >= 400 or not response.content:
            return None
        return response.content
    except httpx.HTTPError:
        return None


async def _try_vibevoice_websocket(request: SpeakRequest) -> bytes | None:
    try:
        import websockets
    except ImportError:
        return None

    query: dict[str, str] = {
        "text": request.text,
        "cfg": str(VIBEVOICE_CFG_SCALE),
    }
    if request.voice:
        query["voice"] = request.voice
    if VIBEVOICE_STEPS:
        query["steps"] = VIBEVOICE_STEPS

    chunks: list[bytes] = []
    try:
        async with asyncio.timeout(REQUEST_TIMEOUT_SECONDS):
            async with websockets.connect(_vibevoice_stream_url(query), max_size=None) as socket:
                async for message in socket:
                    if isinstance(message, bytes):
                        chunks.append(message)
    except (TimeoutError, OSError, websockets.WebSocketException):
        return None

    pcm = b"".join(chunks)
    if not pcm:
        return None
    return _pcm16_to_wav(pcm, sample_rate=request.sample_rate)


async def _probe_vibevoice() -> dict[str, Any]:
    if not VIBEVOICE_BASE_URL:
        return {"connected": False, "detail": "MIRROR_VIBEVOICE_URL is not configured."}

    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{VIBEVOICE_BASE_URL}/config")
        if response.status_code < 400:
            return {"connected": True, "detail": response.json()}
        return {"connected": False, "detail": f"HTTP {response.status_code}"}
    except (httpx.HTTPError, json.JSONDecodeError) as exc:
        return {"connected": False, "detail": str(exc)}


async def _probe_style_bert_vits2() -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{STYLE_BERT_VITS2_BASE_URL}/models/info")
        if response.status_code < 400:
            return {"connected": True, "detail": response.json()}
        return {"connected": False, "detail": f"HTTP {response.status_code}"}
    except (httpx.HTTPError, json.JSONDecodeError) as exc:
        return {"connected": False, "detail": str(exc)}


async def _probe_voicevox() -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{VOICEVOX_BASE_URL}/version")
        if response.status_code < 400:
            return {"connected": True, "detail": response.text.strip('"')}
        return {"connected": False, "detail": f"HTTP {response.status_code}"}
    except httpx.HTTPError as exc:
        return {"connected": False, "detail": str(exc)}


def _vibevoice_stream_url(query: dict[str, str]) -> str:
    parsed = urlparse(VIBEVOICE_BASE_URL)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    path = parsed.path.rstrip("/") + "/stream"
    return urlunparse((scheme, parsed.netloc, path, "", urlencode(query), ""))


async def _try_transcribe_with_faster_whisper(
    data: bytes,
    filename: str,
    language: Literal["auto", "ja", "en"] = "auto",
) -> str | None:
    global _WHISPER

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return None

    import tempfile
    from pathlib import Path

    if _WHISPER is None:
        _WHISPER = WhisperModel(
            WHISPER_MODEL,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE_TYPE,
        )

    suffix = Path(filename).suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(data)
        temp_path = temp_file.name

    try:
        try:
            whisper_language = None if language == "auto" else language
            segments, _ = _WHISPER.transcribe(temp_path, language=whisper_language, vad_filter=True)
            return "".join(segment.text for segment in segments).strip()
        except RuntimeError:
            if WHISPER_DEVICE == "cpu":
                return None

            _WHISPER = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
            whisper_language = None if language == "auto" else language
            segments, _ = _WHISPER.transcribe(temp_path, language=whisper_language, vad_filter=True)
            return "".join(segment.text for segment in segments).strip()
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


async def _try_windows_sapi(request: SpeakRequest) -> bytes | None:
    if os.name != "nt":
        return None

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
        temp_path = Path(temp_file.name)

    script = """
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0
$synth.Volume = 100
$synth.SetOutputToWaveFile($env:MIRROR_TTS_OUTPUT)
$synth.Speak($env:MIRROR_TTS_TEXT)
$synth.Dispose()
"""
    env = os.environ.copy()
    env["MIRROR_TTS_TEXT"] = request.text
    env["MIRROR_TTS_OUTPUT"] = str(temp_path)

    try:
        result = await asyncio.to_thread(
            subprocess.run,
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ],
            env=env,
            capture_output=True,
            timeout=45,
            check=False,
        )
        if result.returncode != 0 or not temp_path.exists() or temp_path.stat().st_size == 0:
            return None
        audio = temp_path.read_bytes()
        return audio if _wav_has_audio(audio) else None
    except (OSError, subprocess.TimeoutExpired):
        return None
    finally:
        try:
            temp_path.unlink()
        except OSError:
            pass


def _synthetic_wav(text: str, sample_rate: int = 24_000) -> bytes:
    duration = min(max(len(text) * 0.045, 0.35), 8.0)
    total_samples = int(sample_rate * duration)
    frequency = 440.0
    amplitude = 0.18

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for index in range(total_samples):
            envelope = min(1.0, index / max(sample_rate * 0.03, 1))
            tail = min(1.0, (total_samples - index) / max(sample_rate * 0.08, 1))
            sample = int(32767 * amplitude * envelope * tail * math.sin(2 * math.pi * frequency * index / sample_rate))
            wav_file.writeframesraw(sample.to_bytes(2, byteorder="little", signed=True))
    return buffer.getvalue()


def _pcm16_to_wav(pcm: bytes, sample_rate: int = 24_000) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm)
    return buffer.getvalue()


def _concat_wavs(wav_chunks: list[bytes]) -> bytes | None:
    wav_chunks = [chunk for chunk in wav_chunks if _wav_has_audio(chunk)]
    if not wav_chunks:
        return None
    if len(wav_chunks) == 1:
        return wav_chunks[0]

    output = io.BytesIO()
    params = None
    frames: list[bytes] = []
    for chunk in wav_chunks:
        with wave.open(io.BytesIO(chunk), "rb") as wav_file:
            next_params = wav_file.getparams()
            if params is None:
                params = next_params
            if next_params[:3] != params[:3]:
                continue
            frames.append(wav_file.readframes(wav_file.getnframes()))

    if params is None or not frames:
        return None

    with wave.open(output, "wb") as wav_file:
        wav_file.setparams(params)
        for frame in frames:
            wav_file.writeframes(frame)
    return output.getvalue()


def _wav_has_audio(audio: bytes) -> bool:
    if len(audio) < 64:
        return False
    try:
        with wave.open(io.BytesIO(audio), "rb") as wav_file:
            return wav_file.getnframes() > 0
    except wave.Error:
        return False


def _normalize_speech_text(text: str) -> str:
    text = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"[*_#>\[\]{}|~]", "", text)
    text = re.sub(r"https?://\S+", "link", text)
    text = re.sub(r"[\U0001F000-\U0001FAFF\U00002700-\U000027BF]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or "No speech text is available."


def _split_speech_text(text: str, max_chars: int) -> list[str]:
    max_chars = max(80, max_chars)
    parts = [part for part in re.split(r"(?<=[。．.!！？?])\s*", text) if part]
    chunks: list[str] = []
    current = ""

    for part in parts:
        if len(part) > max_chars:
            if current:
                chunks.append(current)
                current = ""
            chunks.extend(part[index:index + max_chars] for index in range(0, len(part), max_chars))
            continue

        candidate = f"{current} {part}".strip()
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                chunks.append(current)
            current = part

    if current:
        chunks.append(current)
    return chunks or [text[:max_chars]]


def _json_line(payload: dict[str, Any]) -> bytes:
    return (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")


def _fallback_chat_response(messages: list[ChatMessage], model: str, reason: str) -> dict[str, Any]:
    last_user = next((message.content for message in reversed(messages) if message.role == "user"), "")
    content = (
        "Ollama is not connected yet. "
        "I will use this short fallback reply for microphone, playback, and avatar checks."
    )
    if last_user:
        content += f' Heard text: "{last_user}".'

    return {
        "model": model,
        "message": {
            "role": "assistant",
            "content": content,
        },
        "done": True,
        "fallback": True,
        "fallback_reason": reason,
    }


def _stt_backend_name() -> str:
    try:
        import faster_whisper  # noqa: F401
    except ImportError:
        return "browser-default/faster-whisper-not-installed"
    return f"faster-whisper:{WHISPER_MODEL}:{WHISPER_DEVICE}:{WHISPER_COMPUTE_TYPE}"


def _speech_backend_name(
    vibevoice_probe: dict[str, Any],
    voicevox_probe: dict[str, Any],
    style_bert_vits2_probe: dict[str, Any] | None = None,
) -> str:
    if TTS_ENGINE == "voicevox":
        return "voicevox" if voicevox_probe["connected"] else "voicevox-or-windows-sapi"
    if TTS_ENGINE == "vibevoice":
        return "vibevoice-websocket" if vibevoice_probe["connected"] else "vibevoice-or-windows-sapi"
    if TTS_ENGINE == "style-bert-vits2":
        connected = bool(style_bert_vits2_probe and style_bert_vits2_probe["connected"])
        return "style-bert-vits2" if connected else "style-bert-vits2-or-windows-sapi"
    return "windows-sapi"


def _transcribe_status_message(engine: str) -> str:
    if engine == "faster-whisper":
        return "Transcribed locally with faster-whisper."
    if engine == "text-file":
        return "Text file passed through as a development transcript."
    return "No speech was detected or the local STT backend is unavailable."


def _safe_response_text(response: httpx.Response) -> str:
    try:
        return response.text
    except UnicodeDecodeError:
        return "<non-text response>"


try:
    _load_default_slide_deck()
except Exception as exc:  # pragma: no cover - startup resilience for local files.
    print(f"[mirror] Could not load default slide deck: {exc}")

