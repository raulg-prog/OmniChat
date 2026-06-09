import type { MessageFragment } from "@sca/core";

/**
 * Third-party emote registry: BTTV + 7TV (global + per-channel), for Twitch and Kick.
 * Native platform emotes are handled in the adapters; this only adds the word-based
 * community emotes. Everything is best-effort — if a provider is down or a channel has
 * no emotes, messages just render as text.
 *
 * Channel ids: Twitch uses the broadcaster's numeric user id (the IRC `room-id`);
 * Kick uses the channel's `user_id` (NOT the chatroom/channel id). Global sets are
 * fetched once and shared across all channels.
 */
type EmoteMap = Map<string, string>; // emote name -> image url
export type ProviderPlatform = "twitch" | "kick";

export class EmoteRegistry {
  private channelMaps = new Map<string, EmoteMap>();
  private loaded = new Set<string>();
  private inflight = new Set<string>();
  private globalMap: EmoteMap = new Map();
  private globalLoaded?: Promise<void>;

  /** Begin loading global (once) + this channel's emotes. Idempotent, fire-and-forget. */
  ensure(platform: ProviderPlatform, channelId: string | number | undefined): void {
    void this.loadGlobal();
    if (channelId === undefined || channelId === null || channelId === "") return;
    const key = `${platform}:${channelId}`;
    if (this.loaded.has(key) || this.inflight.has(key)) return;
    this.inflight.add(key);
    void this.loadChannel(platform, String(channelId), key)
      .finally(() => { this.inflight.delete(key); this.loaded.add(key); });
  }

  /** Merge externally-resolved native channel emotes (Kick/Twitch channel emotes by name). */
  addEmotes(
    platform: ProviderPlatform,
    channelId: string | number | undefined,
    entries: Iterable<[string, string]>,
  ): void {
    if (channelId === undefined || channelId === null || channelId === "") return;
    const key = `${platform}:${channelId}`;
    const map = this.channelMaps.get(key) ?? new Map<string, string>();
    for (const [name, url] of entries) if (name && url) map.set(name, url);
    this.channelMaps.set(key, map);
  }

  /** Replace whole-word emote names (channel set first, then global) with emote fragments. */
  expand(
    platform: ProviderPlatform,
    channelId: string | number | undefined,
    fragments: MessageFragment[],
  ): MessageFragment[] {
    const chan = channelId == null ? undefined : this.channelMaps.get(`${platform}:${channelId}`);
    if ((!chan || chan.size === 0) && this.globalMap.size === 0) return fragments;
    const lookup = (name: string) => chan?.get(name) ?? this.globalMap.get(name);
    const out: MessageFragment[] = [];
    for (const f of fragments) {
      if (f.type !== "text") { out.push(f); continue; }
      for (const piece of tokenize(f.text, lookup)) out.push(piece);
    }
    return out;
  }

  private loadGlobal(): Promise<void> {
    return (this.globalLoaded ??= (async () => {
      await Promise.allSettled([
        addBttv("https://api.betterttv.net/3/cached/emotes/global", this.globalMap, true),
        add7tv("https://7tv.io/v3/emote-sets/global", this.globalMap, true),
      ]);
    })());
  }

  private async loadChannel(platform: ProviderPlatform, id: string, key: string): Promise<void> {
    const map: EmoteMap = this.channelMaps.get(key) ?? new Map(); // merge w/ any native emotes
    await Promise.allSettled([
      addBttv(`https://api.betterttv.net/3/cached/users/${platform}/${id}`, map, false),
      add7tv(`https://7tv.io/v3/users/${platform}/${id}`, map, false),
    ]);
    this.channelMaps.set(key, map);
  }
}

/** Shared, process-wide registry (one emote cache for all adapters). */
export const emotes = new EmoteRegistry();

/** Split a text run on whitespace and swap any token the lookup resolves to a url. */
export function tokenize(text: string, lookup: (name: string) => string | undefined): MessageFragment[] {
  if (!text) return [];
  const out: MessageFragment[] = [];
  let buf = "";
  for (const part of text.split(/(\s+)/)) {
    const url = part && !/\s/.test(part) ? lookup(part) : undefined;
    if (url) {
      if (buf) { out.push({ type: "text", text: buf }); buf = ""; }
      out.push({ type: "emote", name: part, url });
    } else {
      buf += part;
    }
  }
  if (buf) out.push({ type: "text", text: buf });
  return out;
}

async function fetchJson(url: string): Promise<any> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}

/** BTTV: global endpoint is an array; channel endpoint has channelEmotes + sharedEmotes. */
async function addBttv(url: string, map: EmoteMap, isGlobal: boolean): Promise<void> {
  const data = await fetchJson(url);
  if (!data) return;
  const list: any[] = isGlobal ? data : [...(data.channelEmotes ?? []), ...(data.sharedEmotes ?? [])];
  if (!Array.isArray(list)) return;
  for (const e of list) {
    if (e?.code && e?.id) map.set(String(e.code), `https://cdn.betterttv.net/emote/${e.id}/2x`);
  }
}

/** 7TV: global is an emote-set ({emotes}); channel is a user ({emote_set:{emotes}}). */
async function add7tv(url: string, map: EmoteMap, isGlobal: boolean): Promise<void> {
  const data = await fetchJson(url);
  const list: any[] | undefined = isGlobal ? data?.emotes : data?.emote_set?.emotes;
  if (!Array.isArray(list)) return;
  for (const e of list) {
    const host = e?.data?.host;
    if (e?.name && host?.url) map.set(String(e.name), `https:${host.url}/2x.webp`);
  }
}
