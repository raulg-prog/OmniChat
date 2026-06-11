import Fastify from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { ChatBus } from "@sca/core";
import { ChannelManager, type OverlaySettings } from "./manager.js";
import { connectX, isXConnected } from "./x-session.js";

const PORT = Number(process.env.PORT ?? 8787);
const CONFIG = fileURLToPath(new URL("../config.json", import.meta.url));

const bus = new ChatBus();
const app = Fastify({ logger: { level: "warn" } });

let wss: WebSocketServer | undefined;
function broadcast(obj: unknown) {
  if (!wss) return;
  const data = JSON.stringify(obj);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(data);
}

const manager = new ChannelManager(bus, CONFIG, () => {
  broadcast({ kind: "channels", channels: manager.list() });
  broadcast({ kind: "settings", settings: manager.settings });
});

function page(rel: string) {
  return fileURLToPath(new URL(rel, import.meta.url));
}
async function serve(reply: any, rel: string) {
  reply.type("text/html");
  return reply.send(await readFile(page(rel), "utf8"));
}

app.get("/", (_req, reply) => serve(reply, "../public/landing.html"));
app.get("/overlay", (_req, reply) => serve(reply, "../public/overlay.html"));
app.get("/panel", (_req, reply) => serve(reply, "../public/panel.html"));
app.get("/live", (_req, reply) => serve(reply, "../public/viewer.html"));
app.get("/landing", (_req, reply) => serve(reply, "../public/landing.html"));

app.get("/api/state", async () => ({ channels: manager.list(), settings: manager.settings }));

app.post("/api/channels", async (req, reply) => {
  const { url, token } = (req.body ?? {}) as { url?: string; token?: string };
  if (!url) return reply.code(400).send({ error: "Paste a stream URL first." });
  try {
    const channel = await manager.add(url, token);
    void broadcastViewers(); // refresh counts so the new stream shows its viewers promptly
    return { channel };
  } catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
});

app.delete("/api/channels/:id", async (req) => {
  await manager.remove((req.params as { id: string }).id);
  return { ok: true };
});

app.put("/api/settings", async (req) => ({
  settings: await manager.updateSettings((req.body ?? {}) as Partial<OverlaySettings>),
}));

let xConnecting = false;
app.post("/api/x/connect", async () => {
  if (!xConnecting) { xConnecting = true; void connectX().finally(() => { xConnecting = false; }); }
  return { started: true };
});
app.get("/api/x/status", async () => ({ connected: isXConnected(), connecting: xConnecting }));

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
  const e = err as NodeJS.ErrnoException;
  if (e.code === "EADDRINUSE") {
    console.error(`\n  Port ${PORT} is already in use — OmniChat may already be running.\n  Close the other window, or set a different PORT and try again.\n`);
  } else {
    console.error("\n  Could not start the server:", e.message, "\n");
  }
  process.exit(1);
}

wss = new WebSocketServer({ server: app.server });
wss.on("connection", (s) =>
  s.send(JSON.stringify({ kind: "hello", channels: manager.list(), settings: manager.settings })),
);
bus.onMessage((m) => broadcast({ kind: "message", message: m }));

await manager.load();
broadcast({ kind: "channels", channels: manager.list() });

async function broadcastViewers() {
  broadcast({ kind: "viewers", counts: await manager.pollViewers() });
}
void broadcastViewers();
setInterval(() => void broadcastViewers(), 30000); // refresh viewer counts

console.log(`
  ▌ OmniChat is running

    Control panel   http://localhost:${PORT}/panel
    OBS overlay     http://localhost:${PORT}/

  Add streams in the control panel, then drop the overlay URL into an OBS
  Browser Source. Keep this window open while streaming (Ctrl+C to stop).
`);

// Packaged launcher sets SCA_OPEN_BROWSER=1 so the panel opens once we're listening.
if (process.env.SCA_OPEN_BROWSER) {
  const url = `http://localhost:${PORT}/panel`;
  const cmd =
    process.platform === "win32" ? `start "" "${url}"`
    : process.platform === "darwin" ? `open "${url}"`
    : `xdg-open "${url}"`;
  const { exec } = await import("node:child_process");
  exec(cmd, () => { /* best-effort; ignore if no browser */ });
}

const shutdown = async () => { await app.close(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
