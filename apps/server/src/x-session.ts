import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

// The admin's persisted x.com browser session. NEVER commit this directory (it's their login).
const USER_DATA = fileURLToPath(new URL("../.x-userdata", import.meta.url));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

// Only one Chromium may use USER_DATA at a time -> serialize every session task.
let lock: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.then(() => {}, () => {});
  return run;
}

let connected = existsSync(USER_DATA);
export function isXConnected(): boolean { return connected; }

/** Open a real x.com login window; resolves once the admin is logged in (auth_token cookie appears). */
export function connectX(): Promise<{ ok: boolean }> {
  return serialize(async () => {
    const ctx = await chromium.launchPersistentContext(USER_DATA, {
      headless: false, viewport: { width: 1120, height: 820 }, userAgent: UA,
    });
    try {
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto("https://x.com/login").catch(() => {});
      const deadline = Date.now() + 180_000; // 3 minutes to finish logging in
      let ok = false;
      while (Date.now() < deadline) {
        const cookies = await ctx.cookies("https://x.com").catch(() => []);
        if (cookies.some((c) => c.name === "auth_token" && c.value)) { ok = true; break; }
        await new Promise((r) => setTimeout(r, 1500));
      }
      connected = connected || ok;
      return { ok };
    } finally {
      await ctx.close().catch(() => {});
    }
  });
}

/** Mint a fresh chat access_token for a broadcast using the saved session (headless). */
export function mintXToken(broadcastId: string): Promise<{ accessToken: string; endpoint?: string } | null> {
  return serialize(async () => {
    if (!existsSync(USER_DATA)) return null;
    const ctx = await chromium.launchPersistentContext(USER_DATA, { headless: true, userAgent: UA });
    try {
      const page = await ctx.newPage();
      const got = new Promise<Record<string, unknown> | null>((resolve) => {
        page.on("response", async (resp) => {
          if (resp.url().includes("/api/v2/accessChat")) {
            try { const j = (await resp.json()) as Record<string, unknown>; if (j && j.access_token) resolve(j); } catch { /* ignore */ }
          }
        });
      });
      await page.goto(`https://x.com/i/broadcasts/${broadcastId}`, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
      const data = await Promise.race([got, new Promise<null>((r) => setTimeout(() => r(null), 25_000))]);
      if (data && typeof data.access_token === "string") {
        return { accessToken: data.access_token, endpoint: typeof data.endpoint === "string" ? data.endpoint : undefined };
      }
      return null;
    } finally {
      await ctx.close().catch(() => {});
    }
  });
}
