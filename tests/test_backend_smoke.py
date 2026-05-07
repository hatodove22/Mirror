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


def test_slide_select_handles_japanese_query_without_spaces():
    response = client.post(
        "/api/slides/select",
        json={"query": "柔らかさについて教えて", "auto_show": False, "top_k": 3, "current_page": 1},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["selected"]["page"] == 21
    assert 21 in {candidate["page"] for candidate in payload["candidates"]}
    assert payload["selected"]["score"] > 0
    assert any(candidate["score"] > 0 for candidate in payload["candidates"])


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


def test_slide_deck_can_report_prepared_video_metadata(tmp_path, monkeypatch):
    video = tmp_path / "deck.mp4"
    cues = tmp_path / "deck.video.json"
    video.write_bytes(b"mp4")
    cues.write_text(
        '{"video_cues": [{"page": 1, "start": "0:03", "end": "0:08", "title": "Opening"}]}',
        encoding="utf-8",
    )
    monkeypatch.setattr(main, "DEFAULT_SLIDE_VIDEO", video)
    monkeypatch.setattr(main, "DEFAULT_SLIDE_VIDEO_CUES", cues)
    original_video_path = main._SLIDE_DECK["video_path"]
    original_video_paths = main._SLIDE_DECK["video_paths"]
    original_video_url = main._SLIDE_DECK["video_url"]
    original_video_urls = main._SLIDE_DECK["video_urls"]
    original_video_cues = main._SLIDE_DECK["video_cues"]
    original_video_cues_by_language = main._SLIDE_DECK["video_cues_by_language"]

    try:
        main._load_default_slide_video_metadata()
        response = client.get("/api/slides/deck")

        assert response.status_code == 200
        payload = response.json()
        assert payload["video_url"] == "/api/slides/video"
        assert payload["video_urls"] == {"ja": "/api/slides/video/ja"}
        assert payload["video_cues"] == [{"page": 1, "start_sec": 3.0, "end_sec": 8.0, "title": "Opening"}]
    finally:
        main._SLIDE_DECK["video_path"] = original_video_path
        main._SLIDE_DECK["video_paths"] = original_video_paths
        main._SLIDE_DECK["video_url"] = original_video_url
        main._SLIDE_DECK["video_urls"] = original_video_urls
        main._SLIDE_DECK["video_cues"] = original_video_cues
        main._SLIDE_DECK["video_cues_by_language"] = original_video_cues_by_language


def test_slide_deck_detects_japanese_and_english_video_files(tmp_path, monkeypatch):
    pdf = tmp_path / "General Meeting.pdf"
    pdf.write_bytes(b"%PDF")
    (tmp_path / "General Meeting_JP.mp4").write_bytes(b"jp")
    (tmp_path / "General Meeting_EN.mp4").write_bytes(b"en")
    (tmp_path / "General Meeting_EN.video.json").write_text(
        '{"cues": [{"page": 2, "start_sec": 12}]}',
        encoding="utf-8",
    )
    monkeypatch.setattr(main, "DEFAULT_SLIDE_PDF", pdf)
    monkeypatch.setattr(main, "DEFAULT_SLIDE_VIDEO", tmp_path / "missing.mp4")
    monkeypatch.setattr(main, "DEFAULT_SLIDE_VIDEO_CUES", tmp_path / "missing.video.json")
    monkeypatch.setattr(main, "PROJECT_ROOT", tmp_path)
    original_video_path = main._SLIDE_DECK["video_path"]
    original_video_paths = main._SLIDE_DECK["video_paths"]
    original_video_url = main._SLIDE_DECK["video_url"]
    original_video_urls = main._SLIDE_DECK["video_urls"]
    original_video_cues = main._SLIDE_DECK["video_cues"]
    original_video_cues_by_language = main._SLIDE_DECK["video_cues_by_language"]

    try:
        main._load_default_slide_video_metadata()
        response = client.get("/api/slides/deck")

        assert response.status_code == 200
        payload = response.json()
        assert payload["video_urls"] == {
            "ja": "/api/slides/video/ja",
            "en": "/api/slides/video/en",
        }
        assert payload["video_cues_by_language"] == {"en": [{"page": 2, "start_sec": 12.0}]}
    finally:
        main._SLIDE_DECK["video_path"] = original_video_path
        main._SLIDE_DECK["video_paths"] = original_video_paths
        main._SLIDE_DECK["video_url"] = original_video_url
        main._SLIDE_DECK["video_urls"] = original_video_urls
        main._SLIDE_DECK["video_cues"] = original_video_cues
        main._SLIDE_DECK["video_cues_by_language"] = original_video_cues_by_language


def test_slide_video_serves_configured_mp4(tmp_path):
    video = tmp_path / "deck.mp4"
    video.write_bytes(b"mp4")
    original_video_path = main._SLIDE_DECK["video_path"]

    try:
        main._SLIDE_DECK["video_path"] = str(video)
        response = client.get("/api/slides/video")

        assert response.status_code == 200
        assert response.headers["content-type"] == "video/mp4"
        assert response.content == b"mp4"
    finally:
        main._SLIDE_DECK["video_path"] = original_video_path


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
