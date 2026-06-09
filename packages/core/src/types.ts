/** The single canonical shape every adapter normalizes into. */
export type Platform = "twitch" | "kick" | "youtube" | "x";

export interface ChatBadge {
  type: string;      // "subscriber" | "moderator" | "broadcaster" | "vip" | "member" | ...
  label?: string;
}

/** A message is a sequence of these so the overlay can render emotes as images. */
export type MessageFragment =
  | { type: "text"; text: string }
  | { type: "emote"; name: string; url: string };

export interface ChatMessage {
  id: string;
  platform: Platform;
  channel: string;   // platform-native channel/room/video identifier
  author: {
    name: string;
    color?: string;
    badges: ChatBadge[];
  };
  text: string;      // plain-text flattening (fallback / logging / panel preview)
  /** Rich rendering: text runs + emotes. When present the overlay uses this over `text`. */
  fragments?: MessageFragment[];
  timestamp: number; // unix epoch ms
  replyTo?: string;
  raw?: unknown;
}
