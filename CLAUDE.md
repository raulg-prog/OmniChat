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

# CLAUDE.md — Frontend Website Rules

## Always Do First
- **Invoke the `frontend-design` skill** before writing any frontend code, every session, no exceptions.

## Reference Images
- If a reference image is provided: match layout, spacing, typography, and color exactly. Swap in placeholder content (images via `https://placehold.co/`, generic copy). Do not improve or add to the design.
- If no reference image: design from scratch with high craft (see guardrails below).
- Screenshot your output, compare against reference, fix mismatches, re-screenshot. Do at least 2 comparison rounds. Stop only when no visible differences remain or user says so.

## Local Server
- **Always serve on localhost** — never screenshot a `file:///` URL.
- Start the dev server: `node serve.mjs` (serves the project root at `http://localhost:3000`)
- `serve.mjs` lives in the project root. Start it in the background before taking any screenshots.
- If the server is already running, do not start a second instance.

## Screenshot Workflow
- Puppeteer is installed at `C:/Users/nateh/AppData/Local/Temp/puppeteer-test/`. Chrome cache is at `C:/Users/nateh/.cache/puppeteer/`.
- **Always screenshot from localhost:** `node screenshot.mjs http://localhost:3000`
- Screenshots are saved automatically to `./temporary screenshots/screenshot-N.png` (auto-incremented, never overwritten).
- Optional label suffix: `node screenshot.mjs http://localhost:3000 label` → saves as `screenshot-N-label.png`
- `screenshot.mjs` lives in the project root. Use it as-is.
- After screenshotting, read the PNG from `temporary screenshots/` with the Read tool — Claude can see and analyze the image directly.
- When comparing, be specific: "heading is 32px but reference shows ~24px", "card gap is 16px but should be 24px"
- Check: spacing/padding, font size/weight/line-height, colors (exact hex), alignment, border-radius, shadows, image sizing

## Output Defaults
- Single `index.html` file, all styles inline, unless user says otherwise
- Tailwind CSS via CDN: `<script src="https://cdn.tailwindcss.com"></script>`
- Placeholder images: `https://placehold.co/WIDTHxHEIGHT`
- Mobile-first responsive

## Brand Assets
- Always check the `brand_assets/` folder before designing. It may contain logos, color guides, style guides, or images.
- If assets exist there, use them. Do not use placeholders where real assets are available.
- If a logo is present, use it. If a color palette is defined, use those exact values — do not invent brand colors.

## Anti-Generic Guardrails
- **Colors:** Never use default Tailwind palette (indigo-500, blue-600, etc.). Pick a custom brand color and derive from it.
- **Shadows:** Never use flat `shadow-md`. Use layered, color-tinted shadows with low opacity.
- **Typography:** Never use the same font for headings and body. Pair a display/serif with a clean sans. Apply tight tracking (`-0.03em`) on large headings, generous line-height (`1.7`) on body.
- **Gradients:** Layer multiple radial gradients. Add grain/texture via SVG noise filter for depth.
- **Animations:** Only animate `transform` and `opacity`. Never `transition-all`. Use spring-style easing.
- **Interactive states:** Every clickable element needs hover, focus-visible, and active states. No exceptions.
- **Images:** Add a gradient overlay (`bg-gradient-to-t from-black/60`) and a color treatment layer with `mix-blend-multiply`.
- **Spacing:** Use intentional, consistent spacing tokens — not random Tailwind steps.
- **Depth:** Surfaces should have a layering system (base → elevated → floating), not all sit at the same z-plane.

## Hard Rules
- Do not add sections, features, or content not in the reference
- Do not "improve" a reference design — match it
- Do not stop after one screenshot pass
- Do not use `transition-all`
- Do not use default Tailwind blue/indigo as primary color

## Working agreement (added by user)
- **Never `git commit` or `git push` unless the user explicitly says to.** Make changes locally and wait for the go-ahead.
- **Discuss first, then implement.** For any change or fix, talk through the approach and align with the user BEFORE editing code — don't jump straight to building.

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
## YouTube is an additive 4th. X is listed but has NO readable chat (no public API; no
## fabricated messages); Twitch/Kick/YouTube are real live chat.

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
- **X** — REAL chat IS readable via the legacy Periscope "chatman" stack (VERIFIED LIVE 2026-06-09).
  1. broadcast_id from `x.com/i/broadcasts/{id}` (or resolve from `x.com/{user}/livechat`).
  2. `POST https://proxsee-cf.pscp.tv/api/v2/accessChat` body `{"broadcast_id":id}` or `{"room_id":id}`
     -> returns `{access_token, endpoint, room_id, ...}`. NOT anonymous: 400 without the viewer's
     x.com session; the real request is served via a service worker (auth headers partly hidden),
     so the admin supplies/refreshes the token for now. The token works from the SERVER (not IP-bound).
  3. ws `wss://prod-chatman-ancillary-us-east-1.pscp.tv/chatapi/v1/chatnow` (endpoint+`/chatapi/v1/chatnow`).
  4. Handshake = DOUBLE-WRAPPED JSON (ChatGPT's bare `{access_token}` guess was wrong):
     auth  `{kind:3, payload: JSON.stringify({access_token})}`
     join  `{kind:2, payload: JSON.stringify({body: JSON.stringify({room}), kind:1})}`
  5. Incoming frame = `{kind, payload, signature?}`; `JSON.parse(payload)`:
     - CHAT (outer kind 1): `payload.sender` = `{user_id, username, display_name, profile_image_url, verified}`;
       message text = `JSON.parse(payload.body).body`. Author = `sender.display_name || sender.username`.
     - OCCUPANCY (outer kind 2 -> inner kind 4): `JSON.parse(payload.body)` = `{room, occupancy, total_participants}`.
  Replaces the old no-op adapter once `adapter-x` is built against this flow.

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
- Design intent: panel = clean broadcast dashboard (Inter, cool dark-gray + mint accent,
  per-platform brand colors). Overlay = clean/legible over gameplay.
