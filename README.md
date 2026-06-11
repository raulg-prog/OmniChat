# OmniChat

**One feed. Every audience.** A real-time chat aggregator that unifies live chat from
**Twitch, Kick, X, and YouTube** into a single, source-labeled, color-coded stream — plus a
public watch page and live audience intelligence. Built in the *Market Bubble* house style
for the $10,000 Vibe Code Challenge.

> Most aggregators fake X with a "replay." OmniChat reads **real** X broadcast chat.

## Three surfaces

| Page | URL | Who it's for |
|------|-----|--------------|
| **Landing** | `/` | The front door — what it is, animated live demo |
| **Tool** | `/panel` | The operator's control room: add streams, combined chat, audience analytics (mood, msgs/min, platform mix, top chatters), slow-chat, search |
| **Viewer** | `/live` | The public watch page: every stream in a grid (click one to focus) with the combined chat docked alongside |
| OBS overlay | `/overlay` | Optional transparent overlay for an OBS Browser Source |

## Quick start

**You need [Node.js](https://nodejs.org/en/download) (LTS) + pnpm** (`npm install -g pnpm`).

### One-click
- **Windows:** double-click **`Start OmniChat.cmd`**
- **macOS / Linux:** double-click **`start-omnichat.command`** (first time: right-click → Open; or `chmod +x start-omnichat.command`)

It installs dependencies on first run, frees the port, starts the server, and opens
`http://localhost:8787` in your browser.

### Or from a terminal
```bash
pnpm install
pnpm start        # builds packages, then serves on http://localhost:8787
```

## Adding streams

In the **Tool** (`/panel`) → **Resources**, paste any of these and click **Add**:

- `twitch.tv/<channel>` — **no login** (anonymous IRC)
- `kick.com/<channel>` — **no login** (public realtime socket)
- `youtube.com/watch?v=<id>` / `youtu.be/<id>` / `@handle` — **no login** (InnerTube)
- `x.com/i/broadcasts/<id>` — needs a one-time **Connect X** (see below)

Twitch, Kick, and YouTube need **zero accounts or API keys**.

## Connecting X (only for X chat)

X has no anonymous way to read a live broadcast's chat, so the **operator connects an X
account once** and the server mints/refreshes chat tokens from that session. Public viewers
never log in — they just watch.

1. One-time on the host: `pnpm --filter @sca/server exec playwright install chromium`
2. In **Resources** → **Connect X** → log in to x.com in the window that opens (your
   password is typed into real x.com; we only persist the session locally, gitignored).
3. Add any `x.com/i/broadcasts/<id>` — the token is minted automatically and auto-refreshes.

*(No login? You can also paste a broadcast `access_token` manually — Connect X just automates it.)*

## How the chat is read

| Platform | Method | Account? |
|----------|--------|----------|
| Twitch | Anonymous IRC-over-WebSocket | No |
| Kick | Realtime (Pusher) socket; Cloudflare cleared via TLS impersonation | No |
| YouTube | InnerTube live-chat continuation | No |
| X | Periscope "chatman" websocket via a server-held x.com session | Operator, once |

## Tech

- TypeScript · ESM · pnpm workspaces · Fastify + `ws`
- `packages/core` (message contract) · `adapter-*` (one per platform) · `@sca/emotes` (BTTV/7TV)
- `apps/server` — runtime channel manager, REST + websocket fan-out, serves the pages
- X session handled by Playwright (server-side only)

## Notes

- Unofficial endpoints (YouTube InnerTube, Kick socket, X chatman) can change — they're free
  and need no account, but may need occasional maintenance.
- The X session lives in `apps/server/.x-userdata/` and is **never committed**.
- Your added streams + settings persist to `apps/server/config.json` (also gitignored).
