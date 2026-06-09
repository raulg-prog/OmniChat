import WebSocket from "ws";
import { emotes } from "@sca/emotes";
import { Backoff, type ChatAdapter, type ChatBus } from "@sca/core";
import { parsePrivmsg } from "./parse.js";

const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";

export interface TwitchAdapterOptions {
  /** Channel logins to read, lowercase, without the leading '#'. */
  channels: string[];
}

/**
 * Reads Twitch chat anonymously over IRC-on-WebSocket. No token required for
 * read-only access (anonymous "justinfan" login). This is the reference adapter.
 * TODO: add an EventSub `channel.chat.message` path for richer payloads once an
 * OAuth user token (scope user:read:chat) is available.
 */
export class TwitchAdapter implements ChatAdapter {
  readonly platform = "twitch";
  private ws?: WebSocket;
  private bus?: ChatBus;
  private stopped = false;
  private backoff = new Backoff();
  private timer?: ReturnType<typeof setTimeout>;
  private fetchedChannelEmotes = new Set<string>(); // room-ids we've loaded channel emotes for

  constructor(private opts: TwitchAdapterOptions) {}

  async start(bus: ChatBus): Promise<void> {
    this.bus = bus;
    this.stopped = false;
    this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = undefined;
  }

  /** Live viewer count via decapi (no auth). null when offline/unknown. */
  async getViewers(): Promise<number | null> {
    const login = this.opts.channels[0];
    if (!login) return null;
    try {
      const res = await fetch(`https://decapi.me/twitch/viewercount/${encodeURIComponent(login)}`);
      if (!res.ok) return null;
      const n = parseInt((await res.text()).trim(), 10);
      return Number.isFinite(n) ? n : null; // "<channel> is offline" -> NaN -> null
    } catch {
      return null;
    }
  }

  private connect(): void {
    if (this.stopped) return;
    const ws = new WebSocket(IRC_URL);
    this.ws = ws;

    ws.on("open", () => {
      this.backoff.reset();
      // Request tags so we get color, badges, display-name, message id, etc.
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      const nick = `justinfan${Math.floor(Math.random() * 1e6)}`;
      ws.send(`NICK ${nick}`);
      for (const ch of this.opts.channels) ws.send(`JOIN #${ch.toLowerCase()}`);
    });

    ws.on("message", (data) => {
      for (const line of data.toString().split("\r\n")) {
        if (!line) continue;
        if (line.startsWith("PING")) {
          ws.send("PONG :tmi.twitch.tv");
          continue;
        }
        const msg = parsePrivmsg(line);
        if (msg && this.bus) {
          // room-id (channel's numeric id) keys this channel's emote sets.
          const roomId = (msg.raw as Record<string, string> | undefined)?.["room-id"];
          if (roomId) {
            emotes.ensure("twitch", roomId);              // BTTV/7TV global + channel
            this.loadChannelEmotes(roomId, msg.channel);  // + Twitch native / FFZ by name
            if (msg.fragments) msg.fragments = emotes.expand("twitch", roomId, msg.fragments);
          }
          this.bus.publish(msg);
        }
      }
    });

    ws.on("close", () => this.scheduleReconnect());
    ws.on("error", () => ws.close());
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => this.connect(), this.backoff.next());
  }

  /** One-time load of a channel's full emote set (Twitch native + 7TV/BTTV/FFZ) by name. */
  private loadChannelEmotes(roomId: string, login: string): void {
    if (this.fetchedChannelEmotes.has(roomId)) return;
    this.fetchedChannelEmotes.add(roomId);
    void fetchTwitchEmotes(login).then((e) => emotes.addEmotes("twitch", roomId, e));
  }
}

/** Fetch a Twitch channel's full emote set (native + 7TV/BTTV/FFZ) by name via a no-auth aggregator. */
async function fetchTwitchEmotes(login: string): Promise<Array<[string, string]>> {
  try {
    const res = await fetch(`https://emotes.adamcy.pl/v1/channel/${encodeURIComponent(login)}/emotes/all`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const list = (await res.json()) as Array<{ code?: unknown; urls?: Array<{ size?: unknown; url?: unknown }> }>;
    const out: Array<[string, string]> = [];
    for (const e of list ?? []) {
      const url = pick2x(e?.urls);
      if (e?.code != null && url) out.push([String(e.code), url]);
    }
    return out;
  } catch {
    return [];
  }
}

function pick2x(urls: Array<{ size?: unknown; url?: unknown }> | undefined): string | undefined {
  if (!Array.isArray(urls) || urls.length === 0) return undefined;
  const two = urls.find((u) => u?.size === "2x") ?? urls[urls.length - 1];
  return typeof two?.url === "string" ? two.url : undefined;
}

export { parsePrivmsg } from "./parse.js";
