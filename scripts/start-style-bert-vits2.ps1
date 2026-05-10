$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$styleBertRoot = Join-Path $repoRoot "third_party\Style-Bert-VITS2"
$python = Join-Path $styleBertRoot "venv\Scripts\python.exe"
$server = Join-Path $styleBertRoot "server_fastapi.py"
$expectedModel = "model_assets\Ota\Ota_e120_s1435.safetensors"
$url = "http://127.0.0.1:5000/models/info"

function Test-OtaServer {
  try {
    $info = Invoke-RestMethod -Uri $url -TimeoutSec 2
  } catch {
    return $false
  }

  foreach ($entry in $info.PSObject.Properties.Value) {
    if ($entry.model_path -eq $expectedModel) {
      return $true
    }
  }

  return $false
}

if (-not (Test-Path $python)) {
  Write-Host "[Mirror TTS] Style-Bert-VITS2 venv was not found: $python"
  Write-Host "[Mirror TTS] Run the setup/training steps before launching Mirror with Ota voice."
  pause
  exit 1
}

if (-not (Test-Path $server)) {
  Write-Host "[Mirror TTS] server_fastapi.py was not found: $server"
  pause
  exit 1
}

if (Test-OtaServer) {
  Write-Host "[Mirror TTS] Style-Bert-VITS2 is already running with Ota."
  Start-Sleep -Seconds 3
  exit 0
}

Write-Host "[Mirror TTS] Starting Style-Bert-VITS2 with Ota model on http://127.0.0.1:5000"
Write-Host "[Mirror TTS] Expected model: $expectedModel"
Set-Location $styleBertRoot
& $python $server
