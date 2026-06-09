# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

# OmniChat — working notes for Claude Code

A LOCAL app ("OmniChat"; internal package scope stays `@sca/*`) that pulls live chat from
multiple platforms BY URL and renders one combined feed as a transparent OBS Browser Source overlay.

Model = AxelChat (paste any public stream URL, no account/ownership needed),
NOT Restream (cloud, only your own connected channels via OAuth).

## Fixed decisions (do not relitigate)
- TypeScript + ESM. pnpm workspaces. Runs locally on the streamer's machine.
- `packages/core` is the contract: `ChatMessage` + `MessageFragment` (types.ts),
  `ChatBus` (bus.ts), `ChatAdapter` (adapter.ts), `parseStreamUrl()` (url.ts), and the
  shared `Backoff` helper (backoff.ts). Add fields to `ChatMessage` first, then update
  all adapters. No per-platform shapes downstream.
- Messages carry `fragments` (text | emote{url}); adapters build NATIVE emote fragments,
  then `@sca/emotes` (BTTV + 7TV, global cached once + per-channel) expands text runs.
  Channel/sub emotes typed by NON-subscribers arrive as plain text, so they're also
  resolved by name (Kick `kick.com/emotes/{slug}`; Twitch `emotes.adamcy.pl`) and fed via
  `emotes.addEmotes`. The overlay renders fragments as `<img>`, falling back to plain `text`.
- Dependency direction: adapters -> core (+ `@sca/emotes` for Twitch/Kick); server ->
  core + adapters; core -> nothing; emotes -> core (types only).
- Every adapter implements `ChatAdapter`, emits normalized messages onto the bus,
  and never touches the ws/HTTP layer. Twitch is the reference adapter.
- Config is just a list of stream URLs in `CHANNELS`. The server uses
  `parseStreamUrl` to route each URL to the right adapter.
- Output is a transparent overlay served at `/`, loaded as an OBS Browser Source.

## scope: Twitch, Kick, X = the main 3 (matches the contest brief "Twitch + X + Kick").
## YouTube is an additive 4th. X is a labeled REPLAY (no public live-chat API); the rest are live.

## How each platform's chat is obtained (the part that bites people)
- **Twitch** — DONE. Anonymous IRC over WebSocket (justinfan login, no token).
  Channel name comes from the URL. EventSub is a nicer future path but needs OAuth.
- **YouTube** — DONE via the `youtube-chat` lib (path B: InnerTube continuation tokens,
  no key/quota, "any URL" UX; against YT ToS, fragile, no private/age-restricted streams).
  Alternative (A) Official Data API v3 is sanctioned but has a ~10k unit/day quota and a
  clunky liveChatId lookup — switch only if ToS-compliance matters more than UX.
- **Kick** — DONE. Resolve chatroom id from the slug, then subscribe to Kick's realtime
  (Pusher) websocket `chatrooms.{id}.v2`. The slug→id resolve is Cloudflare-blocked for
  plain HTTP (403 by TLS fingerprint); we clear it with `impit` (Chrome TLS impersonation).
  Unofficial/may break. Sanctioned alternative if you OWN the channel: Kick official API +
  webhooks (OAuth 2.1, docs.kick.com) — but webhooks need a public URL, so it's a poor fit
  for a local app; add a separate KickWebhookAdapter only if you run a server you control.
- **X** — no public API to READ live-stream chat (RTMP key is broadcast-only; scraping the
  live page is fragile/ToS-breaking). Implemented as a labeled REPLAY (`adapter-x`): a
  playback of representative messages onto the same bus, so X appears in the unified feed +
  combined viewer count and is marked "replay" in the UI. Swap the body of `emit()` /
  `getViewers()` for a real source if X ever ships a public chat-read API.

## Conventions
- Secrets via `process.env` only; never hardcode; never commit `.env`.
- Every adapter implements reconnect-with-exponential-backoff from the start, via the
  shared `Backoff` helper in core (don't hand-roll per-adapter backoff math).
- Scraping paths (YouTube InnerTube, Kick ws) are fragile — wrap in try/catch,
  log clearly, and fail soft (one platform dying must not take down the others).
- Record real payloads to `fixtures/` and unit-test `normalize()` + `parseStreamUrl()`
  offline so parsing can be iterated without a live stream.

## Build order
1. core (done)  2. Twitch end-to-end (done)
3. YouTube via `youtube-chat` (done — no key, verified live)
4. Kick via realtime ws (done — chatroom-id lookup clears Cloudflare via `impit` TLS
   impersonation; verified live + in the packaged Windows app. No account needed.)
5. polish (done) — brand pills + inline emote images (native + BTTV/7TV), OmniChat panel redesign.

## Packaging (Windows, no-install)
- `pnpm package:win` (scripts/package-win.ps1) -> `build/OmniChat/` + `OmniChat-win-x64.zip`:
  bundled portable `node.exe` + the pnpm-deployed server + a double-click `Start OmniChat.cmd`.
- MUST deploy with `--node-linker=hoisted` (a flat, symlink-free node_modules survives the
  copy; the default isolated linker's `.pnpm` symlinks break -> ERR_MODULE_NOT_FOUND).
- The launcher sets `SCA_OPEN_BROWSER=1`; the server then auto-opens the panel. Keep all
  `scripts/*.ps1` ASCII-only (Windows PowerShell 5.1 mis-parses BOM-less UTF-8).

## Control panel + runtime management (added)
- `server/src/manager.ts` (ChannelManager) owns adapters at runtime: `add(url)`,
  `remove(id)`, `updateSettings()`, and persists `{channels, settings}` to
  `apps/server/config.json`. No database — keep it a flat JSON file (easy to inspect).
- REST: GET `/api/state`, POST `/api/channels {url}`, DELETE `/api/channels/:id`,
  PUT `/api/settings`. The ws broadcasts `{kind:"message"|"channels"|"settings"|"viewers"}`.
- Viewer counts: each adapter's optional `getViewers()` (Twitch=decapi, Kick=channel API
  via impit, YouTube=watch-page scrape — all no-auth); manager `pollViewers()` runs every
  30s + on add; panel shows per-stream counts + a combined header total.
- The panel "Unified Chat" feed labels each row with platform + channel (whose stream).
  The `slowMs` setting paces message display (client-side queue + capped backlog) for readability.
- Two static pages: `/panel` (control panel) and `/` (OBS overlay). The overlay is
  driven live by settings broadcast over ws — never hardcode appearance in overlay.html.
- "Live vs waiting" status is inferred from whether a channel has produced a message
  recently (panel tracks this client-side) — an offline or quiet channel shows "waiting".
- Design intent: panel = clean broadcast dashboard (Inter, warm dark-gray + orange
  (Claude) accent, per-platform brand colors). Overlay = clean/legible over gameplay.
