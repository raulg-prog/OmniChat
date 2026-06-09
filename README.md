# OmniChat

A **free, local** app that merges live chat from Twitch, Kick, and YouTube into one
feed — with a point-and-click **control panel** and a transparent **OBS overlay**.
(Project/package scope stays `@sca/*`; "OmniChat" is the product name.)

- **Free:** every default path (Twitch IRC, YouTube InnerTube, Kick websocket) needs
  no paid API and no account. It runs entirely on your machine.
- **Easy:** no config files. Open the panel, paste a stream URL, click Add, copy the
  OBS link. Add/remove channels and restyle the overlay live — no restarts.
- **Rich:** the overlay shows native Twitch/Kick/YouTube emotes — plus **BTTV & 7TV** —
  as images (not text), behind solid brand pills per platform.

## For streamers — no install needed (Windows)
Don't want to touch a terminal? Use the prebuilt app:
1. Download **`ChatAggregator-win-x64.zip`** and unzip it anywhere.
2. Double-click **`Start OmniChat.cmd`**. Your browser opens the control panel automatically.
3. Paste a Twitch or YouTube stream URL → **Add**. In **OBS**, add a **Browser Source** pointing at `http://localhost:8787/`.
4. Keep the little black window open while you stream; close it to stop.

No Node, no account, no API keys — it bundles its own runtime and runs entirely on your PC.

## Run from source (developers)
```bash
pnpm install
pnpm dev          # dev mode (live reload)
pnpm serve        # production mode: builds, then runs the lean dist (~70 MB RAM)
pnpm package:win  # build the no-install Windows app -> build/ChatAggregator-win-x64.zip
```
Then:
1. Open the **control panel**: http://localhost:8787/panel
2. Paste a stream URL (e.g. `twitch.tv/xqc`) and click **Add**.
3. In **OBS**: add a **Browser Source** → URL `http://localhost:8787/` (the Copy button in the panel copies it).
4. Style the overlay from the panel — theme, font size, message count, per-platform toggles. Changes apply instantly.

Your sources and settings are saved to `apps/server/config.json` and restored next launch.

## Platforms (v1)
- **Twitch** — working out of the box (anonymous IRC, no token).
- **YouTube** — working, no API key (InnerTube via the `youtube-chat` lib). Paste a
  video URL, `youtu.be/…`, `youtube.com/live/…`, `/shorts/…`, `/channel/UC…`, or an `@handle`.
- **Kick** — working, no account. Clears Cloudflare on the chatroom-id lookup with a
  Chrome-impersonating TLS client (`impit`), then reads the open realtime Pusher websocket.
- **X** — **listed, but no readable chat.** X has no public live-chat read API, and we don't
  fabricate messages. `x.com/<handle>` URLs are accepted and labeled in the lineup; the card
  reads "no public chat API". (Twitch/Kick/YouTube are real live chat.)

## Layout
```
core                ChatMessage, ChatBus, ChatAdapter, parseStreamUrl()
adapter-*           one per platform (URL/name in → normalized message out)
server/             ChannelManager (runtime add/remove + JSON persistence),
                    REST API, ws fan-out, serves panel + overlay
server/public/      panel.html (control panel) · overlay.html (OBS source)
```
See `CLAUDE.md` for conventions when extending with Claude Code.

## Honest caveats
The YouTube and Kick default paths use unofficial endpoints (same as AxelChat). They're
free and need no account, but can break when those platforms change internals — expect
occasional maintenance. Twitch's path is stable.

**Kick specifically:** the channel→chatroom-id lookup sits behind Cloudflare bot
protection that returns **HTTP 403** to ordinary HTTP clients — it keys on the request's
TLS fingerprint, not the IP, so even a real home connection is blocked. We clear it with
[`impit`](https://www.npmjs.com/package/impit), which impersonates Chrome's TLS handshake
(verified working live and in the packaged app); the chat websocket itself is open. Because
this is an unofficial path, a future Cloudflare change could need a maintenance bump. The
sanctioned alternative — Kick's official OAuth API — delivers chat via webhooks that need a
public callback URL, which doesn't fit a local app, so we don't use it.

## Testing
```bash
pnpm test     # unit tests for parseStreamUrl + the Twitch/Kick normalizers (offline, no network)
```
