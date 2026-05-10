# Style-Bert-VITS2 TTS Setup

Mirror can use a local Style-Bert-VITS2 FastAPI server for a trained personal voice model. The repository does not include model weights, voice recordings, generated audio, or the upstream Style-Bert-VITS2 checkout.

## Install Style-Bert-VITS2

Run this from the Mirror repository root on Windows:

```powershell
.\scripts\setup-style-bert-vits2.ps1
```

The script:

- clones `https://github.com/litagin02/Style-Bert-VITS2.git` into `third_party\Style-Bert-VITS2`
- checks out the known working commit `66de777e06392c0f313600be03c43ef96658b244`
- creates a Python 3.10 venv under `third_party\Style-Bert-VITS2\venv`
- installs CUDA 11.8 PyTorch and the dependencies needed for inference and local training
- runs `initialize.py`
- applies the Windows localhost patch for `pyopenjtalk_worker`
- raises the Style-Bert-VITS2 server text limit to `500`

Python 3.10 must be available through the Windows Python launcher as `py -3.10`.

## Add the Ota model

Model files are intentionally not committed. Place the trained model assets here:

```text
third_party\Style-Bert-VITS2\model_assets\Ota\
```

Mirror's default local `.env` expects:

```text
model_assets\Ota\Ota_e120_s1435.safetensors
```

The `Ota` directory should also contain the Style-Bert-VITS2 model `config.json` and style vectors produced by training. If you train your own voice, use your own recordings or recordings you have permission to use, then set these values in `.env`:

```text
MIRROR_TTS_ENGINE=style-bert-vits2
MIRROR_STYLE_BERT_VITS2_URL=http://127.0.0.1:5000
MIRROR_STYLE_BERT_VITS2_MODEL=Ota
MIRROR_STYLE_BERT_VITS2_SPEAKER=Ota
MIRROR_STYLE_BERT_VITS2_STYLE=Neutral
```

## Start and verify

Double-click:

```text
Start-Mirror.bat
```

This starts Style-Bert-VITS2 on `http://127.0.0.1:5000`, waits for the Ota model, starts the Mirror API on `http://127.0.0.1:8004`, and opens the frontend on `http://127.0.0.1:5173`.

Manual checks:

```powershell
Invoke-RestMethod http://127.0.0.1:5000/models/info
Invoke-RestMethod http://127.0.0.1:8004/api/health
```

If Style-Bert-VITS2 is unavailable, Mirror falls back to Windows SAPI so the rest of the app remains usable.
