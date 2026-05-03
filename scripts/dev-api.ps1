$ErrorActionPreference = "Stop"

if (Test-Path ".env") {
  Get-Content ".env" | ForEach-Object {
    if ($_ -match "^\s*#" -or $_ -notmatch "=") {
      return
    }

    $name, $value = $_ -split "=", 2
    if ($name) {
      [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
    }
  }
}

$hostName = if ($env:API_HOST) { $env:API_HOST } else { "127.0.0.1" }
$port = if ($env:API_PORT) { $env:API_PORT } else { "8000" }
$appModule = if ($env:API_APP_MODULE) { $env:API_APP_MODULE } else { "backend.app.main:app" }
$reload = if ($env:API_RELOAD) { $env:API_RELOAD.ToLowerInvariant() } else { "true" }

$argsList = @($appModule, "--host", $hostName, "--port", $port)
if ($reload -eq "true" -or $reload -eq "1" -or $reload -eq "yes") {
  $argsList += "--reload"
}

if (Test-Path ".\.venv\Scripts\python.exe") {
  .\.venv\Scripts\python.exe -m uvicorn @argsList
} else {
  py -m uvicorn @argsList
}
