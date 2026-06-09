import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { ChatBus, parseStreamUrl, type ChatAdapter, type Platform } from "@sca/core";
import { TwitchAdapter } from "@sca/adapter-twitch";
import { KickAdapter } from "@sca/adapter-kick";
import { YouTubeAdapter } from "@sca/adapter-youtube";
import { XAdapter } from "@sca/adapter-x";

export interface OverlaySettings {
  theme: "transparent" | "dark" | "light";
  fontSize: number;
  maxMessages: number;
  showPlatform: Record<Platform, boolean>;
  fadeSeconds: number; // 0 = never fade out
  slowMs: number;      // 0 = off; otherwise min ms between displayed messages (slow chat)
}

export interface ManagedChannel {
  id: string;
  url: string;
  platform: Platform;
  channel: string;
  addedAt: number;
}

const DEFAULTS: OverlaySettings = {
  theme: "transparent",
  fontSize: 20,
  maxMessages: 12,
  showPlatform: { twitch: true, kick: true, youtube: true, x: true },
  fadeSeconds: 0,
  slowMs: 0,
};

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}
function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** Coerce untrusted settings (config.json / API body) into a valid OverlaySettings. */
function sanitizeSettings(input: Partial<OverlaySettings> | undefined, base: OverlaySettings): OverlaySettings {
  const theme = input?.theme === "dark" || input?.theme === "light" || input?.theme === "transparent"
    ? input.theme : base.theme;
  const sp: Partial<Record<Platform, boolean>> = input?.showPlatform ?? {};
  return {
    theme,
    fontSize: clampNumber(input?.fontSize, 8, 96, base.fontSize),
    maxMessages: clampNumber(input?.maxMessages, 1, 200, base.maxMessages),
    fadeSeconds: clampNumber(input?.fadeSeconds, 0, 600, base.fadeSeconds),
    slowMs: clampNumber(input?.slowMs, 0, 3000, base.slowMs),
    showPlatform: {
      twitch: asBool(sp.twitch, base.showPlatform.twitch),
      kick: asBool(sp.kick, base.showPlatform.kick),
      youtube: asBool(sp.youtube, base.showPlatform.youtube),
      x: asBool(sp.x, base.showPlatform.x),
    },
  };
}

interface Entry { meta: ManagedChannel; adapter: ChatAdapter; }

export class ChannelManager {
  private entries = new Map<string, Entry>();
  settings: OverlaySettings = { ...DEFAULTS };

  constructor(
    private bus: ChatBus,
    private configPath: string,
    private onChange: () => void,
  ) {}

  list(): ManagedChannel[] {
    return [...this.entries.values()].map((e) => e.meta);
  }

  /** Poll each adapter's current live viewer count (best-effort, per channel id). */
  async pollViewers(): Promise<Array<{ id: string; viewers: number | null }>> {
    return Promise.all(
      [...this.entries.values()].map(async (e) => ({
        id: e.meta.id,
        viewers: e.adapter.getViewers ? await e.adapter.getViewers().catch(() => null) : null,
      })),
    );
  }

  private build(platform: Platform, channel: string): ChatAdapter | null {
    switch (platform) {
      case "twitch":  return new TwitchAdapter({ channels: [channel] });
      case "kick":    return new KickAdapter({ channel });
      case "youtube": return new YouTubeAdapter({ channel });
      case "x":       return new XAdapter({ channel });
    }
  }

  async add(url: string): Promise<ManagedChannel> {
    const parsed = parseStreamUrl(url);
    if (!parsed) throw new Error("Couldn't recognize that link. Paste a Twitch, Kick, X, or YouTube stream URL.");
    for (const e of this.entries.values()) {
      if (e.meta.platform === parsed.platform && e.meta.channel === parsed.channel) return e.meta;
    }
    const adapter = this.build(parsed.platform, parsed.channel);
    if (!adapter) throw new Error(`${parsed.platform} isn't supported yet.`);
    const meta: ManagedChannel = {
      id: randomUUID(), url, platform: parsed.platform, channel: parsed.channel, addedAt: Date.now(),
    };
    this.entries.set(meta.id, { meta, adapter });
    try { await adapter.start(this.bus); }
    catch { /* adapter logs its own errors; keep it listed so the user can retry/remove */ }
    await this.save();
    this.onChange();
    return meta;
  }

  async remove(id: string): Promise<void> {
    const e = this.entries.get(id);
    if (!e) return;
    await e.adapter.stop().catch(() => {});
    this.entries.delete(id);
    await this.save();
    this.onChange();
  }

  async updateSettings(patch: Partial<OverlaySettings>): Promise<OverlaySettings> {
    this.settings = sanitizeSettings(
      {
        ...this.settings, ...patch,
        showPlatform: { ...this.settings.showPlatform, ...(patch.showPlatform ?? {}) },
      },
      DEFAULTS,
    );
    await this.save();
    this.onChange();
    return this.settings;
  }

  async save(): Promise<void> {
    const data = { channels: this.list().map((c) => ({ url: c.url })), settings: this.settings };
    await writeFile(this.configPath, JSON.stringify(data, null, 2), "utf8").catch(() => {});
  }

  async load(): Promise<void> {
    let data: any;
    try { data = JSON.parse(await readFile(this.configPath, "utf8")); }
    catch { return; } // no config yet — first run
    if (data.settings) {
      this.settings = sanitizeSettings(data.settings as Partial<OverlaySettings>, DEFAULTS);
    }
    for (const c of data.channels ?? []) {
      try { await this.add(c.url); } catch { /* skip a now-invalid saved channel */ }
    }
  }
}
