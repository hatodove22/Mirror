from fastapi.testclient import TestClient

from backend.app import main
from backend.app.main import app


client = TestClient(app)


def test_health_reports_backend_ready():
    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["service"] == "mirror-backend"


def test_transcribe_text_file_passthrough():
    response = client.post(
        "/api/transcribe",
        files={"file": ("note.txt", b"hello mirror", "text/plain")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["text"] == "hello mirror"
    assert payload["engine"] == "text-file"


def test_speak_returns_wav_audio():
    response = client.post("/api/speak", json={"text": "hello mirror"})

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.headers["x-speech-backend"] in {"windows-sapi", "fallback-wav"}
    assert response.content.startswith(b"RIFF")


def test_chat_has_local_fallback_when_ollama_is_unavailable(monkeypatch):
    monkeypatch.setattr(main, "OLLAMA_BASE_URL", "http://127.0.0.1:9")

    response = client.post(
        "/api/chat",
        json={
            "model": "gemma4:e2b",
            "messages": [{"role": "user", "content": "hello mirror"}],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["fallback"] is True
    assert payload["message"]["role"] == "assistant"
    assert "hello mirror" in payload["message"]["content"]


def test_default_slide_deck_is_loaded_from_prepared_json():
    response = client.get("/api/slides/deck")

    assert response.status_code == 200
    payload = response.json()
    assert payload["filename"] == "General Meeting.pdf"
    assert payload["source"] == "default-json"
    assert len(payload["pages"]) == 26
    assert payload["pages"][0]["spoken_script"]


def test_slide_select_returns_ranked_candidates():
    response = client.post(
        "/api/slides/select",
        json={"query": "Hap", "auto_show": False, "top_k": 3},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["selected"]["page"] >= 1
    assert len(payload["candidates"]) == 3
    assert payload["candidates"][0]["page"] == payload["selected"]["page"]
    assert "evidence_text" in payload["candidates"][0]


def test_slide_select_keeps_current_page_when_query_has_no_match():
    response = client.post(
        "/api/slides/select",
        json={"query": "zzzz-unmatched-term", "auto_show": False, "top_k": 3, "current_page": 5},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["selected"]["page"] == 5


def test_speech_cache_writes_wav_asset(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "AVATAR_CACHE_DIR", tmp_path)

    response = client.post("/api/speech/cache", json={"text": "hello mirror"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["speech_audio_id"]
    assert payload["audio_url"].endswith(".wav")
    assert (tmp_path / "speech" / f"{payload['speech_audio_id']}.wav").is_file()


def test_avatar_render_returns_cached_musetalk_asset(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "AVATAR_CACHE_DIR", tmp_path)
    monkeypatch.setattr(main, "AVATAR_ENGINE", "musetalk")
    monkeypatch.setattr(main, "_ensure_musetalk_ready", lambda: None)
    avatar = tmp_path / "avatar.jpg"
    avatar.write_bytes(b"avatar")
    monkeypatch.setattr(main, "DEFAULT_AVATAR_IMAGE", avatar)
    audio = b"RIFF0000WAVE"
    audio_id = main._hash_bytes(audio)[:24]
    speech_dir = tmp_path / "speech"
    speech_dir.mkdir(parents=True)
    (speech_dir / f"{audio_id}.wav").write_bytes(audio)
    render_id = main._hash_text("|".join([str(avatar.resolve()), str((speech_dir / f"{audio_id}.wav").resolve()), "musetalk-v15"]))[:24]
    render_dir = tmp_path / "renders"
    render_dir.mkdir(parents=True)
    (render_dir / f"{render_id}.mp4").write_bytes(b"video")

    response = client.post("/api/avatar/render", json={"speech_audio_id": audio_id})

    assert response.status_code == 200
    payload = response.json()
    assert payload["engine"] == "musetalk"
    assert payload["cached"] is True
    assert payload["video_url"].endswith(".mp4")


def test_slide_page_image_renders_default_pdf():
    response = client.get("/api/slides/page/1.png?width=640")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG")


def test_wav2lip_cache_only_reports_missing_cached_asset(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "AVATAR_CACHE_DIR", tmp_path)
    monkeypatch.setattr(main, "AVATAR_ENGINE", "wav2lip")
    monkeypatch.setattr(main, "_ensure_wav2lip_ready", lambda: None)
    avatar = tmp_path / "avatar.jpg"
    avatar.write_bytes(b"avatar")
    monkeypatch.setattr(main, "DEFAULT_AVATAR_IMAGE", avatar)
    audio = b"RIFF0000WAVE"
    audio_id = main._hash_bytes(audio)[:24]
    speech_dir = tmp_path / "speech"
    speech_dir.mkdir(parents=True)
    (speech_dir / f"{audio_id}.wav").write_bytes(audio)

    response = client.post(
        "/api/avatar/render",
        json={"speech_audio_id": audio_id, "cache_only": True},
    )

    assert response.status_code == 404
