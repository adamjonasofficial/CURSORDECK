import zlib from "node:zlib";
import type { AgentLifecycleStatus, BridgeStateSnapshot } from "@csd/shared";

type RGBA = [number, number, number, number];

export const KEY_PX = 144;
export const BEZEL_PX = 18;

export type WallLayout = "1x1" | "2x2" | "3x3";

export function parseWallLayout(layout: string | undefined): { cols: number; rows: number } {
  if (layout === "2x2") return { cols: 2, rows: 2 };
  if (layout === "3x3") return { cols: 3, rows: 3 };
  return { cols: 1, rows: 1 };
}

export function wallPixelSize(cols: number, rows: number): { width: number; height: number } {
  return {
    width: cols * KEY_PX + Math.max(0, cols - 1) * BEZEL_PX,
    height: rows * KEY_PX + Math.max(0, rows - 1) * BEZEL_PX,
  };
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(1 + width * 4);
    line[0] = 0;
    rgba.copy(line, 1, y * width * 4, (y + 1) * width * 4);
    rows.push(line);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function toDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}

function blendPixel(rgba: Buffer, w: number, h: number, x: number, y: number, color: RGBA, alpha = 1) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= w || yi >= h) return;
  const a = Math.max(0, Math.min(1, (color[3] / 255) * alpha));
  const i = (yi * w + xi) * 4;
  const inv = 1 - a;
  rgba[i] = Math.round(rgba[i]! * inv + color[0] * a);
  rgba[i + 1] = Math.round(rgba[i + 1]! * inv + color[1] * a);
  rgba[i + 2] = Math.round(rgba[i + 2]! * inv + color[2] * a);
  rgba[i + 3] = 255;
}

function fillRect(
  rgba: Buffer,
  w: number,
  h: number,
  x0: number,
  y0: number,
  rw: number,
  rh: number,
  color: RGBA,
  alpha = 1,
) {
  const x1 = Math.min(w, Math.ceil(x0 + rw));
  const y1 = Math.min(h, Math.ceil(y0 + rh));
  for (let y = Math.max(0, Math.floor(y0)); y < y1; y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < x1; x++) {
      blendPixel(rgba, w, h, x, y, color, alpha);
    }
  }
}

function fillRoundRect(
  rgba: Buffer,
  w: number,
  h: number,
  x0: number,
  y0: number,
  rw: number,
  rh: number,
  r: number,
  color: RGBA,
  alpha = 1,
) {
  const rad = Math.max(0, Math.min(r, Math.floor(Math.min(rw, rh) / 2)));
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) {
      const dx = x < x0 + rad ? x0 + rad - x : x >= x0 + rw - rad ? x - (x0 + rw - rad - 1) : 0;
      const dy = y < y0 + rad ? y0 + rad - y : y >= y0 + rh - rad ? y - (y0 + rh - rad - 1) : 0;
      if (dx * dx + dy * dy <= rad * rad + rad) blendPixel(rgba, w, h, x, y, color, alpha);
    }
  }
}

function fillCircle(rgba: Buffer, w: number, h: number, cx: number, cy: number, radius: number, color: RGBA, alpha = 1) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d <= r2) {
        const edge = Math.max(0, 1 - Math.max(0, Math.sqrt(d) - (radius - 1)));
        blendPixel(rgba, w, h, x, y, color, alpha * edge);
      }
    }
  }
}

function strokeArc(
  rgba: Buffer,
  w: number,
  h: number,
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number,
  thickness: number,
  color: RGBA,
) {
  const steps = Math.max(24, Math.floor(radius * Math.abs(end - start) * 4));
  for (let i = 0; i <= steps; i++) {
    const t = start + ((end - start) * i) / steps;
    const x = cx + Math.cos(t) * radius;
    const y = cy + Math.sin(t) * radius;
    fillCircle(rgba, w, h, x, y, thickness / 2, color);
  }
}

function paintBg(rgba: Buffer, w: number, h: number, accent: RGBA) {
  fillRect(rgba, w, h, 0, 0, w, h, [10, 14, 22, 255]);
  const scale = Math.max(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / scale;
      const dy = (y - h * 0.35) / scale;
      const g = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2.2);
      blendPixel(rgba, w, h, x, y, accent, g * 0.22);
    }
  }
  const inset = Math.max(4, Math.round(Math.min(w, h) * 0.03));
  const rad = Math.max(12, Math.round(Math.min(w, h) * 0.08));
  fillRoundRect(rgba, w, h, inset, inset, w - inset * 2, h - inset * 2, rad, [255, 255, 255, 255], 0.04);
  const gridStep = Math.max(16, Math.round(Math.min(w, h) / 8));
  for (let g = gridStep; g < h - inset; g += gridStep) {
    fillRect(rgba, w, h, inset + 4, g, w - inset * 2 - 8, 1, [148, 163, 184, 255], 0.08);
  }
  fillRoundRect(rgba, w, h, inset + 2, inset + 2, w - inset * 2 - 4, Math.max(4, Math.round(h * 0.025)), 2, accent, 0.9);

  // Darken physical bezel gutters so they disappear under key gaps
  if (w > KEY_PX) {
    for (let c = 1; c < Math.ceil(w / (KEY_PX + BEZEL_PX)); c++) {
      const gx = c * KEY_PX + (c - 1) * BEZEL_PX;
      fillRect(rgba, w, h, gx, 0, BEZEL_PX, h, [6, 8, 12, 255], 0.85);
    }
  }
  if (h > KEY_PX) {
    for (let r = 1; r < Math.ceil(h / (KEY_PX + BEZEL_PX)); r++) {
      const gy = r * KEY_PX + (r - 1) * BEZEL_PX;
      fillRect(rgba, w, h, 0, gy, w, BEZEL_PX, [6, 8, 12, 255], 0.85);
    }
  }
}

/** Slice full wall RGBA into row-major 144×144 key data-URLs. */
export function sliceKeyTiles(rgba: Buffer, width: number, height: number, cols: number, rows: number): string[] {
  const tiles: string[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ox = col * (KEY_PX + BEZEL_PX);
      const oy = row * (KEY_PX + BEZEL_PX);
      const tile = Buffer.alloc(KEY_PX * KEY_PX * 4, 0);
      for (let y = 0; y < KEY_PX; y++) {
        for (let x = 0; x < KEY_PX; x++) {
          const sx = ox + x;
          const sy = oy + y;
          if (sx >= width || sy >= height) continue;
          const si = (sy * width + sx) * 4;
          const di = (y * KEY_PX + x) * 4;
          tile[di] = rgba[si]!;
          tile[di + 1] = rgba[si + 1]!;
          tile[di + 2] = rgba[si + 2]!;
          tile[di + 3] = rgba[si + 3]!;
        }
      }
      tiles.push(toDataUrl(encodePng(KEY_PX, KEY_PX, tile)));
    }
  }
  return tiles;
}

function statusColor(status: AgentLifecycleStatus): RGBA {
  switch (status) {
    case "thinking":
      return [192, 132, 252, 255];
    case "running":
      return [56, 189, 248, 255];
    case "responding":
      return [45, 212, 191, 255];
    case "completed":
      return [74, 222, 128, 255];
    case "aborted":
      return [251, 146, 60, 255];
    case "error":
      return [248, 113, 113, 255];
    default:
      return [100, 116, 139, 255];
  }
}

function activityBuckets(state: BridgeStateSnapshot, buckets = 24, windowMs = 300_000): number[] {
  const now = Date.now();
  const counts = new Array(buckets).fill(0) as number[];
  for (const evt of state.activity) {
    const t = Date.parse(evt.timestamp);
    if (!Number.isFinite(t)) continue;
    const age = now - t;
    if (age < 0 || age > windowMs) continue;
    const idx = Math.min(buckets - 1, Math.floor(((windowMs - age) / windowMs) * buckets));
    counts[idx]! += 1;
  }
  return counts;
}

function workMixCounts(state: BridgeStateSnapshot) {
  const counts = { tools: 0, edits: 0, thoughts: 0, other: 0 };
  for (const evt of state.activity.slice(0, 100)) {
    if (evt.type.includes("Tool") || evt.type === "preToolUse" || evt.type === "postToolUse") counts.tools += 1;
    else if (evt.type.includes("FileEdit") || evt.type === "afterFileEdit") counts.edits += 1;
    else if (evt.type.includes("Thought") || evt.type === "afterAgentThought") counts.thoughts += 1;
    else counts.other += 1;
  }
  return counts;
}

function allocCanvas(cols: number, rows: number) {
  const { width, height } = wallPixelSize(cols, rows);
  return { rgba: Buffer.alloc(width * height * 4, 0), width, height, cols, rows };
}

function finishTiles(rgba: Buffer, width: number, height: number, cols: number, rows: number): string[] {
  if (cols === 1 && rows === 1) {
    return [toDataUrl(encodePng(width, height, rgba))];
  }
  return sliceKeyTiles(rgba, width, height, cols, rows);
}

export function renderMetricsTiles(state: BridgeStateSnapshot, cols = 1, rows = 1): string[] {
  const { rgba, width, height } = allocCanvas(cols, rows);
  paintBg(rgba, width, height, [56, 189, 248, 255]);

  const values = [
    state.session.metrics.toolCalls,
    state.session.metrics.fileEdits,
    state.session.metrics.thoughts,
    state.session.metrics.subagents,
  ];
  const colors: RGBA[] = [
    [56, 189, 248, 255],
    [167, 139, 250, 255],
    [45, 212, 191, 255],
    [251, 146, 60, 255],
  ];
  const max = Math.max(1, ...values, 5);
  const pad = Math.max(12, Math.round(width * 0.04));
  const top = Math.max(28, Math.round(height * 0.12));
  const bottom = Math.max(18, Math.round(height * 0.08));
  const gap = Math.max(8, Math.round(width * 0.03));
  const barW = Math.floor((width - pad * 2 - gap * 3) / 4);
  const chartH = height - top - bottom;

  for (let i = 0; i < 4; i++) {
    const hBar = Math.max(8, Math.round((values[i]! / max) * chartH));
    const x = pad + i * (barW + gap);
    const y = height - bottom - hBar;
    fillRoundRect(rgba, width, height, x, y, barW, hBar, Math.max(4, Math.round(barW * 0.2)), colors[i]!);
    fillCircle(rgba, width, height, x + barW / 2, top * 0.55, Math.max(4, Math.round(barW * 0.12)), colors[i]!);
    // value ticks as small blocks on top of bars for wall readability
    if (cols >= 2) {
      const tick = Math.min(barW - 4, 8 + values[i]! * 2);
      fillRoundRect(rgba, width, height, x + (barW - tick) / 2, y - 10, tick, 5, 2, colors[i]!, 0.9);
    }
  }
  return finishTiles(rgba, width, height, cols, rows);
}

export function renderActivityGraphTiles(state: BridgeStateSnapshot, cols = 1, rows = 1): string[] {
  const { rgba, width, height } = allocCanvas(cols, rows);
  paintBg(rgba, width, height, [34, 211, 238, 255]);

  const bucketCount = cols >= 3 ? 48 : cols >= 2 ? 36 : 28;
  const buckets = activityBuckets(state, bucketCount, 300_000);
  const max = Math.max(1, ...buckets);
  const pad = Math.max(10, Math.round(width * 0.03));
  const chartY = Math.max(20, Math.round(height * 0.12));
  const chartH = height - chartY - Math.max(14, Math.round(height * 0.08));
  const step = (width - pad * 2) / Math.max(1, buckets.length - 1);

  for (let i = 0; i < buckets.length - 1; i++) {
    const x0 = pad + i * step;
    const x1 = pad + (i + 1) * step;
    const y0 = chartY + chartH - Math.round((buckets[i]! / max) * chartH);
    const y1 = chartY + chartH - Math.round((buckets[i + 1]! / max) * chartH);
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      const t = (x - x0) / Math.max(1, x1 - x0);
      const yTop = y0 + (y1 - y0) * t;
      for (let y = Math.floor(yTop); y < chartY + chartH; y++) {
        const hot = 1 - (y - yTop) / chartH;
        blendPixel(rgba, width, height, x, y, [34, 211, 238, 255], 0.12 + hot * 0.35);
      }
    }
  }

  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i]! <= 0) continue;
    const hBar = Math.max(2, Math.round((buckets[i]! / max) * chartH));
    const x = pad + i * step;
    fillRoundRect(rgba, width, height, x - 1, chartY + chartH - hBar, Math.max(3, step * 0.35), hBar, 1, [103, 232, 249, 255], 0.85);
  }
  fillRect(rgba, width, height, pad, chartY + chartH + 2, width - pad * 2, 2, [51, 65, 85, 255], 0.8);
  return finishTiles(rgba, width, height, cols, rows);
}

export function renderWorkMixTiles(state: BridgeStateSnapshot, cols = 1, rows = 1): string[] {
  const { rgba, width, height } = allocCanvas(cols, rows);
  paintBg(rgba, width, height, [167, 139, 250, 255]);

  const counts = workMixCounts(state);
  const values = [counts.tools, counts.edits, counts.thoughts, counts.other];
  const colors: RGBA[] = [
    [56, 189, 248, 255],
    [167, 139, 250, 255],
    [45, 212, 191, 255],
    [148, 163, 184, 255],
  ];
  const total = Math.max(1, values.reduce((a, b) => a + b, 0));
  const cx = width / 2;
  const cy = height * (cols >= 2 ? 0.38 : 0.4);
  const outer = Math.min(width, height) * (cols >= 3 ? 0.32 : cols >= 2 ? 0.28 : 0.24);
  const inner = outer * 0.52;
  let angle = -Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const sweep = (values[i]! / total) * Math.PI * 2;
    if (sweep <= 0) continue;
    const steps = Math.max(8, Math.floor(sweep * 50));
    for (let s = 0; s < steps; s++) {
      const a0 = angle + (sweep * s) / steps;
      const a1 = angle + (sweep * (s + 1)) / steps;
      for (let r = inner; r <= outer; r += 0.7) {
        const x = cx + Math.cos((a0 + a1) / 2) * r;
        const y = cy + Math.sin((a0 + a1) / 2) * r;
        blendPixel(rgba, width, height, x, y, colors[i]!, 0.95);
      }
    }
    angle += sweep;
  }
  fillCircle(rgba, width, height, cx, cy, inner - 2, [12, 16, 24, 255]);

  const max = Math.max(1, ...values);
  const pad = Math.max(12, Math.round(width * 0.04));
  const gap = Math.max(8, Math.round(width * 0.025));
  const barW = Math.floor((width - pad * 2 - gap * 3) / 4);
  const barMaxH = Math.max(28, Math.round(height * 0.22));
  const baseY = height - Math.max(14, Math.round(height * 0.06));
  for (let i = 0; i < 4; i++) {
    const bh = Math.max(4, Math.round((values[i]! / max) * barMaxH));
    const bx = pad + i * (barW + gap);
    fillRoundRect(rgba, width, height, bx, baseY - bh, barW, bh, 4, colors[i]!);
  }
  return finishTiles(rgba, width, height, cols, rows);
}

export function renderPaceTiles(state: BridgeStateSnapshot, cols = 1, rows = 1): string[] {
  const { rgba, width, height } = allocCanvas(cols, rows);
  paintBg(rgba, width, height, [251, 146, 60, 255]);

  const bucketCount = cols >= 3 ? 36 : cols >= 2 ? 28 : 20;
  const buckets = activityBuckets(state, bucketCount, 600_000);
  const max = Math.max(1, ...buckets);
  const pad = Math.max(12, Math.round(width * 0.04));
  const chartY = Math.max(24, Math.round(height * 0.14));
  const chartH = height - chartY - Math.max(16, Math.round(height * 0.08));
  const barW = Math.max(3, Math.floor((width - pad * 2) / buckets.length) - 2);

  for (let i = 0; i < buckets.length; i++) {
    const hBar = Math.max(2, Math.round((buckets[i]! / max) * chartH));
    const x = pad + i * (barW + 2);
    const y = chartY + chartH - hBar;
    const hot = buckets[i]! / max;
    fillRoundRect(rgba, width, height, x, y, barW, hBar, 3, [
      Math.round(251 - hot * 40),
      Math.round(146 + hot * 60),
      Math.round(60 + hot * 40),
      255,
    ]);
  }
  return finishTiles(rgba, width, height, cols, rows);
}

export function renderSessionRingTiles(state: BridgeStateSnapshot, cols = 1, rows = 1): string[] {
  const { rgba, width, height } = allocCanvas(cols, rows);
  const accent = statusColor(state.session.status);
  paintBg(rgba, width, height, accent);

  const started = state.session.metrics.startedAt ? Date.parse(state.session.metrics.startedAt) : NaN;
  const elapsedMs = Number.isFinite(started) ? Math.max(0, Date.now() - started) : 0;
  const progress = Math.min(1, elapsedMs / (30 * 60_000));

  const cx = width / 2;
  const cy = height / 2 - (cols >= 2 ? 0 : 4);
  const radius = Math.min(width, height) * (cols >= 3 ? 0.36 : cols >= 2 ? 0.34 : 0.29);
  const thickness = Math.max(8, Math.round(radius * 0.18));
  strokeArc(rgba, width, height, cx, cy, radius, 0, Math.PI * 2, thickness, [51, 65, 85, 255]);
  strokeArc(rgba, width, height, cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2, thickness, accent);
  fillCircle(rgba, width, height, cx, cy, radius * 0.52, [18, 22, 30, 255]);
  fillCircle(rgba, width, height, cx, cy, radius * 0.42, accent, 0.2);

  // elapsed ticks as ring of dots for wall readability
  if (cols >= 2) {
    const sec = Math.floor(elapsedMs / 1000);
    const m = Math.floor(sec / 60);
    const markers = Math.min(12, 1 + m);
    for (let i = 0; i < markers; i++) {
      const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
      fillCircle(
        rgba,
        width,
        height,
        cx + Math.cos(a) * radius * 0.2,
        cy + Math.sin(a) * radius * 0.2,
        Math.max(3, radius * 0.04),
        accent,
        0.85,
      );
    }
  }
  return finishTiles(rgba, width, height, cols, rows);
}

export function renderHealthTiles(state: BridgeStateSnapshot, cols = 1, rows = 1): string[] {
  const { rgba, width, height } = allocCanvas(cols, rows);
  const cursor = state.health.cursorWindowFound;
  const hooks = Boolean(state.health.hooksLastSeenAt);
  const keys = state.health.keybindingsInstalled === true;
  const lastOk = state.lastAction?.ok !== false;
  const items = [
    { ok: cursor, label: "CURSOR" },
    { ok: hooks, label: "HOOKS" },
    { ok: keys, label: "KEYS" },
    { ok: lastOk, label: "ACTION" },
  ];
  const score = items.filter((i) => i.ok).length;
  const accent: RGBA =
    score >= 3 ? [74, 222, 128, 255] : score >= 2 ? [251, 191, 36, 255] : [248, 113, 113, 255];
  paintBg(rgba, width, height, accent);

  if (cols >= 2 && rows >= 2) {
    // card grid across wall
    const pad = Math.max(10, Math.round(Math.min(width, height) * 0.04));
    const gap = Math.max(8, Math.round(pad * 0.6));
    const cellW = Math.floor((width - pad * 2 - gap) / 2);
    const cellH = Math.floor((height - pad * 2 - gap) / 2);
    for (let i = 0; i < 4; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = pad + col * (cellW + gap);
      const y = pad + row * (cellH + gap);
      const ok = items[i]!.ok;
      fillRoundRect(rgba, width, height, x, y, cellW, cellH, 14, [30, 41, 59, 255], 0.92);
      fillCircle(rgba, width, height, x + cellW * 0.22, y + cellH * 0.5, Math.min(cellW, cellH) * 0.12, ok ? [74, 222, 128, 255] : [248, 113, 113, 255]);
      fillRoundRect(
        rgba,
        width,
        height,
        x + cellW * 0.38,
        y + cellH * 0.42,
        cellW * (ok ? 0.48 : 0.28),
        Math.max(6, cellH * 0.12),
        4,
        ok ? [74, 222, 128, 255] : [248, 113, 113, 255],
        0.9,
      );
    }
  } else {
    const padX = Math.max(18, Math.round(width * 0.1));
    const rowH = Math.max(16, Math.round((height - 48) / 4));
    for (let i = 0; i < 4; i++) {
      const y = 28 + i * rowH;
      const ok = items[i]!.ok;
      fillRoundRect(rgba, width, height, padX, y, width - padX * 2, Math.max(14, rowH - 6), 6, [30, 41, 59, 255], 0.9);
      fillCircle(rgba, width, height, padX + 16, y + (rowH - 6) / 2, 5, ok ? [74, 222, 128, 255] : [248, 113, 113, 255]);
      fillRoundRect(
        rgba,
        width,
        height,
        padX + 30,
        y + (rowH - 6) / 2 - 3,
        ok ? width - padX * 2 - 48 : Math.floor((width - padX * 2 - 48) * 0.45),
        6,
        3,
        ok ? [74, 222, 128, 255] : [248, 113, 113, 255],
        0.85,
      );
    }
  }
  return finishTiles(rgba, width, height, cols, rows);
}

/** Back-compat single-key helpers */
export function renderMetricsPng(state: BridgeStateSnapshot, size = 144): string {
  void size;
  return renderMetricsTiles(state, 1, 1)[0]!;
}

export function renderActivityGraphPng(state: BridgeStateSnapshot, size = 144): string {
  void size;
  return renderActivityGraphTiles(state, 1, 1)[0]!;
}

export function renderWorkMixPng(state: BridgeStateSnapshot, size = 144): string {
  void size;
  return renderWorkMixTiles(state, 1, 1)[0]!;
}

export function renderPacePng(state: BridgeStateSnapshot, size = 144): string {
  void size;
  return renderPaceTiles(state, 1, 1)[0]!;
}

export function renderSessionRingPng(state: BridgeStateSnapshot, size = 144): string {
  void size;
  return renderSessionRingTiles(state, 1, 1)[0]!;
}

export function renderHealthPng(state: BridgeStateSnapshot, size = 144): string {
  void size;
  return renderHealthTiles(state, 1, 1)[0]!;
}

export function renderStatusSparklinePng(state: BridgeStateSnapshot, size = 144): string {
  const cols = 1;
  const rows = 1;
  const { rgba, width, height } = allocCanvas(cols, rows);
  void size;
  const accent = statusColor(state.session.status);
  paintBg(rgba, width, height, accent);
  const buckets = activityBuckets(state, 18, 120_000);
  const max = Math.max(1, ...buckets);
  const chartX = 12;
  const chartY = 28;
  const chartW = width - 24;
  const chartH = 58;
  const barW = Math.max(2, Math.floor(chartW / buckets.length) - 1);
  for (let i = 0; i < buckets.length; i++) {
    const hBar = Math.max(3, Math.round((buckets[i]! / max) * chartH));
    const x = chartX + i * (barW + 1);
    const y = chartY + chartH - hBar;
    const hot = 0.45 + (buckets[i]! / max) * 0.55;
    fillRoundRect(rgba, width, height, x, y, barW, hBar, 2, [
      Math.round(accent[0] * hot),
      Math.round(accent[1] * hot),
      Math.round(accent[2] * hot),
      255,
    ]);
  }
  return finishTiles(rgba, width, height, 1, 1)[0]!;
}

export function renderLiveStatusTiles(
  status: AgentLifecycleStatus,
  cols = 1,
  rows = 1,
  phase = 0,
): string[] {
  const { rgba, width, height } = allocCanvas(cols, rows);
  const accent = statusColor(status);
  paintBg(rgba, width, height, accent);

  const t = (phase % 16) / 16;
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
  const cx = width / 2;
  const cy = height * 0.48;
  const baseR = Math.min(width, height) * (cols >= 3 ? 0.28 : cols >= 2 ? 0.3 : 0.28);
  const r = baseR * (0.88 + pulse * 0.14);

  // outer glow rings
  for (let i = 3; i >= 1; i--) {
    strokeArc(
      rgba,
      width,
      height,
      cx,
      cy,
      r + i * (cols >= 2 ? 14 : 8),
      0,
      Math.PI * 2,
      Math.max(3, 2 + i),
      accent,
    );
  }
  strokeArc(rgba, width, height, cx, cy, r, 0, Math.PI * 2, Math.max(8, r * 0.12), [51, 65, 85, 255]);
  const sweep =
    status === "running" || status === "thinking" || status === "responding"
      ? t * Math.PI * 2
      : Math.PI * 1.5;
  strokeArc(rgba, width, height, cx, cy, r, -Math.PI / 2, -Math.PI / 2 + sweep, Math.max(8, r * 0.14), accent);
  fillCircle(rgba, width, height, cx, cy, r * 0.55, [14, 18, 26, 255]);
  fillCircle(rgba, width, height, cx, cy, r * 0.42, accent, 0.25 + pulse * 0.2);

  // activity ticks around center for wall readability
  if (cols >= 2) {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2 + t * Math.PI * 2 * 0.15;
      const on = (i / n + t) % 1 < 0.55;
      fillCircle(
        rgba,
        width,
        height,
        cx + Math.cos(a) * r * 0.22,
        cy + Math.sin(a) * r * 0.22,
        Math.max(3, r * 0.045),
        accent,
        on ? 0.9 : 0.25,
      );
    }
  }

  // status label bar at bottom (baked into art so wall has no SD title)
  const label = statusTitle(status);
  const barH = Math.max(22, Math.round(height * 0.1));
  const barY = height - barH - Math.max(10, Math.round(height * 0.04));
  fillRoundRect(rgba, width, height, width * 0.18, barY, width * 0.64, barH, 8, [15, 23, 42, 255], 0.92);
  // simple segment markers standing in for glyphs
  const seg = Math.min(6, label.length);
  const segW = (width * 0.5) / seg;
  for (let i = 0; i < seg; i++) {
    fillRoundRect(
      rgba,
      width,
      height,
      width * 0.25 + i * segW,
      barY + barH * 0.3,
      segW * 0.7,
      barH * 0.4,
      3,
      accent,
      0.85,
    );
  }

  return finishTiles(rgba, width, height, cols, rows);
}

export function statusTitle(status: AgentLifecycleStatus): string {
  switch (status) {
    case "thinking":
      return "THINK";
    case "running":
      return "RUN";
    case "responding":
      return "REPLY";
    case "completed":
      return "DONE";
    case "aborted":
      return "STOP";
    case "error":
      return "ERROR";
    default:
      return "IDLE";
  }
}

export function sessionElapsedTitle(state: BridgeStateSnapshot): string {
  const started = state.session.metrics.startedAt ? Date.parse(state.session.metrics.startedAt) : NaN;
  if (!Number.isFinite(started) || state.session.status === "idle") return "IDLE";
  const sec = Math.floor(Math.max(0, Date.now() - started) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function healthTitle(state: BridgeStateSnapshot): string {
  const cursor = state.health.cursorWindowFound;
  const hooks = Boolean(state.health.hooksLastSeenAt);
  const keys = state.health.keybindingsInstalled === true;
  const score = [cursor, hooks, keys].filter(Boolean).length;
  if (score >= 3) return "OK";
  if (score >= 1) return "WARN";
  return "OFF";
}

export function paceCount(state: BridgeStateSnapshot): number {
  return activityBuckets(state, 20, 600_000).reduce((a, b) => a + b, 0);
}
