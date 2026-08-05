import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  ACTION_CATALOG,
  clampAppearance,
  isActionId,
  type ActionId,
  type AppearanceFile,
  type KeyAppearance,
  type WsClientMessage,
  type WsServerMessage,
} from "@csd/shared";
import { applyAppearanceArt } from "./apply-art.js";
import {
  appearancePath,
  loadAppearance,
  mergeActionAppearance,
  saveAppearance,
} from "./appearance.js";
import { loadConfig } from "./config.js";
import { findCursorWindow, focusAndInject, focusCursorWindow } from "./injector.js";
import { areKeybindingsInstalled } from "./keybindings-check.js";
import { resolveHookEvent } from "./hook-events.js";
import { StateStore } from "./state.js";

const config = loadConfig();
const store = new StateStore(config.port, process.platform);

const bridgeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDist = path.resolve(bridgeRoot, "../web/dist");
const webDistReady = fs.existsSync(path.join(webDist, "index.html"));

store.setKeybindingsInstalled(areKeybindingsInstalled());

async function refreshCursorPresence() {
  const found = await findCursorWindow(config.windowTitleMatch);
  store.setCursorWindowFound(found);
}

void refreshCursorPresence();
setInterval(() => {
  void refreshCursorPresence();
  store.setKeybindingsInstalled(areKeybindingsInstalled());
}, 5000);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function safeWebFile(urlPath: string): string | null {
  const cleaned = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const rel = cleaned === "/" ? "index.html" : cleaned.replace(/^\/+/, "");
  const full = path.resolve(webDist, rel);
  if (!full.startsWith(webDist + path.sep) && full !== webDist) return null;
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  // SPA fallback
  const index = path.join(webDist, "index.html");
  return fs.existsSync(index) ? index : null;
}

const app = new Hono();
app.use(
  "*",
  cors({
    // Property Inspector runs under Stream Deck origins (often null / custom) — allow all local callers
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/health", (c) => c.json(store.health()));
app.get("/state", (c) => c.json(store.snapshot()));
app.get("/analytics", (c) => c.json(store.analyticsFull()));
app.get("/analytics/turns/:id", (c) => {
  const turn = store.analyticsTurn(c.req.param("id"));
  if (!turn) return c.json({ ok: false, error: "Turn not found" }, 404);
  return c.json(turn);
});
app.delete("/analytics", (c) => c.json({ ok: true, ...store.clearAnalytics() }));
app.get("/actions", (c) =>
  c.json(
    Object.values(ACTION_CATALOG).map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      inject: a.inject,
      chord: config.chords[a.id],
    })),
  ),
);

app.get("/appearance", (c) =>
  c.json({
    ...loadAppearance(),
    path: appearancePath(),
  }),
);

app.put("/appearance", async (c) => {
  let body: AppearanceFile;
  try {
    body = (await c.req.json()) as AppearanceFile;
  } catch {
    return c.json({ ok: false, error: "Invalid JSON" }, 400);
  }
  const saved = saveAppearance({ version: 1, actions: body.actions ?? {} });
  return c.json({ ok: true, ...saved, path: appearancePath() });
});

app.put("/appearance/:key", async (c) => {
  const key = c.req.param("key");
  let body: KeyAppearance;
  try {
    body = clampAppearance((await c.req.json()) as KeyAppearance);
  } catch {
    return c.json({ ok: false, error: "Invalid JSON" }, 400);
  }
  const saved = mergeActionAppearance(key, body);
  return c.json({ ok: true, key, appearance: saved.actions[key], path: appearancePath() });
});

/** Regenerate PNG art from appearance.json and copy plugin into Elgato Plugins. */
app.post("/appearance/apply-art", async (c) => {
  const result = await applyAppearanceArt();
  if (!result.ok) {
    return c.json(result, 500);
  }
  return c.json({
    ...result,
    hint: "Quit Stream Deck (tray) and reopen to load new key art.",
  });
});

app.post("/actions/:id", async (c) => {
  const id = c.req.param("id");
  if (!isActionId(id)) {
    return c.json({ ok: false, error: `Unknown action: ${id}` }, 404);
  }

  try {
    if (id === "ide.focus") {
      const focused = await focusCursorWindow(config.windowTitleMatch);
      if (!focused) throw new Error(`Cursor window matching "${config.windowTitleMatch}" not found`);
      store.setCursorWindowFound(true);
      store.recordAction(id, true);
      store.pushActivity({
        type: "action",
        timestamp: new Date().toISOString(),
        summary: "Focused Cursor",
      });
      return c.json({ ok: true, id });
    }

    const meta = ACTION_CATALOG[id];
    const chord = config.chords[id];
    if (meta.inject && chord.keys.length === 0) {
      throw new Error(`No chord configured for ${id}`);
    }

    await focusAndInject(config.windowTitleMatch, chord, config.injectDelayMs);
    store.setCursorWindowFound(true);
    store.recordAction(id, true);
    store.pushActivity({
      type: "action",
      timestamp: new Date().toISOString(),
      summary: `Action: ${meta.title}`,
      payload: { id, chord: chord.label },
    });
    return c.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.recordAction(id as ActionId, false, message);
    store.pushActivity({
      type: "action_error",
      timestamp: new Date().toISOString(),
      summary: `Action failed: ${id} — ${message}`,
    });
    return c.json({ ok: false, error: message }, 500);
  }
});

app.post("/hooks", async (c) => {
  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const hookEvent = resolveHookEvent(body);
  store.applyHook(hookEvent, body);
  return c.json({ ok: true, event: hookEvent });
});

app.post("/hooks/:event", async (c) => {
  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const hookEvent = resolveHookEvent(body, c.req.param("event"));
  store.applyHook(hookEvent, body);
  return c.json({ ok: true, event: hookEvent });
});

if (webDistReady) {
  app.get("/*", (c) => {
    const file = safeWebFile(c.req.path);
    if (!file) return c.text("Not found", 404);
    const ext = path.extname(file).toLowerCase();
    const body = fs.readFileSync(file);
    return c.body(body, 200, {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
  });
} else {
  app.get("/", (c) =>
    c.html(
      `<!doctype html><html><body style="font-family:system-ui;background:#0b1220;color:#e2e8f0;padding:2rem">
        <h1>CursorDeck</h1>
        <p>Bridge is running. Web pad is not built yet.</p>
        <p>Run <code>pnpm --filter @csd/web build</code> or start via tray host.</p>
        <p><a href="/health" style="color:#38bdf8">/health</a></p>
      </body></html>`,
    ),
  );
}

const server = serve(
  {
    fetch: app.fetch,
    hostname: config.host,
    port: config.port,
  },
  (info) => {
    console.log(`[csd-bridge] listening on http://${config.host}:${info.port}`);
    if (webDistReady) {
      console.log(`[csd-bridge] web pad: http://${config.host}:${info.port}/`);
    } else {
      console.log(`[csd-bridge] web pad not found at ${webDist} (optional)`);
    }
  },
);

// Avoid CloseWait pile-up when Stream Deck aborts many /state polls
const httpServer = server as unknown as Server;
httpServer.keepAliveTimeout = 5_000;
httpServer.headersTimeout = 10_000;
httpServer.requestTimeout = 15_000;
httpServer.maxConnections = 64;

const wss = new WebSocketServer({ server: server as unknown as Server, path: "/ws" });

function send(ws: WebSocket, msg: WsServerMessage) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

wss.on("connection", (ws) => {
  send(ws, { type: "state", payload: store.snapshot() });
  const unsub = store.subscribe((snapshot) => {
    send(ws, { type: "state", payload: snapshot });
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(String(data)) as WsClientMessage;
      if (msg.type === "ping") send(ws, { type: "pong" });
    } catch {
      /* ignore */
    }
  });

  ws.on("close", () => unsub());
});
