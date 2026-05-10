param(
  [string]$StyleBertRepo = "https://github.com/litagin02/Style-Bert-VITS2.git",
  [string]$StyleBertCommit = "66de777e06392c0f313600be03c43ef96658b244",
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$thirdParty = Join-Path $repoRoot "third_party"
$styleBertRoot = Join-Path $thirdParty "Style-Bert-VITS2"
$venvPath = Join-Path $styleBertRoot "venv"
$python = Join-Path $styleBertRoot "venv\Scripts\python.exe"

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found on PATH."
  }
}

function Patch-TextFile {
  param(
    [string]$Path,
    [string]$Pattern,
    [string]$Replacement
  )
  if (-not (Test-Path $Path)) {
    throw "Expected file was not found: $Path"
  }
  $text = Get-Content $Path -Raw
  $updated = [regex]::Replace($text, $Pattern, $Replacement)
  if ($updated -ne $text) {
    Set-Content -Path $Path -Value $updated -NoNewline -Encoding UTF8
    Write-Host "[Style-Bert-VITS2] Patched $Path"
  }
}

Require-Command git
Require-Command py

if (-not (Test-Path $thirdParty)) {
  New-Item -ItemType Directory -Path $thirdParty | Out-Null
}

if (-not (Test-Path $styleBertRoot)) {
  git clone $StyleBertRepo $styleBertRoot
}

git -C $styleBertRoot fetch --tags --quiet
git -C $styleBertRoot checkout $StyleBertCommit

$workerClient = Join-Path $styleBertRoot "style_bert_vits2\nlp\japanese\pyopenjtalk_worker\worker_client.py"
$workerServer = Join-Path $styleBertRoot "style_bert_vits2\nlp\japanese\pyopenjtalk_worker\worker_server.py"
$configYml = Join-Path $styleBertRoot "config.yml"
Patch-TextFile -Path $workerClient -Pattern "socket\.gethostname\(\)" -Replacement '"127.0.0.1"'
Patch-TextFile -Path $workerServer -Pattern "socket\.gethostname\(\)" -Replacement '"127.0.0.1"'
Patch-TextFile -Path $configYml -Pattern "(?m)^(\s*limit:\s*)100\s*$" -Replacement '${1}500'

if (-not (Test-Path $python)) {
  py -3.10 -m venv $venvPath
}

if (-not $SkipInstall) {
  & $python -m pip install --upgrade pip setuptools wheel
  & $python -m pip install "torch<2.4" "torchaudio<2.4" --index-url https://download.pytorch.org/whl/cu118
  & $python -m pip install -r (Join-Path $styleBertRoot "requirements-infer.txt")
  & $python -m pip install "transformers<5" "huggingface-hub<1" "tokenizers<0.20" "setuptools<81"
  & $python -m pip install "librosa==0.9.2" "protobuf==4.25" punctuators pyloudnorm stable-ts tensorboard
}

Push-Location $styleBertRoot
try {
  & $python initialize.py
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "[Style-Bert-VITS2] Setup complete."
Write-Host "[Style-Bert-VITS2] Place the Ota model files under:"
Write-Host "  $styleBertRoot\model_assets\Ota"
Write-Host "[Style-Bert-VITS2] Expected default model for Mirror:"
Write-Host "  model_assets\Ota\Ota_e120_s1435.safetensors"
Write-Host "[Style-Bert-VITS2] Start Mirror with Start-Mirror.bat after the model files are in place."
