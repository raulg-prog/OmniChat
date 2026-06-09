import WebSocket from "ws";
import { Impit } from "impit";
import { emotes } from "@sca/emotes";
import { Backoff, type ChatAdapter, type ChatBus, type ChatMessage, type MessageFragment } from "@sca/core";

/**
 * Kick live chat — "paste a URL" model (matches AxelChat). No webhook server,
 * no ownership of the channel required.
 *
 *   1. Resolve the chatroom id from the channel slug via Kick's (unofficial)
 *      GET https://kick.com/api/v2/channels/{slug} -> chatroom.id.
 *   2. Connect to Kick's realtime websocket (Pusher protocol) and subscribe to
 *      channel `chatrooms.{chatroomId}.v2`.
 *   3. On `App\Events\ChatMessageEvent`, normalize into ChatMessage.
 *
 * Caveats: this rides Kick's internal Pusher infrastructure, so it's unofficial
 * and can break. The channel-resolve call (step 1) sits behind Cloudflare bot
 * protection that 403s ordinary HTTP clients by TLS fingerprint, so we resolve it
 * with `impit`, which impersonates Chrome's TLS handshake. The chat websocket
 * itself is open (no impersonation needed). Fails soft + retries with backoff.
 * If you OWN the channel, the sanctioned alternative is Kick's official API +
 * webhooks (OAuth 2.1, docs.kick.com) — but that needs a public callback URL,
 * so it's a poor fit for a local, no-account app.
 */
export interface KickAdapterOptions {
  /** Channel slug parsed from the URL, e.g. "xqc". */
  channel: string;
}

// Kick's public Pusher app key/cluster (same constants AxelChat and others use).
const PUSHER_KEY = "32cbd69e4b950bf97679";
const PUSHER_URL = `wss://ws-us2.pusher.com/app/${PUSHER_KEY}?protocol=7&client=js&version=8.4.0&flash=false`;
const CHAT_EVENT = "App\\Events\\ChatMessageEvent";

export class KickAdapter implements ChatAdapter {
  readonly platform = "kick";
  private ws?: WebSocket;
  private bus?: ChatBus;
  private stopped = false;
  private chatroomId?: number;
  private userId?: number; // channel's user_id — what BTTV/7TV key Kick emotes on
  private backoff = new Backoff();
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private opts: KickAdapterOptions) {}

  async start(bus: ChatBus): Promise<void> {
    this.bus = bus;
    this.stopped = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = undefined;
  }

  /** Live viewer count from the channel endpoint (impit). null when offline/unknown. */
  async getViewers(): Promise<number | null> {
    try {
      const res = await kickClient().fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(this.opts.channel)}`);
      if (res.status !== 200) return null;
      const json = (await res.json()) as { livestream?: { viewer_count?: unknown } | null };
      const v = json?.livestream?.viewer_count;
      return typeof v === "number" ? v : null; // livestream is null when offline
    } catch {
      return null;
    }
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    try {
      if (this.chatroomId === undefined) {
        const resolved = await resolveChannel(this.opts.channel);
        this.chatroomId = resolved.chatroomId;
        this.userId = resolved.userId;
        emotes.ensure("kick", this.userId); // BTTV/7TV in the background
        // Kick channel + global emotes by name (so non-subscribers' usage renders too).
        void fetchKickEmotes(this.opts.channel).then((e) => emotes.addEmotes("kick", this.userId, e));
      }
      this.openSocket(this.chatroomId);
    } catch (err) {
      console.warn(`[kick:${this.opts.channel}] connect failed: ${(err as Error).message}`);
      this.scheduleReconnect();
    }
  }

  private openSocket(chatroomId: number): void {
    const ws = new WebSocket(PUSHER_URL);
    this.ws = ws;

    ws.on("open", () => {
      ws.send(JSON.stringify({
        event: "pusher:subscribe",
        data: { auth: "", channel: `chatrooms.${chatroomId}.v2` },
      }));
    });

    ws.on("message", (data) => {
      let frame: { event?: string; data?: unknown };
      try { frame = JSON.parse(data.toString()); } catch { return; }

      if (frame.event === "pusher:connection_established") {
        this.backoff.reset(); // healthy connection — reset the floor
        return;
      }
      if (frame.event === "pusher:ping") {
        ws.send(JSON.stringify({ event: "pusher:pong", data: {} }));
        return;
      }
      if (frame.event === CHAT_EVENT && this.bus) {
        // Pusher wraps the real payload as a JSON-encoded string in `data`.
        let payload: unknown;
        try { payload = typeof frame.data === "string" ? JSON.parse(frame.data) : frame.data; }
        catch { return; }
        const msg = normalizeKick(payload, this.opts.channel);
        msg.fragments = emotes.expand("kick", this.userId, msg.fragments ?? []);
        this.bus.publish(msg);
      }
    });

    ws.on("close", () => this.scheduleReconnect());
    ws.on("error", () => ws.close());
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.connect(), this.backoff.next());
  }
}

// One shared impersonating client (impit mimics a real Chrome TLS handshake).
let impit: Impit | undefined;
function kickClient(): Impit {
  return (impit ??= new Impit({ browser: "chrome" }));
}

/**
 * Resolve a channel slug to its chatroom id (for the ws) and channel id (for emotes).
 * Kick's channel endpoint is behind Cloudflare bot protection that 403s normal HTTP
 * clients by TLS fingerprint; impit's Chrome impersonation gets a clean 200.
 */
async function resolveChannel(slug: string): Promise<{ chatroomId: number; userId: number }> {
  const res = await kickClient().fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`);
  if (res.status !== 200) throw new Error(`channel lookup HTTP ${res.status}`);
  const json = (await res.json()) as { id?: unknown; user_id?: unknown; chatroom?: { id?: unknown } };
  const chatroomId = json?.chatroom?.id;
  if (typeof chatroomId !== "number") throw new Error("no chatroom id in channel response");
  const userId =
    typeof json.user_id === "number" ? json.user_id
    : typeof json.id === "number" ? json.id
    : chatroomId;
  return { chatroomId, userId };
}

/** Fetch the channel's native Kick emotes (channel + global) as [name, imageUrl] pairs. */
async function fetchKickEmotes(slug: string): Promise<Array<[string, string]>> {
  try {
    const res = await kickClient().fetch(`https://kick.com/emotes/${encodeURIComponent(slug)}`);
    if (res.status !== 200) return [];
    const groups = (await res.json()) as Array<{ emotes?: Array<{ id?: unknown; name?: unknown }> }>;
    const out: Array<[string, string]> = [];
    for (const g of groups ?? []) {
      for (const e of g?.emotes ?? []) {
        if (e?.name != null && e?.id != null) {
          out.push([String(e.name), `https://files.kick.com/emotes/${e.id}/fullsize`]);
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Map a Kick ChatMessageEvent payload into the normalized shape. Pure — unit-testable. */
export function normalizeKick(payload: unknown, channel: string): ChatMessage {
  const p = (payload ?? {}) as {
    id?: unknown;
    content?: unknown;
    created_at?: unknown;
    sender?: { username?: unknown; identity?: { color?: unknown; badges?: unknown } };
  };
  const badgesRaw = Array.isArray(p.sender?.identity?.badges) ? p.sender!.identity!.badges : [];
  return {
    id: String(p.id ?? `${Date.now()}-${Math.random()}`),
    platform: "kick",
    channel,
    author: {
      name: String(p.sender?.username ?? "unknown"),
      color: typeof p.sender?.identity?.color === "string" ? p.sender.identity.color : undefined,
      badges: (badgesRaw as Array<{ type?: unknown; text?: unknown }>).map((b) => ({
        type: String(b?.type ?? ""),
        label: b?.text ? String(b.text) : undefined,
      })),
    },
    text: cleanKickText(String(p.content ?? "")),
    fragments: buildKickFragments(String(p.content ?? "")),
    timestamp: typeof p.created_at === "string" ? Date.parse(p.created_at) : Date.now(),
    raw: payload,
  };
}

/** Kick inlines emotes in message text as [emote:12345:name]; show just the name. */
export function cleanKickText(s: string): string {
  return s.replace(/\[emote:\d+:([^\]]+)\]/g, "$1");
}

/** Build native-emote fragments from Kick content: [emote:ID:name] -> image fragment. */
export function buildKickFragments(content: string): MessageFragment[] {
  const out: MessageFragment[] = [];
  const re = /\[emote:(\d+):([^\]]+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) out.push({ type: "text", text: content.slice(last, m.index) });
    out.push({ type: "emote", name: m[2], url: `https://files.kick.com/emotes/${m[1]}/fullsize` });
    last = re.lastIndex;
  }
  if (last < content.length) out.push({ type: "text", text: content.slice(last) });
  return out;
}
