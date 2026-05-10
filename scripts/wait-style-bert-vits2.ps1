param(
  [int]$TimeoutSeconds = 45
)

$expectedModel = "model_assets\Ota\Ota_e120_s1435.safetensors"
$url = "http://127.0.0.1:5000/models/info"
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

while ((Get-Date) -lt $deadline) {
  try {
    $info = Invoke-RestMethod -Uri $url -TimeoutSec 2
    foreach ($entry in $info.PSObject.Properties.Value) {
      if ($entry.model_path -eq $expectedModel) {
        Write-Host "[Mirror TTS] Ota model is ready."
        exit 0
      }
    }
  } catch {
    # Server is still loading.
  }

  Start-Sleep -Seconds 2
}

Write-Host "[Mirror TTS] Ota model was not ready before timeout; Mirror will keep starting."
exit 0
