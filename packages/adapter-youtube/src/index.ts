import { LiveChat } from "youtube-chat";
import { Backoff, type ChatAdapter, type ChatBus, type ChatMessage, type MessageFragment } from "@sca/core";

/**
 * YouTube live chat via the `youtube-chat` library (InnerTube continuation method,
 * path B in the design notes): NO API key, NO quota, "paste a URL" UX. It parses
 * the watch/popout page for the continuation token and polls the internal
 * live_chat endpoint. Trade-off: it rides YouTube internals, so it's against ToS,
 * is fragile to internal changes, and won't see private/age-restricted streams.
 * Swap to the official Data API v3 later if ToS-compliance matters more than UX.
 *
 * The parsed `channel` may be a video id, an @handle, or a UC… channel id — the
 * library resolves the currently-live video for handle/channel ids on its own.
 */
export interface YouTubeAdapterOptions {
  /** Video id, @handle, or UC… channel id resolved from the URL by parseStreamUrl. */
  channel: string;
}

export class YouTubeAdapter implements ChatAdapter {
  readonly platform = "youtube";
  private bus?: ChatBus;
  private stopped = false;
  private live?: LiveChat;
  private backoff = new Backoff();
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private opts: YouTubeAdapterOptions) {}

  async start(bus: ChatBus): Promise<void> {
    this.bus = bus;
    this.stopped = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.live?.stop();
    this.live = undefined;
  }

  /** Concurrent viewers scraped from the live watch page. null when offline/unknown. */
  async getViewers(): Promise<number | null> {
    try {
      const res = await fetch(youtubeWatchUrl(this.opts.channel), { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) return null;
      const m = (await res.text()).match(/"originalViewCount":"(\d+)"/);
      return m ? Number(m[1]) : null;
    } catch {
      return null;
    }
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const live = new LiveChat(liveChatId(this.opts.channel));
    this.live = live;

    live.on("chat", (item) => {
      if (this.bus) this.bus.publish(normalizeYouTube(item, this.opts.channel));
    });
    // An unhandled "error" event would throw and crash the process — swallow and
    // let reconnect-on-"end" handle recovery. The library keeps polling otherwise.
    live.on("error", (err) =>
      console.warn(`[youtube:${this.opts.channel}] ${(err as Error)?.message ?? err}`));
    live.on("end", () => this.scheduleReconnect());

    try {
      const ok = await live.start();
      if (ok) this.backoff.reset();
      else this.scheduleReconnect(); // not live yet — retry so we catch it going live
    } catch (err) {
      console.warn(`[youtube:${this.opts.channel}] start failed: ${(err as Error).message}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.connect(), this.backoff.next());
  }
}

/** Pick the right youtube-chat lookup key from the parsed channel string. */
function liveChatId(channel: string): { handle: string } | { channelId: string } | { liveId: string } {
  if (channel.startsWith("@")) return { handle: channel };
  if (/^UC[\w-]{20,}$/.test(channel)) return { channelId: channel };
  return { liveId: channel };
}

/** Live watch URL for the channel/video, used to scrape the concurrent viewer count. */
function youtubeWatchUrl(channel: string): string {
  if (channel.startsWith("@")) return `https://www.youtube.com/${channel}/live`;
  if (/^UC[\w-]{20,}$/.test(channel)) return `https://www.youtube.com/channel/${channel}/live`;
  return `https://www.youtube.com/watch?v=${channel}`;
}

/** Map a youtube-chat ChatItem into the normalized shape. Pure — unit-testable. */
export function normalizeYouTube(item: unknown, channel: string): ChatMessage {
  const it = (item ?? {}) as {
    id?: unknown;
    author?: { name?: unknown; badge?: { label?: unknown } };
    message?: unknown;
    isOwner?: unknown;
    isModerator?: unknown;
    isVerified?: unknown;
    timestamp?: unknown;
  };
  const badges: ChatMessage["author"]["badges"] = [];
  if (it.author?.badge?.label) badges.push({ type: "member", label: String(it.author.badge.label) });
  if (it.isOwner) badges.push({ type: "broadcaster" });
  if (it.isModerator) badges.push({ type: "moderator" });
  if (it.isVerified) badges.push({ type: "verified" });

  return {
    id: String(it.id ?? `${Date.now()}-${Math.random()}`),
    platform: "youtube",
    channel,
    author: {
      name: String(it.author?.name ?? "unknown"),
      color: undefined, // YouTube doesn't expose per-user name colors
      badges,
    },
    text: renderMessage(it.message),
    fragments: buildYouTubeFragments(it.message),
    timestamp: it.timestamp instanceof Date ? it.timestamp.getTime() : Date.now(),
    raw: item,
  };
}

/** Build fragments from youtube-chat's message runs so custom/standard emoji render as images. */
function buildYouTubeFragments(message: unknown): MessageFragment[] | undefined {
  if (!Array.isArray(message)) return undefined;
  const out: MessageFragment[] = [];
  for (const m of message) {
    if (!m || typeof m !== "object") continue;
    const o = m as { text?: unknown; emojiText?: unknown; url?: unknown; alt?: unknown };
    if (typeof o.url === "string" && o.url) {
      out.push({ type: "emote", name: typeof o.emojiText === "string" ? o.emojiText : String(o.alt ?? ""), url: o.url });
    } else if (typeof o.text === "string") {
      out.push({ type: "text", text: o.text });
    } else if (typeof o.emojiText === "string") {
      out.push({ type: "text", text: o.emojiText });
    }
  }
  return out.length ? out : undefined;
}

/** Flatten youtube-chat's message runs (text + emoji) into a plain string. */
function renderMessage(message: unknown): string {
  if (!Array.isArray(message)) return String(message ?? "");
  return message
    .map((m) => {
      if (m && typeof m === "object") {
        const o = m as { text?: unknown; emojiText?: unknown };
        if (typeof o.text === "string") return o.text;
        if (typeof o.emojiText === "string") return o.emojiText; // custom/standard emote shortcode
      }
      return "";
    })
    .join("");
}
