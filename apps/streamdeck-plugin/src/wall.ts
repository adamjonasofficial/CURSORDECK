import streamDeck from "@elgato/streamdeck";
import type { BridgeStateSnapshot } from "@csd/shared";
import { parseWallLayout, type WallLayout } from "./render.js";

export type GraphKind =
  | "metrics"
  | "activity"
  | "workmix"
  | "pace"
  | "session"
  | "health"
  | "status";

export type LayoutSetting = "auto" | WallLayout;

export type GraphWallSettings = {
  layout?: LayoutSetting | string;
  tileCol?: number;
  tileRow?: number;
  wallId?: string;
};

export type TileCoords = { column: number; row: number };

export type GraphTileEntry = {
  actionId: string;
  kind: GraphKind;
  /** User setting: auto | forced layout */
  settingLayout: LayoutSetting;
  layout: WallLayout;
  cols: number;
  rows: number;
  tileCol: number;
  tileRow: number;
  wallId: string;
  column: number | null;
  row: number | null;
};

function groupKey(entry: Pick<GraphTileEntry, "kind" | "wallId" | "cols" | "rows">): string {
  return `${entry.kind}:${entry.wallId}:${entry.cols}x${entry.rows}`;
}

export type GraphRenderTiles = (state: BridgeStateSnapshot, cols: number, rows: number) => string[];
export type GraphTitleFn = (state: BridgeStateSnapshot) => string;

type KindConfig = {
  renderTiles: GraphRenderTiles;
  titleFor1x1: GraphTitleFn;
  intervalMs: number;
  /** When true, empty title on 1x1 is handled by custom painter (status PNG path). */
  skipDefaultPaint?: boolean;
};

export function parseLayoutSetting(raw: string | undefined): LayoutSetting {
  if (raw === "1x1" || raw === "2x2" || raw === "3x3") return raw;
  return "auto";
}

/**
 * Find filled axis-aligned squares among coordinate keys. Prefer larger sizes first.
 */
export function detectFilledSquares(
  keys: Array<{ actionId: string; column: number; row: number }>,
  sizes: number[] = [3, 2],
): Map<string, { cols: number; rows: number; tileCol: number; tileRow: number; wallId: string }> {
  const result = new Map<
    string,
    { cols: number; rows: number; tileCol: number; tileRow: number; wallId: string }
  >();
  const remaining = new Map<string, { actionId: string; column: number; row: number }>();
  for (const k of keys) {
    remaining.set(`${k.column},${k.row}`, k);
  }

  for (const size of sizes) {
    const origins: Array<{ col: number; row: number }> = [];
    const cols = [...new Set(keys.map((k) => k.column))].sort((a, b) => a - b);
    const rows = [...new Set(keys.map((k) => k.row))].sort((a, b) => a - b);
    for (const c of cols) {
      for (const r of rows) {
        origins.push({ col: c, row: r });
      }
    }
    // Stable: scan top-left first
    origins.sort((a, b) => a.row - b.row || a.col - b.col);

    for (const origin of origins) {
      const cells: Array<{ actionId: string; column: number; row: number }> = [];
      let complete = true;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const cell = remaining.get(`${origin.col + dx},${origin.row + dy}`);
          if (!cell) {
            complete = false;
            break;
          }
          cells.push(cell);
        }
        if (!complete) break;
      }
      if (!complete || cells.length !== size * size) continue;

      const wallId = `auto:${origin.col},${origin.row}`;
      for (const cell of cells) {
        remaining.delete(`${cell.column},${cell.row}`);
        result.set(cell.actionId, {
          cols: size,
          rows: size,
          tileCol: cell.column - origin.col,
          tileRow: cell.row - origin.row,
          wallId,
        });
      }
    }
  }

  // leftovers → 1x1
  for (const cell of remaining.values()) {
    result.set(cell.actionId, {
      cols: 1,
      rows: 1,
      tileCol: 0,
      tileRow: 0,
      wallId: `solo:${cell.actionId}`,
    });
  }

  return result;
}

/**
 * Coordinates multi-key graph walls with auto square detection.
 */
export class WallHub {
  private entries = new Map<string, GraphTileEntry>();
  private timers = new Map<GraphKind, ReturnType<typeof setInterval>>();
  private configs = new Map<GraphKind, KindConfig>();
  private fetchState: () => Promise<BridgeStateSnapshot>;
  private log: (line: string) => void;
  /** Optional per-kind paint override (e.g. status 1x1 PNG frames). */
  private customPainters = new Map<
    GraphKind,
    (args: {
      state: BridgeStateSnapshot;
      members: GraphTileEntry[];
      cols: number;
      rows: number;
    }) => Promise<void>
  >();

  constructor(fetchState: () => Promise<BridgeStateSnapshot>, log: (line: string) => void) {
    this.fetchState = fetchState;
    this.log = log;
  }

  registerKind(kind: GraphKind, config: KindConfig) {
    this.configs.set(kind, config);
  }

  setCustomPainter(
    kind: GraphKind,
    painter: (args: {
      state: BridgeStateSnapshot;
      members: GraphTileEntry[];
      cols: number;
      rows: number;
    }) => Promise<void>,
  ) {
    this.customPainters.set(kind, painter);
  }

  register(
    actionId: string,
    kind: GraphKind,
    settings: GraphWallSettings | undefined,
    coords?: TileCoords | null,
  ) {
    const settingLayout = parseLayoutSetting(settings?.layout);
    const entry: GraphTileEntry = {
      actionId,
      kind,
      settingLayout,
      layout: "1x1",
      cols: 1,
      rows: 1,
      tileCol: 0,
      tileRow: 0,
      wallId: `solo:${actionId}`,
      column: coords && Number.isFinite(coords.column) ? coords.column : null,
      row: coords && Number.isFinite(coords.row) ? coords.row : null,
    };

    if (settingLayout !== "auto") {
      const { cols, rows } = parseWallLayout(settingLayout);
      entry.layout = settingLayout;
      entry.cols = cols;
      entry.rows = rows;
      entry.tileCol = Math.max(0, Math.min(cols - 1, Math.round(Number(settings?.tileCol) || 0)));
      entry.tileRow = Math.max(0, Math.min(rows - 1, Math.round(Number(settings?.tileRow) || 0)));
      entry.wallId = String(settings?.wallId ?? "A").trim().slice(0, 16) || "A";
    }

    this.entries.set(actionId, entry);
    this.ensureTimer(kind);
    this.recompute(kind);
  }

  update(actionId: string, settings: GraphWallSettings | undefined) {
    const prev = this.entries.get(actionId);
    if (!prev) return;
    const coords =
      prev.column !== null && prev.row !== null
        ? { column: prev.column, row: prev.row }
        : null;
    this.register(actionId, prev.kind, settings, coords);
  }

  unregister(actionId: string) {
    const prev = this.entries.get(actionId);
    this.entries.delete(actionId);
    if (!prev) return;
    const still = [...this.entries.values()].some((e) => e.kind === prev.kind);
    if (!still) {
      const t = this.timers.get(prev.kind);
      if (t) clearInterval(t);
      this.timers.delete(prev.kind);
    } else {
      this.recompute(prev.kind);
    }
  }

  /** Entries for a kind (for status animation helpers). */
  entriesFor(kind: GraphKind): GraphTileEntry[] {
    return [...this.entries.values()].filter((e) => e.kind === kind);
  }

  private recompute(kind: GraphKind) {
    const kindEntries = [...this.entries.values()].filter((e) => e.kind === kind);
    const autoKeys = kindEntries
      .filter((e) => e.settingLayout === "auto" && e.column !== null && e.row !== null)
      .map((e) => ({ actionId: e.actionId, column: e.column!, row: e.row! }));

    const detected = detectFilledSquares(autoKeys);

    for (const e of kindEntries) {
      if (e.settingLayout !== "auto") continue;
      if (e.column === null || e.row === null) {
        e.layout = "1x1";
        e.cols = 1;
        e.rows = 1;
        e.tileCol = 0;
        e.tileRow = 0;
        e.wallId = `solo:${e.actionId}`;
        continue;
      }
      const hit = detected.get(e.actionId);
      if (!hit) continue;
      e.cols = hit.cols;
      e.rows = hit.rows;
      e.layout = hit.cols === 3 ? "3x3" : hit.cols === 2 ? "2x2" : "1x1";
      e.tileCol = hit.tileCol;
      e.tileRow = hit.tileRow;
      e.wallId = hit.wallId;
    }

    const groups = new Set(kindEntries.map((e) => groupKey(e)));
    for (const g of groups) void this.refreshGroup(g);
  }

  /** Force refresh all groups of a kind (e.g. status animation tick). */
  refreshKindPublic(kind: GraphKind) {
    void this.refreshKind(kind);
  }

  private ensureTimer(kind: GraphKind) {
    if (this.timers.has(kind)) return;
    const cfg = this.configs.get(kind);
    if (!cfg) return;
    this.timers.set(
      kind,
      setInterval(() => {
        void this.refreshKind(kind);
      }, cfg.intervalMs),
    );
  }

  private async refreshKind(kind: GraphKind) {
    const groups = new Set<string>();
    for (const e of this.entries.values()) {
      if (e.kind === kind) groups.add(groupKey(e));
    }
    for (const g of groups) await this.refreshGroup(g);
  }

  private async refreshGroup(gkey: string) {
    const members = [...this.entries.values()].filter((e) => groupKey(e) === gkey);
    if (members.length === 0) return;
    const sample = members[0]!;
    const cfg = this.configs.get(sample.kind);
    if (!cfg) return;

    try {
      const state = await this.fetchState();
      const custom = this.customPainters.get(sample.kind);
      if (custom) {
        await custom({ state, members, cols: sample.cols, rows: sample.rows });
        return;
      }

      const tiles = cfg.renderTiles(state, sample.cols, sample.rows);
      const isWall = sample.cols > 1 || sample.rows > 1;

      for (const member of members) {
        const actionRef = streamDeck.actions.getActionById(member.actionId);
        if (!actionRef?.isKey()) continue;
        const idx = member.tileRow * member.cols + member.tileCol;
        const url = tiles[idx] ?? tiles[0];
        if (url) await actionRef.setImage(url);
        if (isWall) {
          await actionRef.setTitle("");
        } else {
          await actionRef.setTitle(cfg.titleFor1x1(state));
        }
      }
    } catch (err) {
      this.log(`Wall ${gkey} failed: ${String(err)}`);
      for (const member of members) {
        const actionRef = streamDeck.actions.getActionById(member.actionId);
        if (actionRef?.isKey()) await actionRef.setTitle("OFF");
      }
    }
  }
}
