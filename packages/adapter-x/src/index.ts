import WebSocket from "ws";
import type { ChatAdapter, ChatBus, ChatMessage } from "@sca/core";

const DEFAULT_ENDPOINT = "https://prod-chatman-ancillary-us-east-1.pscp.tv";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

export interface XAdapterOptions {
  /** Broadcast/room id, e.g. from x.com/i/broadcasts/<id>. */
  broadcastId: string;
  /** A pre-minted chat access token (manual path). */
  accessToken?: string;
  /** chatman host; defaults to the us-east-1 cluster. */
  endpoint?: string;
  /** Mint/refresh a token on demand (Connect X path) — enables auto-reconnect when it expires. */
  getToken?: () => Promise<{ accessToken: string; endpoint?: string } | null>;
}

/**
 * X (Twitter) live-broadcast chat via the legacy Periscope "chatman" websocket.
 * Full handshake + frame schema documented in CLAUDE.md. The access token is minted by the
 * admin's x.com session: either supplied directly (`accessToken`) or via `getToken` (Connect
 * X), which lets us re-mint and reconnect automatically when a token expires.
 */
export class XAdapter implements ChatAdapter {
  readonly platform = "x";
  private ws?: WebSocket;
  private bus?: ChatBus;
  private stopped = false;
  private viewers: number | null = null;
  private token: string;
  private endpoint: string;
  private retry?: ReturnType<typeof setTimeout>;

  constructor(private opts: XAdapterOptions) {
    this.token = opts.accessToken ?? "";
    this.endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  }

  async start(bus: ChatBus): Promise<void> {
    this.bus = bus;
    this.stopped = false;
    await this.ensureTokenAndConnect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.retry);
    this.ws?.close();
    this.ws = undefined;
  }

  async getViewers(): Promise<number | null> {
    return this.viewers;
  }

  private async ensureTokenAndConnect(): Promise<void> {
    if (this.stopped) return;
    if (this.opts.getToken) {
      try {
        const t = await this.opts.getToken();
        if (t) { this.token = t.accessToken; if (t.endpoint) this.endpoint = t.endpoint; }
        else if (!this.token) { this.scheduleRetry(15_000); return; } // mint failed -> back off
      } catch { if (!this.token) { this.scheduleRetry(15_000); return; } }
    }
    if (!this.token) return; // nothing to connect with (no token, no minter)
    this.connect();
  }

  private scheduleRetry(ms: number): void {
    if (this.stopped || !this.opts.getToken) return;
    clearTimeout(this.retry);
    this.retry = setTimeout(() => void this.ensureTokenAndConnect(), ms);
  }

  private connect(): void {
    const url = this.endpoint.replace(/^http/, "ws") + "/chatapi/v1/chatnow";
    const ws = new WebSocket(url, { headers: { "User-Agent": UA, Origin: "https://x.com" } });
    this.ws = ws;
    ws.on("open", () => {
      // Handshake is double-wrapped JSON (see CLAUDE.md): auth (kind 3), then join (kind 2 -> inner kind 1).
      ws.send(JSON.stringify({ kind: 3, payload: JSON.stringify({ access_token: this.token }) }));
      ws.send(JSON.stringify({ kind: 2, payload: JSON.stringify({ body: JSON.stringify({ room: this.opts.broadcastId }), kind: 1 }) }));
    });
    ws.on("message", (data) => this.handleFrame(data.toString()));
    ws.on("error", () => { /* fail soft; one platform must not take down the others */ });
    ws.on("close", () => {
      this.ws = undefined;
      // Token likely expired. With a minter we re-mint + reconnect; without one we stop.
      if (!this.stopped && this.opts.getToken) this.scheduleRetry(5_000);
    });
  }

  private handleFrame(raw: string): void {
    let frame: { kind?: number; payload?: string };
    try { frame = JSON.parse(raw); } catch { return; }
    let payload: any;
    try { payload = JSON.parse(frame.payload ?? ""); } catch { return; }

    // Viewer count: outer kind 2 wrapping an inner kind 4 occupancy frame.
    if (frame.kind === 2 && payload && payload.kind === 4 && typeof payload.body === "string") {
      try { const occ = JSON.parse(payload.body); if (typeof occ.occupancy === "number") this.viewers = occ.occupancy; } catch { /* ignore */ }
      return;
    }

    // Chat message: outer kind 1, carrying a rich `sender` and a nested `body` (the text).
    if (frame.kind === 1 && payload && payload.sender && typeof payload.body === "string") {
      let inner: any = {};
      try { inner = JSON.parse(payload.body); } catch { /* ignore */ }
      const text: string = typeof inner.body === "string" ? inner.body : "";
      if (!text) return; // skip joins / reactions / system rows
      const s = payload.sender;
      const msg: ChatMessage = {
        id: typeof payload.uuid === "string" ? payload.uuid : `x-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        platform: "x",
        channel: this.opts.broadcastId,
        author: {
          name: s.display_name || s.username || inner.displayName || "x-user",
          badges: s.verified ? [{ type: "verified", label: "Verified" }] : [],
        },
        text,
        timestamp: Date.now(),
        raw: { username: s.username, avatar: s.profile_image_url, userId: s.user_id },
      };
      this.bus?.publish(msg);
    }
  }
}
