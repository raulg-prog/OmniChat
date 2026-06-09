import type { ChatBus } from "./bus.js";

/** Every platform integration implements this and nothing more.
 *  Adapters push normalized messages onto the bus; they never know about
 *  the websocket/HTTP layer that ultimately fans messages out to clients. */
export interface ChatAdapter {
  readonly platform: string;
  /** Begin receiving chat. Must handle its own reconnect-with-backoff. */
  start(bus: ChatBus): Promise<void>;
  /** Cleanly tear down sockets/timers. */
  stop(): Promise<void>;
  /** Optional: current live viewer count for this channel, or null if offline/unknown. */
  getViewers?(): Promise<number | null>;
}
