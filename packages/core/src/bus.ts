import { EventEmitter } from "node:events";
import type { ChatMessage } from "./types.js";

/** Minimal typed pub/sub. Swap the internals for Redis pub/sub later
 *  if adapters and server run as separate processes — the surface stays the same. */
export class ChatBus {
  private emitter = new EventEmitter();

  publish(message: ChatMessage): void {
    this.emitter.emit("message", message);
  }

  onMessage(handler: (message: ChatMessage) => void): () => void {
    this.emitter.on("message", handler);
    return () => this.emitter.off("message", handler);
  }
}
