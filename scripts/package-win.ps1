# Builds a portable, no-install Windows distribution of OmniChat.
# Output: build\OmniChat\ (the app folder) and build\OmniChat-win-x64.zip
#
# The result needs NO Node, NO pnpm, NO terminal on the target machine: the streamer
# unzips it and double-clicks "Start OmniChat.cmd".
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$nodeVersion = (& node -v).Trim()                 # bundle the same Node the app is tested on
$build = Join-Path $repo 'build'
$out   = Join-Path $build 'OmniChat'
$zip   = Join-Path $build 'OmniChat-win-x64.zip'
$cache = Join-Path $build '.cache'

Write-Host "==> Building workspace..." -ForegroundColor Cyan
& pnpm build

Write-Host "==> Resetting $out ..." -ForegroundColor Cyan
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $build, $cache | Out-Null

Write-Host "==> Deploying server with flattened production deps (pnpm deploy, hoisted)..." -ForegroundColor Cyan
# node-linker=hoisted => a flat, symlink-free node_modules that survives being copied
# to another machine (the default isolated linker uses .pnpm symlinks that break on copy).
& pnpm --filter=@sca/server --node-linker=hoisted deploy --prod (Join-Path $out 'app')
if (-not (Test-Path (Join-Path $out 'app\dist\index.js'))) { throw "deploy did not produce app\dist\index.js" }
if (-not (Test-Path (Join-Path $out 'app\node_modules\youtube-chat'))) { throw "deploy did not hoist youtube-chat - node_modules is not portable" }

Write-Host "==> Bundling portable Node runtime ($nodeVersion)..." -ForegroundColor Cyan
$nodeZip = Join-Path $cache "node-$nodeVersion-win-x64.zip"
$nodeDir = Join-Path $cache "node-$nodeVersion-win-x64"
if (-not (Test-Path $nodeZip)) {
  Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip" -OutFile $nodeZip
}
if (-not (Test-Path $nodeDir)) { Expand-Archive -Path $nodeZip -DestinationPath $cache -Force }
Copy-Item (Join-Path $nodeDir 'node.exe') (Join-Path $out 'node.exe') -Force

Write-Host "==> Writing launcher + readme (CRLF/ASCII)..." -ForegroundColor Cyan
$cmd = @'
@echo off
title OmniChat
cd /d "%~dp0"
set SCA_OPEN_BROWSER=1
echo Starting OmniChat...
echo.
"%~dp0node.exe" "%~dp0app\dist\index.js"
echo.
echo OmniChat has stopped. You can close this window.
pause >nul
'@
[IO.File]::WriteAllText((Join-Path $out 'Start OmniChat.cmd'), ($cmd -replace "`r?`n","`r`n"), [Text.Encoding]::ASCII)

$readme = @'
OmniChat - quick start
======================

1. Double-click  "Start OmniChat.cmd".
   (If Windows warns it is from an unknown publisher, click "More info" -> "Run anyway".)

2. Your web browser opens the control panel automatically.
   If it does not, open this address yourself:  http://localhost:8787/panel

3. Paste a Twitch, Kick, or YouTube stream URL and click Add.

4. In OBS (or Streamlabs / XSplit): add a "Browser" source with this URL:
        http://localhost:8787/
   (the Copy button in the panel copies it for you). Set it to ~800 x 600.

5. Keep the small black window open while you stream.
   Close it, or press Ctrl+C, to stop.

No account, no API keys, nothing to install - everything runs on your own PC,
and it is completely free.

Notes
-----
- Twitch, Kick, and YouTube all work with no account or API key.
- Emotes (including BTTV and 7TV) render as images on the overlay.
- Your stream list and overlay settings are saved next to this app, in config.json.
'@
[IO.File]::WriteAllText((Join-Path $out 'READ ME FIRST.txt'), ($readme -replace "`r?`n","`r`n"), [Text.Encoding]::ASCII)

Write-Host "==> Zipping..." -ForegroundColor Cyan
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $out -DestinationPath $zip

$sizeMB = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host ""
Write-Host "Done. Distributable created:" -ForegroundColor Green
Write-Host "  Folder: $out"
Write-Host "  Zip:    $zip  ($sizeMB MB)"
