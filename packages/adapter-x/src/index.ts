import type { ChatAdapter, ChatBus } from "@sca/core";

/**
 * X (Twitter) — INTENTIONALLY NOT IMPLEMENTED.
 *
 * X Premium users CAN go live (RTMP via Media Studio), and they get a stream key.
 * But that key is an INGEST/BROADCAST credential: it pushes video INTO X. It does
 * NOT let you read the chat/comments coming back out. There is no public API to
 * read live-stream chat in real time. The X API's streaming endpoint filters POSTS,
 * which is a different thing and is pay-per-use (reads ~$0.005 each, 2M/mo cap).
 *
 * Options if you decide you must have X chat:
 *   (a) Drop X chat from v1 (recommended). Keep this stub.
 *   (b) Treat X as a "posts/mentions" panel via the paid filtered-stream API — not
 *       the same primitive as live chat, and it costs money per read.
 *   (c) Scrape the live page (fragile, breaks often, likely violates X's ToS).
 *
 * This class is a no-op so the server can list all three platforms uniformly.
 */
export class XAdapter implements ChatAdapter {
  readonly platform = "x";
  async start(_bus: ChatBus): Promise<void> {
    // no-op — see file header
  }
  async stop(): Promise<void> {}
}
