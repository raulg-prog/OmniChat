import type { Platform } from "./types.js";

export interface ParsedStream {
  platform: Platform;
  /** Channel login/slug, or a YouTube video id / channel handle. */
  channel: string;
}

/**
 * Turn a pasted stream URL (or bare channel name) into {platform, channel}.
 * This is the heart of the "just give it a URL" UX. Pure function — unit-test it.
 */
export function parseStreamUrl(input: string): ParsedStream | null {
  const s = input.trim();

  // Bare "twitch:foo" / "kick:foo" / "yt:VIDEOID" shorthands
  const shorthand = s.match(/^(twitch|kick|youtube|yt|x):(.+)$/i);
  if (shorthand) {
    const p = shorthand[1].toLowerCase();
    const platform = (p === "yt" ? "youtube" : p) as Platform;
    return { platform, channel: shorthand[2] };
  }

  let url: URL | null = null;
  try { url = new URL(s.includes("://") ? s : `https://${s}`); } catch { url = null; }
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, "");
  const seg = url.pathname.split("/").filter(Boolean);

  if (host.endsWith("twitch.tv")) {
    return seg[0] ? { platform: "twitch", channel: seg[0].toLowerCase() } : null;
  }
  if (host.endsWith("kick.com")) {
    return seg[0] ? { platform: "kick", channel: seg[0].toLowerCase() } : null;
  }
  if (host.endsWith("youtube.com") || host === "youtu.be") {
    // youtu.be/VIDEOID | watch?v=VIDEOID | live/VIDEOID | shorts/VIDEOID |
    // channel/UCxxxx | @handle
    if (host === "youtu.be" && seg[0]) return { platform: "youtube", channel: seg[0] };
    const v = url.searchParams.get("v");
    if (v) return { platform: "youtube", channel: v };
    if ((seg[0] === "live" || seg[0] === "shorts") && seg[1]) return { platform: "youtube", channel: seg[1] };
    if (seg[0] === "channel" && seg[1]) return { platform: "youtube", channel: seg[1] };
    if (seg[0]?.startsWith("@")) return { platform: "youtube", channel: seg[0] };
    return null;
  }
  if (host.endsWith("x.com") || host.endsWith("twitter.com")) {
    return seg[0] ? { platform: "x", channel: seg[0] } : null;
  }
  return null;
}
