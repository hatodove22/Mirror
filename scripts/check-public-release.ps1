$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$tracked = @(git ls-files)
$staged = @(git diff --cached --name-only)
$pathsToCheck = @($tracked + $staged | Sort-Object -Unique)
$failed = $false

$blockedPathPatterns = @(
  '(^|/)\.env$',
  '(^|/)\.env\.local$',
  '(^|/)\.env\..*\.local$',
  '^third_party/',
  '^data/voice-samples/',
  '^output/',
  '^tmp/',
  '\.mp4$',
  '\.m4a$',
  '\.wav$',
  '\.safetensors$',
  '\.pth$'
)

foreach ($path in $pathsToCheck) {
  $normalized = $path -replace '\\', '/'
  foreach ($pattern in $blockedPathPatterns) {
    if ($normalized -match $pattern) {
      Write-Error "Blocked path is tracked or staged: $path"
      $failed = $true
    }
  }

  if (Test-Path $path) {
    $item = Get-Item $path
    if ($item.Length -gt 100MB) {
      Write-Error "Tracked or staged file exceeds 100MB: $path ($($item.Length) bytes)"
      $failed = $true
    }
  }
}

$secretPattern = '(?i)(api[_-]?key|client[_-]?secret|private[_-]?key|access[_-]?token|auth[_-]?token|hf_token|github_token|password\s*=|bearer\s+[a-z0-9._-]{20,}|BEGIN (RSA|OPENSSH|DSA|EC|PRIVATE) KEY)'
foreach ($path in $tracked) {
  if (($path -replace '\\', '/') -eq 'scripts/check-public-release.ps1') {
    continue
  }
  if (-not (Test-Path $path)) {
    continue
  }
  $item = Get-Item $path
  if ($item.Length -gt 5MB) {
    continue
  }
  $content = Get-Content $path -Raw -ErrorAction SilentlyContinue
  if ($content -match $secretPattern) {
    Write-Error "Potential secret matched in tracked file: $path"
    $failed = $true
  }
}

if ($failed) {
  throw "Public release check failed."
}

Write-Host "Public release check passed."
