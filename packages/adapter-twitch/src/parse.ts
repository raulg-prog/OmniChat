import type { ChatMessage, ChatBadge, MessageFragment } from "@sca/core";

/** Parse a single IRC line into a normalized ChatMessage, or null if not a chat msg. */
export function parsePrivmsg(line: string): ChatMessage | null {
  let rest = line;
  let tags: Record<string, string> = {};
  if (rest.startsWith("@")) {
    const sp = rest.indexOf(" ");
    tags = parseTags(rest.slice(1, sp));
    rest = rest.slice(sp + 1);
  }
  // :nick!nick@nick.tmi.twitch.tv PRIVMSG #channel :message text
  const m = rest.match(/^:(\S+?)!\S+ PRIVMSG #(\S+) :(.*)$/);
  if (!m) return null;
  const [, loginFromPrefix, channel, text] = m;

  const badges: ChatBadge[] = (tags["badges"] ?? "")
    .split(",")
    .filter(Boolean)
    .map((b) => {
      const [type, label] = b.split("/");
      return { type, label };
    });

  return {
    id: tags["id"] ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    platform: "twitch",
    channel,
    author: {
      name: tags["display-name"] || loginFromPrefix,
      color: tags["color"] || undefined,
      badges,
    },
    text,
    fragments: buildTwitchFragments(text, tags["emotes"]),
    timestamp: tags["tmi-sent-ts"] ? Number(tags["tmi-sent-ts"]) : Date.now(),
    replyTo: tags["reply-parent-msg-id"] || undefined,
    raw: tags,
  };
}

/**
 * Build native-emote fragments from a PRIVMSG using the `emotes` tag, whose ranges
 * are CODEPOINT indices into the text (e.g. "25:0-4,12-16/1902:6-10").
 */
export function buildTwitchFragments(text: string, emotesTag: string | undefined): MessageFragment[] {
  const chars = [...text]; // index by codepoint, not UTF-16 unit
  if (!emotesTag) return text ? [{ type: "text", text }] : [];
  const spans: { start: number; end: number; id: string }[] = [];
  for (const group of emotesTag.split("/")) {
    const [id, positions] = group.split(":");
    if (!id || !positions) continue;
    for (const pos of positions.split(",")) {
      const [s, e] = pos.split("-").map(Number);
      if (Number.isInteger(s) && Number.isInteger(e)) spans.push({ start: s, end: e, id });
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const out: MessageFragment[] = [];
  let i = 0;
  for (const span of spans) {
    if (span.start > i) {
      const t = chars.slice(i, span.start).join("");
      if (t) out.push({ type: "text", text: t });
    }
    out.push({
      type: "emote",
      name: chars.slice(span.start, span.end + 1).join(""),
      url: `https://static-cdn.jtvnw.net/emoticons/v2/${span.id}/default/dark/2.0`,
    });
    i = span.end + 1;
  }
  if (i < chars.length) {
    const t = chars.slice(i).join("");
    if (t) out.push({ type: "text", text: t });
  }
  return out;
}

export function parseTags(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of s.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    out[pair.slice(0, eq)] = unescapeTagValue(pair.slice(eq + 1));
  }
  return out;
}

/**
 * Unescape an IRCv3 message-tag value per the spec's escape table:
 *   \: -> ;   \s -> space   \\ -> \   \r -> CR   \n -> LF
 * Anything else after a backslash drops the backslash and keeps the char.
 * (The old implementation only handled \s, which mangled display names with
 * backslashes and silently corrupted any value containing a semicolon.)
 */
export function unescapeTagValue(v: string): string {
  return v.replace(/\\(.)/g, (_, c: string) =>
    c === ":" ? ";"
    : c === "s" ? " "
    : c === "\\" ? "\\"
    : c === "r" ? "\r"
    : c === "n" ? "\n"
    : c,
  );
}
