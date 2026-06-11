#!/bin/bash
# ===== OmniChat one-click launcher (macOS / Linux) =====
# On macOS: double-click. First time, you may need: right-click > Open,
# and once in Terminal run: chmod +x "start-omnichat.command"
cd "$(dirname "$0")" || exit 1

if ! command -v pnpm >/dev/null 2>&1; then
  echo
  echo "  pnpm was not found."
  echo "  1) Install Node.js LTS from the page that just opened"
  echo "  2) Then run once:  npm install -g pnpm"
  echo "  3) Open this file again."
  echo
  open "https://nodejs.org/en/download" 2>/dev/null || xdg-open "https://nodejs.org/en/download" 2>/dev/null
  read -r -p "Press Enter to exit..." _
  exit 1
fi

# Free port 8787 if a previous run is still holding it
lsof -ti tcp:8787 2>/dev/null | xargs kill -9 2>/dev/null

if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only, ~1 min)..."
  pnpm install
fi

# Open the browser a few seconds after the server starts
( sleep 9; (open "http://localhost:8787" 2>/dev/null || xdg-open "http://localhost:8787" 2>/dev/null) ) &

echo
echo "  OmniChat is starting. Keep this window open while you use it."
echo "  Landing: http://localhost:8787   Tool: /panel   Viewer: /live"
echo "  (Press Ctrl+C here to stop.)"
echo
pnpm start
