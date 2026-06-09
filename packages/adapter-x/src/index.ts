import type { ChatAdapter, ChatBus, ChatMessage } from "@sca/core";

/**
 * X (Twitter) — REPLAY source.
 *
 * X exposes NO public API to read a live broadcast's chat in real time, and scraping the
 * live page is fragile and against ToS. So X is represented as a clearly-labeled REPLAY:
 * a playback of representative chat that flows through the same unified feed and combined
 * viewer count as the live platforms. If X ever ships a public live-chat read API, swap
 * the body of `emit()`/`getViewers()` for the real source.
 */
const USERS = [
  "0xJenna", "cryptokyle", "degenmike", "chartwizard", "hodlqueen", "miloonchain",
  "jaketrades", "vibemarkets", "soldulla", "ethmaxi", "nattyfutures", "lunabull",
  "gmfrens", "apedout", "marketmoth", "wenlambo", "sirpumpalot", "coldwallet",
  "greencandle", "rektrachel", "tendieboy", "bagholderbob",
] as const;

const MESSAGES = [
  "LETS GOOO", "gm everyone", "this is the play", "first time catching it live",
  "W stream", "bullish on this tbh", "send it", "chart's looking clean ngl",
  "where's the entry", "Z cooking again", "Banks carrying", "audio a touch low",
  "drop the watchlist", "wagmi", "okay that take is actually fire", "buying the dip",
  "this the top signal lol", "diamond hands only", "screenshot that one", "real ones know",
  "up only", "what's the thesis here", "green day lets ride", "early gang wya",
  "the alpha is free today", "chat is locked in", "new ATH soon?", "respectfully bullish",
] as const;

const NAME_COLORS = ["#1d9bf0", "#7856ff", "#00ba7c", "#f91880", "#ffd400", "#ff7a00"] as const;

const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

export class XAdapter implements ChatAdapter {
  readonly platform = "x";
  private bus?: ChatBus;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private viewers = 1800 + Math.floor(Math.random() * 700);

  constructor(private opts: { channel: string }) {}

  async start(bus: ChatBus): Promise<void> {
    this.bus = bus;
    this.stopped = false;
    this.schedule();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** No public API for X live viewers; the count is part of the labeled replay (drifts). */
  async getViewers(): Promise<number | null> {
    this.viewers = Math.max(900, this.viewers + Math.floor((Math.random() - 0.5) * 120));
    return this.viewers;
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      if (this.stopped) return;
      this.emit();
      this.schedule();
    }, 1300 + Math.random() * 2300);
  }

  private emit(): void {
    if (!this.bus) return;
    const msg: ChatMessage = {
      id: `x-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      platform: "x",
      channel: this.opts.channel,
      author: { name: pick(USERS), color: pick(NAME_COLORS), badges: [] },
      text: pick(MESSAGES),
      timestamp: Date.now(),
      raw: { replay: true },
    };
    this.bus.publish(msg);
  }
}
