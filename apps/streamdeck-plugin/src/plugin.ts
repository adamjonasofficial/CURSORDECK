import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import streamDeck, {
  action,
  SingletonAction,
  type DidReceiveGlobalSettingsEvent,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import {
  DEFAULT_BRIDGE_PORT,
  clampAppearance,
  type ActionId,
  type AgentLifecycleStatus,
  type BridgeStateSnapshot,
  type KeyAppearance,
} from "@csd/shared";
import {
  renderActivityGraphTiles,
  renderHealthTiles,
  renderLiveStatusTiles,
  renderMetricsTiles,
  renderPaceTiles,
  renderSessionRingTiles,
  renderWorkMixTiles,
  healthTitle,
  paceCount,
  sessionElapsedTitle,
  statusTitle,
} from "./render.js";
import { WallHub, type GraphKind, type GraphWallSettings } from "./wall.js";

type GlobalSettings = {
  bridgeUrl?: string;
};

type KeySettings = (KeyAppearance & GraphWallSettings) & Record<string, string | number | boolean | undefined>;

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imgsRoot = path.join(pluginRoot, "imgs");
const logFile = path.join(pluginRoot, "logs", "plugin.log");

const IDLE_FRAMES = 16;
const PRESS_FRAMES = 8;
const LIVE_FRAMES = 16;
const HUB_TICK_MS = 200;

let cachedBridgeUrl = `http://127.0.0.1:${DEFAULT_BRIDGE_PORT}`;

function log(line: string) {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {
    /* ignore */
  }
  try {
    streamDeck.logger.info(line);
  } catch {
    /* before connect */
  }
}

function normalizeUrl(url: string | undefined): string {
  const raw = (url ?? "").trim();
  if (!raw) return `http://127.0.0.1:${DEFAULT_BRIDGE_PORT}`;
  return raw.replace(/\/$/, "");
}

function bridgeUrl(): string {
  return cachedBridgeUrl;
}

async function loadPersistedBridgeUrl(): Promise<void> {
  try {
    const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    cachedBridgeUrl = normalizeUrl(settings?.bridgeUrl);
    log(`Loaded bridge URL: ${cachedBridgeUrl}`);
  } catch (err) {
    log(`Settings load skipped: ${String(err)}`);
  }
}

async function postAction(actionId: ActionId): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${bridgeUrl()}/actions/${actionId}`, {
      method: "POST",
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Deduped / short-TTL cache — many walls must not open parallel HTTP sockets. */
let stateCache: {
  at: number;
  value?: BridgeStateSnapshot;
  inflight?: Promise<BridgeStateSnapshot>;
} = { at: 0 };

const STATE_TTL_MS = 500;

async function fetchState(): Promise<BridgeStateSnapshot> {
  const now = Date.now();
  if (stateCache.value && now - stateCache.at < STATE_TTL_MS) {
    return stateCache.value;
  }
  if (stateCache.inflight) return stateCache.inflight;

  stateCache.inflight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(`${bridgeUrl()}/state`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const value = (await res.json()) as BridgeStateSnapshot;
      stateCache = { at: Date.now(), value };
      return value;
    } finally {
      clearTimeout(timer);
      stateCache.inflight = undefined;
    }
  })();

  return stateCache.inflight;
}

function pngDataUrl(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function framePath(kind: "idle" | "press" | "spinner", key: string, frame: number, total: number): string {
  if (kind === "spinner") {
    return path.join(
      imgsRoot,
      "spinner",
      `frame-${String(frame % total).padStart(2, "0")}.png`,
    );
  }
  return path.join(
    imgsRoot,
    kind,
    key,
    `frame-${String(frame % total).padStart(2, "0")}.png`,
  );
}

type HubEntry = {
  actionId: string;
  key: string;
  mode: "idle" | "press";
  pressFrame: number;
  /** Fractional idle phase — advanced by speed each tick */
  phase: number;
  appearance: KeyAppearance;
};

function idleFrameIndex(entry: HubEntry): number {
  const offset = entry.appearance.frameOffset ?? 0;
  const frame = Math.floor(entry.phase) + offset;
  return ((frame % IDLE_FRAMES) + IDLE_FRAMES) % IDLE_FRAMES;
}

async function applyTitle(actionRef: { setTitle: (t: string) => Promise<void> }, appearance: KeyAppearance) {
  if (!Object.prototype.hasOwnProperty.call(appearance, "titleOverride")) return;
  const title = String(appearance.titleOverride ?? "");
  // Empty string clears overlay title (shows baked art label). Non-empty sets SD title.
  await actionRef.setTitle(title);
}

/** Single timer for all action-key idle/press animations — avoids per-key crash loops. */
class AnimationHub {
  private entries = new Map<string, HubEntry>();
  private timer: ReturnType<typeof setInterval> | undefined;

  register(actionId: string, key: string, appearance?: KeyAppearance) {
    const a = clampAppearance(appearance);
    this.entries.set(actionId, {
      actionId,
      key,
      mode: "idle",
      pressFrame: 0,
      phase: Number(a.frameOffset) || 0,
      appearance: a,
    });
    this.ensureTimer();
    void this.paintOne(actionId);
  }

  setAppearance(actionId: string, appearance: KeyAppearance) {
    const entry = this.entries.get(actionId);
    if (!entry) {
      log(`setAppearance: unknown action ${actionId}`);
      return;
    }
    const a = clampAppearance(appearance);
    entry.appearance = a;
    // Keep phase coherent when only speed/offset change
    if (a.frameOffset !== undefined) {
      entry.phase = a.frameOffset;
    }
    log(
      `Appearance @ ${entry.key}: speed=${a.speed ?? 1} reverse=${Boolean(a.reverse)} animate=${a.animate !== false} title=${JSON.stringify(a.titleOverride ?? null)}`,
    );
    void this.paintOne(actionId);
  }

  unregister(actionId: string) {
    this.entries.delete(actionId);
    if (this.entries.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  playPress(actionId: string) {
    const entry = this.entries.get(actionId);
    if (!entry) return;
    entry.mode = "press";
    entry.pressFrame = 0;
  }

  private ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, HUB_TICK_MS);
  }

  private async tick() {
    const tasks: Promise<void>[] = [];
    for (const entry of this.entries.values()) {
      tasks.push(this.advance(entry));
    }
    await Promise.all(tasks);
  }

  private async advance(entry: HubEntry) {
    const actionRef = streamDeck.actions.getActionById(entry.actionId);
    if (!actionRef?.isKey()) return;
    const a = entry.appearance;

    if (entry.mode === "press") {
      const url = pngDataUrl(framePath("press", entry.key, entry.pressFrame, PRESS_FRAMES));
      if (url) await actionRef.setImage(url);
      await applyTitle(actionRef, a);
      entry.pressFrame += 1;
      if (entry.pressFrame >= PRESS_FRAMES) {
        entry.mode = "idle";
        entry.pressFrame = 0;
      }
      return;
    }

    if (a.animate === false) {
      const url =
        pngDataUrl(path.join(imgsRoot, "actions", `${entry.key}.png`)) ??
        pngDataUrl(framePath("idle", entry.key, 0, IDLE_FRAMES));
      if (url) await actionRef.setImage(url);
      await applyTitle(actionRef, a);
      return;
    }

    const speed = a.speed ?? 1;
    const dir = a.reverse ? -1 : 1;
    entry.phase += dir * speed;
    const url = pngDataUrl(framePath("idle", entry.key, idleFrameIndex(entry), IDLE_FRAMES));
    if (url) await actionRef.setImage(url);
    await applyTitle(actionRef, a);
  }

  private async paintOne(actionId: string) {
    const entry = this.entries.get(actionId);
    if (!entry) return;
    const actionRef = streamDeck.actions.getActionById(actionId);
    if (!actionRef?.isKey()) return;
    const a = entry.appearance;
    const frame = a.animate === false ? 0 : idleFrameIndex(entry);
    const url =
      (a.animate === false
        ? pngDataUrl(path.join(imgsRoot, "actions", `${entry.key}.png`))
        : null) ??
      pngDataUrl(framePath("idle", entry.key, frame, IDLE_FRAMES)) ??
      pngDataUrl(path.join(imgsRoot, "actions", `${entry.key}.png`));
    if (url) await actionRef.setImage(url);
    await applyTitle(actionRef, a);
  }
}

const hub = new AnimationHub();

function createBridgeAction(uuid: string, actionId: ActionId, artKey: string) {
  @action({ UUID: uuid })
  class BridgeKeyAction extends SingletonAction {
    override async onWillAppear(ev: WillAppearEvent<KeySettings>): Promise<void> {
      hub.register(ev.action.id, artKey, clampAppearance(ev.payload.settings));
    }

    override onWillDisappear(ev: WillDisappearEvent): void {
      hub.unregister(ev.action.id);
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<KeySettings>): Promise<void> {
      hub.setAppearance(ev.action.id, clampAppearance(ev.payload.settings));
    }

    override async onSendToPlugin(
      ev: SendToPluginEvent<{ type?: string; settings?: KeySettings }, KeySettings>,
    ): Promise<void> {
      const payload = ev.payload;
      if (payload?.type === "appearanceUpdate" && payload.settings) {
        log(`appearanceUpdate @ ${artKey} from PI`);
        hub.setAppearance(ev.action.id, clampAppearance(payload.settings));
        await ev.action.setSettings(payload.settings);
      }
    }

    override async onKeyDown(ev: KeyDownEvent): Promise<void> {
      try {
        await postAction(actionId);
        // No showOk — cinematic press burst instead
        hub.playPress(ev.action.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Action ${actionId} FAILED @ ${bridgeUrl()}: ${message}`);
        await ev.action.showAlert();
      }
    }
  }
  return new BridgeKeyAction();
}

function liveFramePath(status: AgentLifecycleStatus, frame: number): string {
  return path.join(
    imgsRoot,
    "live",
    status,
    `frame-${String(frame % LIVE_FRAMES).padStart(2, "0")}.png`,
  );
}

const wallHub = new WallHub(fetchState, log);

/** Shared animation phase for live status (PNG frames + wall procedural). */
let statusPhase = 0;
let cachedAgentStatus: AgentLifecycleStatus = "idle";
let statusAnimTimer: ReturnType<typeof setInterval> | undefined;

async function paintStatusMembers(
  members: ReturnType<WallHub["entriesFor"]>,
  cols: number,
  rows: number,
  status: AgentLifecycleStatus,
) {
  const isWall = cols > 1 || rows > 1;
  if (isWall) {
    const tiles = renderLiveStatusTiles(status, cols, rows, statusPhase);
    for (const member of members) {
      const actionRef = streamDeck.actions.getActionById(member.actionId);
      if (!actionRef?.isKey()) continue;
      const idx = member.tileRow * member.cols + member.tileCol;
      const url = tiles[idx] ?? tiles[0];
      if (url) await actionRef.setImage(url);
      await actionRef.setTitle("");
    }
    return;
  }
  const url = pngDataUrl(liveFramePath(status, statusPhase));
  for (const member of members) {
    const actionRef = streamDeck.actions.getActionById(member.actionId);
    if (!actionRef?.isKey()) continue;
    if (url) await actionRef.setImage(url);
    await actionRef.setTitle(statusTitle(status));
  }
}

function ensureStatusAnimTimer() {
  if (statusAnimTimer) return;
  statusAnimTimer = setInterval(() => {
    const all = wallHub.entriesFor("status");
    if (all.length === 0) return;
    statusPhase = (statusPhase + 1) % LIVE_FRAMES;
    // Repaint each group without re-fetching bridge state
    const groups = new Map<string, typeof all>();
    for (const m of all) {
      const k = `${m.wallId}:${m.cols}x${m.rows}`;
      const list = groups.get(k) ?? [];
      list.push(m);
      groups.set(k, list);
    }
    for (const members of groups.values()) {
      const sample = members[0]!;
      void paintStatusMembers(members, sample.cols, sample.rows, cachedAgentStatus);
    }
  }, 140);
}

wallHub.registerKind("status", {
  intervalMs: 1000,
  renderTiles: (state, cols, rows) =>
    renderLiveStatusTiles(state.session.status, cols, rows, statusPhase),
  titleFor1x1: (state) => statusTitle(state.session.status),
});

wallHub.setCustomPainter("status", async ({ state, members, cols, rows }) => {
  cachedAgentStatus = state.session.status;
  ensureStatusAnimTimer();
  await paintStatusMembers(members, cols, rows, cachedAgentStatus);
});

wallHub.registerKind("metrics", {
  intervalMs: 2000,
  renderTiles: renderMetricsTiles,
  titleFor1x1: (state) => {
    const m = state.session.metrics;
    return `T:${m.toolCalls}\nE:${m.fileEdits}`;
  },
});
wallHub.registerKind("activity", {
  intervalMs: 1500,
  renderTiles: renderActivityGraphTiles,
  titleFor1x1: (state) => {
    const recent = state.activity.filter((e) => {
      const t = Date.parse(e.timestamp);
      return Number.isFinite(t) && Date.now() - t <= 300_000;
    }).length;
    return `ACT\n${recent}`;
  },
});
wallHub.registerKind("workmix", {
  intervalMs: 1500,
  renderTiles: renderWorkMixTiles,
  titleFor1x1: (state) => {
    let tools = 0;
    let edits = 0;
    for (const evt of state.activity.slice(0, 80)) {
      if (evt.type.includes("Tool") || evt.type === "preToolUse" || evt.type === "postToolUse") tools += 1;
      else if (evt.type.includes("FileEdit") || evt.type === "afterFileEdit") edits += 1;
    }
    return `MIX\nT${tools} E${edits}`;
  },
});
wallHub.registerKind("pace", {
  intervalMs: 1500,
  renderTiles: renderPaceTiles,
  titleFor1x1: (state) => `PACE\n${paceCount(state)}`,
});
wallHub.registerKind("session", {
  intervalMs: 1000,
  renderTiles: renderSessionRingTiles,
  titleFor1x1: sessionElapsedTitle,
});
wallHub.registerKind("health", {
  intervalMs: 2000,
  renderTiles: renderHealthTiles,
  titleFor1x1: healthTitle,
});

function coordsFromAction(action: { coordinates?: { column: number; row: number } }): {
  column: number;
  row: number;
} | null {
  const c = action.coordinates;
  if (!c || !Number.isFinite(c.column) || !Number.isFinite(c.row)) return null;
  return { column: c.column, row: c.row };
}

function createGraphAction(uuid: string, kind: GraphKind) {
  @action({ UUID: uuid })
  class GraphWallAction extends SingletonAction {
    override async onWillAppear(ev: WillAppearEvent<KeySettings>): Promise<void> {
      wallHub.register(ev.action.id, kind, ev.payload.settings, coordsFromAction(ev.action));
    }

    override onWillDisappear(ev: WillDisappearEvent): void {
      wallHub.unregister(ev.action.id);
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<KeySettings>): Promise<void> {
      wallHub.update(ev.action.id, ev.payload.settings);
    }
  }
  return new GraphWallAction();
}

const ACTION_MAP: Array<{ uuid: string; id: ActionId; art: string }> = [
  { uuid: "com.cursorstreamdeck.bridge.mode.agent", id: "mode.agent", art: "agent" },
  { uuid: "com.cursorstreamdeck.bridge.mode.ask", id: "mode.ask", art: "ask" },
  { uuid: "com.cursorstreamdeck.bridge.mode.plan", id: "mode.plan", art: "plan" },
  { uuid: "com.cursorstreamdeck.bridge.mode.debug", id: "mode.debug", art: "debug" },
  { uuid: "com.cursorstreamdeck.bridge.model.cycle", id: "model.cycle", art: "model" },
  { uuid: "com.cursorstreamdeck.bridge.chat.new", id: "chat.new", art: "new" },
  { uuid: "com.cursorstreamdeck.bridge.chat.stop", id: "chat.stop", art: "stop" },
  { uuid: "com.cursorstreamdeck.bridge.chat.accept_all", id: "chat.accept_all", art: "accept" },
  { uuid: "com.cursorstreamdeck.bridge.chat.reject_all", id: "chat.reject_all", art: "reject" },
  { uuid: "com.cursorstreamdeck.bridge.chat.focus", id: "chat.focus", art: "chatfocus" },
  { uuid: "com.cursorstreamdeck.bridge.ide.focus", id: "ide.focus", art: "focus" },
  { uuid: "com.cursorstreamdeck.bridge.ide.sidepanel", id: "ide.sidepanel", art: "sidepanel" },
  { uuid: "com.cursorstreamdeck.bridge.ide.terminal", id: "ide.terminal", art: "terminal" },
  { uuid: "com.cursorstreamdeck.bridge.ide.command_palette", id: "ide.command_palette", art: "palette" },
  { uuid: "com.cursorstreamdeck.bridge.ide.save_all", id: "ide.save_all", art: "save" },
  { uuid: "com.cursorstreamdeck.bridge.ide.explorer", id: "ide.explorer", art: "explorer" },
];

try {
  streamDeck.settings.onDidReceiveGlobalSettings((ev: DidReceiveGlobalSettingsEvent<GlobalSettings>) => {
    cachedBridgeUrl = normalizeUrl(ev.settings?.bridgeUrl);
    log(`Bridge URL updated: ${cachedBridgeUrl}`);
  });

  for (const entry of ACTION_MAP) {
    streamDeck.actions.registerAction(createBridgeAction(entry.uuid, entry.id, entry.art));
  }
  streamDeck.actions.registerAction(createGraphAction("com.cursorstreamdeck.bridge.status", "status"));
  streamDeck.actions.registerAction(createGraphAction("com.cursorstreamdeck.bridge.metrics", "metrics"));
  streamDeck.actions.registerAction(createGraphAction("com.cursorstreamdeck.bridge.activity", "activity"));
  streamDeck.actions.registerAction(createGraphAction("com.cursorstreamdeck.bridge.workmix", "workmix"));
  streamDeck.actions.registerAction(createGraphAction("com.cursorstreamdeck.bridge.pace", "pace"));
  streamDeck.actions.registerAction(createGraphAction("com.cursorstreamdeck.bridge.session", "session"));
  streamDeck.actions.registerAction(createGraphAction("com.cursorstreamdeck.bridge.health", "health"));

  log("Connecting to Stream Deck...");
  void streamDeck
    .connect()
    .then(async () => {
      log("Connected");
      await loadPersistedBridgeUrl();
    })
    .catch((err) => {
      log(`Connect failed: ${String(err)}`);
    });
} catch (err) {
  log(`Fatal plugin init: ${String(err)}`);
  throw err;
}
