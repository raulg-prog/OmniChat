import type { ChatAdapter, ChatBus } from "@sca/core";

/**
 * X (Twitter) — listed, but NOT readable.
 *
 * X exposes no public API to read a live broadcast's chat in real time, and scraping the
 * live page is fragile and against ToS. We deliberately DO NOT fabricate messages. X stays
 * in the platform lineup (so `x.com/<handle>` URLs are accepted and labeled in the UI), but
 * this adapter is a no-op: it produces no messages and no viewer count. If X ever ships a
 * public live-chat read API, implement it here.
 */
export class XAdapter implements ChatAdapter {
  readonly platform = "x";
  async start(_bus: ChatBus): Promise<void> {
    // No readable chat source for X — intentionally produces nothing.
  }
  async stop(): Promise<void> {}
}
