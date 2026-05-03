$ErrorActionPreference = "Stop"

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

if (-not (Test-Path ".venv")) {
  py -m venv .venv
}

.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r ".\backend\requirements.txt"
.\.venv\Scripts\python.exe -m pip install ruff

npm install
npm --prefix frontend install

Write-Host "Setup complete. Run npm run dev to start Vite and FastAPI."
