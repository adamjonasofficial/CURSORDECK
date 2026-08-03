/**
 * Cinema neon-glass Stream Deck key art + idle/press/spinner frames.
 * Glyphs from lucide-static (MIT).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.join(__dirname, "..", "com.cursorstreamdeck.bridge.sdPlugin", "imgs");
const lucideRoot = path.dirname(require.resolve("lucide-static/package.json"));
const iconsDir = path.join(lucideRoot, "icons");
const APPEARANCE_PATH = path.join(os.homedir(), ".cursor-streamdeck", "appearance.json");

const IDLE_FRAMES = 16;
const PRESS_FRAMES = 8;
const SPINNER_FRAMES = 16;
const LIVE_FRAMES = 16;

const LIVE_STATUSES = [
  { key: "idle", icon: "moon", color: "#64748B", label: "IDLE", motion: "breathe" },
  { key: "thinking", icon: "brain", color: "#C084FC", label: "THINK", motion: "breathe" },
  { key: "running", icon: "loader-circle", color: "#38BDF8", label: "RUN", motion: "spin" },
  { key: "responding", icon: "message-square", color: "#2DD4BF", label: "REPLY", motion: "orbit" },
  { key: "completed", icon: "check-circle", color: "#4ADE80", label: "DONE", motion: "breathe" },
  { key: "aborted", icon: "octagon", color: "#FB923C", label: "STOP", motion: "breathe" },
  { key: "error", icon: "circle-alert", color: "#F87171", label: "ERROR", motion: "breathe" },
];

const ACTIONS = [
  { key: "agent", file: "actions/agent", icon: "bot", color: "#38BDF8", label: "AGENT", motion: "orbit" },
  { key: "ask", file: "actions/ask", icon: "message-circle-question", color: "#22D3EE", label: "ASK", motion: "breathe" },
  { key: "plan", file: "actions/plan", icon: "map", color: "#C084FC", label: "PLAN", motion: "orbit" },
  { key: "debug", file: "actions/debug", icon: "bug", color: "#FB923C", label: "DEBUG", motion: "spin" },
  { key: "model", file: "actions/model", icon: "refresh-cw", color: "#2DD4BF", label: "MODEL", motion: "spin" },
  { key: "new", file: "actions/new", icon: "square-pen", color: "#4ADE80", label: "NEW", motion: "breathe" },
  { key: "stop", file: "actions/stop", icon: "square", color: "#F87171", label: "STOP", motion: "breathe" },
  { key: "accept", file: "actions/accept", icon: "check", color: "#34D399", label: "ACCEPT", motion: "breathe" },
  { key: "reject", file: "actions/reject", icon: "x", color: "#FB7185", label: "REJECT", motion: "breathe" },
  { key: "focus", file: "actions/focus", icon: "app-window", color: "#93C5FD", label: "FOCUS", motion: "orbit" },
  { key: "sidepanel", file: "actions/sidepanel", icon: "panel-right", color: "#A5B4FC", label: "PANEL", motion: "orbit" },
  { key: "chatfocus", file: "actions/chatfocus", icon: "message-square", color: "#38BDF8", label: "CHAT", motion: "breathe" },
  { key: "terminal", file: "actions/terminal", icon: "terminal", color: "#4ADE80", label: "TERM", motion: "orbit" },
  { key: "palette", file: "actions/palette", icon: "command", color: "#FBBF24", label: "CMD", motion: "breathe" },
  { key: "save", file: "actions/save", icon: "save", color: "#34D399", label: "SAVE", motion: "breathe" },
  { key: "explorer", file: "actions/explorer", icon: "folder-tree", color: "#67E8F9", label: "FILES", motion: "orbit" },
  { key: "status", file: "actions/status", icon: "activity", color: "#94A3B8", label: "STATUS", motion: "breathe" },
  { key: "status-idle", file: "actions/status-idle", icon: "activity", color: "#64748B", label: "IDLE", motion: "breathe" },
  { key: "status-running", file: "actions/status-running", icon: "loader-circle", color: "#38BDF8", label: "RUN", motion: "spin" },
  { key: "status-done", file: "actions/status-done", icon: "check-circle", color: "#4ADE80", label: "DONE", motion: "breathe" },
  { key: "status-error", file: "actions/status-error", icon: "circle-alert", color: "#F87171", label: "ERR", motion: "breathe" },
  { key: "metrics", file: "actions/metrics", icon: "chart-column", color: "#38BDF8", label: "METRICS", motion: "breathe" },
  { key: "activity", file: "actions/activity", icon: "activity", color: "#22D3EE", label: "ACTIVITY", motion: "orbit" },
  { key: "workmix", file: "actions/workmix", icon: "pie-chart", color: "#A78BFA", label: "MIX", motion: "breathe" },
  { key: "pace", file: "actions/pace", icon: "gauge", color: "#FB923C", label: "PACE", motion: "spin" },
  { key: "session", file: "actions/session", icon: "timer", color: "#2DD4BF", label: "TIME", motion: "breathe" },
  { key: "health", file: "actions/health", icon: "heart-pulse", color: "#4ADE80", label: "HEALTH", motion: "breathe" },
];

const ACTION_KEYS = new Set([
  "agent",
  "ask",
  "plan",
  "debug",
  "model",
  "new",
  "stop",
  "accept",
  "reject",
  "focus",
  "sidepanel",
  "chatfocus",
  "terminal",
  "palette",
  "save",
  "explorer",
]);

const BRAND_ICON = path.resolve(__dirname, "..", "..", "..", "icon", "icon.png");

function loadAppearanceOverrides() {
  try {
    if (!fs.existsSync(APPEARANCE_PATH)) return {};
    const raw = JSON.parse(fs.readFileSync(APPEARANCE_PATH, "utf8"));
    return raw?.actions && typeof raw.actions === "object" ? raw.actions : {};
  } catch {
    return {};
  }
}

function applyOverride(item, overrides) {
  const o = overrides[item.key];
  if (!o || typeof o !== "object") return item;
  return {
    ...item,
    color: typeof o.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(o.color) ? o.color : item.color,
    icon: typeof o.icon === "string" && o.icon.trim() ? o.icon.trim() : item.icon,
    label: typeof o.label === "string" && o.label.trim() ? o.label.trim().slice(0, 12) : item.label,
    motion: ["breathe", "spin", "orbit"].includes(o.motion) ? o.motion : item.motion,
  };
}

function extractInner(svg) {
  return svg
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<svg[^>]*>/i, "")
    .replace(/<\/svg>/i, "")
    .trim();
}

function readIcon(name) {
  const file = path.join(iconsDir, `${name}.svg`);
  if (!fs.existsSync(file)) throw new Error(`Missing icon ${name}`);
  return extractInner(fs.readFileSync(file, "utf8"));
}

/** Wrap lucide paths — stroke lives on outer <svg>, so bare paths default to black. */
function glyphMarkup(inner, accent, highlight = "#FFFFFF") {
  const cleaned = inner
    .replace(/\sstroke="[^"]*"/g, "")
    .replace(/\sfill="[^"]*"/g, "")
    .replace(/\sstroke-width="[^"]*"/g, "");
  return `
    <g fill="none" stroke="${accent}" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"
       opacity="0.55">
      ${cleaned}
    </g>
    <g fill="none" stroke="${highlight}" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round">
      ${cleaned}
    </g>
    <g fill="none" stroke="${accent}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"
       opacity="0.95">
      ${cleaned}
    </g>`;
}

function motionParams(motion, t, press = 0) {
  const breath = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
  const bob = Math.sin(t * Math.PI * 2);
  const sway = Math.cos(t * Math.PI * 2);
  if (motion === "spin") {
    return {
      pulse: 0.3 + breath * 0.45 + press * 0.5,
      spin: t * 360,
      orbit: t * 360,
      scan: breath,
      bob: bob * 3,
      sway: sway * 2,
      glyphScale: 1 + breath * 0.08 + press * 0.12,
    };
  }
  if (motion === "orbit") {
    return {
      pulse: 0.35 + breath * 0.45 + press * 0.55,
      spin: bob * 14,
      orbit: t * 360,
      scan: breath,
      bob: bob * 5,
      sway: sway * 4,
      glyphScale: 1 + breath * 0.1 + press * 0.14,
    };
  }
  // breathe — float + gentle rock
  return {
    pulse: 0.28 + breath * 0.55 + press * 0.6,
    spin: bob * 10,
    orbit: t * 360,
    scan: breath,
    bob: bob * 6,
    sway: sway * 3,
    glyphScale: 1 + breath * 0.14 + press * 0.16,
  };
}

function keySvg({
  icon,
  color,
  label,
  size = 144,
  pulse = 0.3,
  spin = 0,
  orbit = 0,
  scan = 0.5,
  press = 0,
  bob = 0,
  sway = 0,
  glyphScale = 1,
}) {
  const glow = 14 + pulse * 22 + press * 10;
  const baseScale = 3.35 + pulse * 0.35 + press * 0.25;
  const scale = baseScale * glyphScale;
  const iconBox = 24;
  const cx = size / 2;
  const cy = 54;
  const translatedX = (size - iconBox * scale) / 2 + sway;
  const glyphY = (size - iconBox * scale) / 2 - 14 + bob;
  const glyph = glyphMarkup(readIcon(icon), color, "#FFFFFF");
  const uid = `${label}${Math.round(pulse * 100)}${Math.round(orbit)}${Math.round(bob * 10)}`.replace(/\W/g, "");

  const o1 = ((orbit % 360) * Math.PI) / 180;
  const o2 = o1 + (Math.PI * 2) / 3;
  const o3 = o1 + (Math.PI * 4) / 3;
  const rOrbit = 44 + pulse * 5;
  const p1 = [cx + Math.cos(o1) * rOrbit, cy + Math.sin(o1) * rOrbit * 0.72];
  const p2 = [cx + Math.cos(o2) * rOrbit, cy + Math.sin(o2) * rOrbit * 0.72];
  const p3 = [cx + Math.cos(o3) * rOrbit, cy + Math.sin(o3) * rOrbit * 0.72];
  const scanY = 26 + scan * 72;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="tile-${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#243044"/>
      <stop offset="40%" stop-color="#101826"/>
      <stop offset="100%" stop-color="#05070D"/>
    </linearGradient>
    <linearGradient id="glass-${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.16"/>
      <stop offset="35%" stop-color="#FFFFFF" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="glow-${uid}" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="${color}" stop-opacity="${0.55 + pulse * 0.35 + press * 0.25}"/>
      <stop offset="55%" stop-color="${color}" stop-opacity="${0.16 + pulse * 0.18}"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>
    <filter id="iconGlow-${uid}" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${3.2 + pulse * 2.4 + press}" result="soft"/>
      <feColorMatrix in="soft" type="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1.35 0" result="bloom"/>
      <feMerge>
        <feMergeNode in="bloom"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect width="${size}" height="${size}" rx="30" fill="url(#tile-${uid})"/>
  <rect x="3" y="3" width="${size - 6}" height="${size - 6}" rx="27" fill="url(#glow-${uid})"/>
  <rect x="8" y="8" width="${size - 16}" height="${size - 16}" rx="22"
        fill="none" stroke="${color}" stroke-opacity="${0.45 + pulse * 0.4 + press * 0.3}"
        stroke-width="${2.2 + pulse * 1.4 + press}"/>
  <rect x="10" y="10" width="${size - 20}" height="${size - 20}" rx="20" fill="url(#glass-${uid})"/>

  <circle cx="${cx}" cy="${cy}" r="${28 + glow * 0.14}" fill="${color}" opacity="${0.18 + pulse * 0.22}"/>
  <ellipse cx="${cx}" cy="${cy + 2}" rx="${50 + pulse * 6}" ry="${20 + pulse * 4}"
           fill="none" stroke="${color}" stroke-opacity="${0.28 + pulse * 0.28}" stroke-width="1.5"/>

  <circle cx="${p1[0]}" cy="${p1[1]}" r="${3.4 + pulse}" fill="${color}" opacity="0.95"/>
  <circle cx="${p2[0]}" cy="${p2[1]}" r="${2.6 + pulse * 0.6}" fill="#FFFFFF" opacity="0.9"/>
  <circle cx="${p3[0]}" cy="${p3[1]}" r="${3 + pulse * 0.8}" fill="${color}" opacity="0.75"/>

  <rect x="16" y="${scanY}" width="${size - 32}" height="2" rx="1"
        fill="${color}" opacity="${0.2 + scan * 0.28}"/>

  <g transform="rotate(${spin.toFixed(2)} ${cx} ${cy}) translate(${translatedX.toFixed(2)} ${glyphY.toFixed(2)}) scale(${scale.toFixed(3)})"
     filter="url(#iconGlow-${uid})">
    ${glyph}
  </g>

  <rect x="16" y="${size - 38}" width="${size - 32}" height="24" rx="12"
        fill="${color}" opacity="${0.22 + press * 0.25}"/>
  <rect x="16" y="${size - 38}" width="${size - 32}" height="24" rx="12"
        fill="none" stroke="${color}" stroke-opacity="0.55" stroke-width="1"/>
  <text x="50%" y="${size - 22}" text-anchor="middle"
        font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="800"
        letter-spacing="1.8" fill="#F8FAFC">${label}</text>
</svg>`;
}

function spinnerSvg(frame, frames = SPINNER_FRAMES, size = 144) {
  const t = frame / frames;
  const angle = t * 360;
  const color = "#38BDF8";
  const breath = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1E293B"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <radialGradient id="g" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="${color}" stop-opacity="${0.35 + breath * 0.25}"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="30" fill="url(#bg)"/>
  <rect x="4" y="4" width="${size - 8}" height="${size - 8}" rx="26" fill="url(#g)"/>
  <circle cx="72" cy="64" r="38" fill="none" stroke="#334155" stroke-width="9"/>
  <g transform="rotate(${angle} 72 64)">
    <circle cx="72" cy="64" r="38" fill="none" stroke="${color}" stroke-width="9"
            stroke-linecap="round" stroke-dasharray="55 190"/>
    <circle cx="72" cy="26" r="7" fill="${color}"/>
    <circle cx="98" cy="78" r="3.5" fill="#F8FAFC" opacity="0.9"/>
  </g>
  <text x="72" y="124" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
        font-size="12" font-weight="800" letter-spacing="2" fill="#E2E8F0">RUNNING</text>
</svg>`;
}

async function writePair(rel, svg) {
  const base = path.join(outRoot, rel);
  fs.mkdirSync(path.dirname(base), { recursive: true });
  const png72 = await sharp(Buffer.from(svg)).resize(72, 72).png().toBuffer();
  const png144 = await sharp(Buffer.from(svg)).resize(144, 144).png().toBuffer();
  fs.writeFileSync(`${base}.png`, png72);
  fs.writeFileSync(`${base}@2x.png`, png144);
}

async function writeFrameDir(dir, frames, svgForIndex) {
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < frames; i++) {
    const buf = await sharp(Buffer.from(svgForIndex(i))).png().toBuffer();
    const name = `frame-${String(i).padStart(2, "0")}.png`;
    fs.writeFileSync(path.join(dir, name), buf);
    fs.writeFileSync(
      path.join(dir, name.replace(".png", "@2x.png")),
      await sharp(buf).resize(288, 288).png().toBuffer(),
    );
  }
}

async function main() {
  fs.mkdirSync(outRoot, { recursive: true });
  const overrides = loadAppearanceOverrides();
  const overrideCount = Object.keys(overrides).length;
  console.log(
    overrideCount
      ? `Generating cinema neon-glass key art (appearance.json: ${overrideCount} override(s))...`
      : "Generating cinema neon-glass key art...",
  );

  for (const base of ACTIONS) {
    const item = applyOverride(base, overrides);
    const idle0 = motionParams(item.motion, 0);
    await writePair(
      item.file,
      keySvg({
        icon: item.icon,
        color: item.color,
        label: item.label,
        ...idle0,
      }),
    );
    console.log(`  static ${item.file}${item !== base ? " (custom)" : ""}`);

    if (!ACTION_KEYS.has(item.key)) continue;

    await writeFrameDir(path.join(outRoot, "idle", item.key), IDLE_FRAMES, (i) => {
      const t = i / IDLE_FRAMES;
      const m = motionParams(item.motion, t);
      return keySvg({
        icon: item.icon,
        color: item.color,
        label: item.label,
        ...m,
      });
    });
    console.log(`  idle ${item.key} x${IDLE_FRAMES}`);

    await writeFrameDir(path.join(outRoot, "press", item.key), PRESS_FRAMES, (i) => {
      const t = i / PRESS_FRAMES;
      const press = Math.sin(t * Math.PI); // 0..1..0
      const m = motionParams(item.motion, t, press);
      return keySvg({
        icon: item.icon,
        color: item.color,
        label: item.label,
        ...m,
        press,
      });
    });
    console.log(`  press ${item.key} x${PRESS_FRAMES}`);
  }

  await writeFrameDir(path.join(outRoot, "spinner"), SPINNER_FRAMES, (i) => spinnerSvg(i));
  console.log(`  spinner x${SPINNER_FRAMES}`);

  for (const live of LIVE_STATUSES) {
    await writePair(
      `actions/live-${live.key}`,
      keySvg({
        icon: live.icon,
        color: live.color,
        label: live.label,
        ...motionParams(live.motion, 0.2),
      }),
    );
    await writeFrameDir(path.join(outRoot, "live", live.key), LIVE_FRAMES, (i) => {
      const t = i / LIVE_FRAMES;
      const m = motionParams(live.motion, t);
      return keySvg({
        icon: live.icon,
        color: live.color,
        label: live.label,
        ...m,
      });
    });
    console.log(`  live ${live.key} x${LIVE_FRAMES}`);
  }

  if (!fs.existsSync(BRAND_ICON)) {
    throw new Error(`Missing brand icon: ${BRAND_ICON}`);
  }
  for (const name of ["plugin", "category"]) {
    const base = path.join(outRoot, name);
    const png72 = await sharp(BRAND_ICON).resize(72, 72).png().toBuffer();
    const png144 = await sharp(BRAND_ICON).resize(144, 144).png().toBuffer();
    fs.writeFileSync(`${base}.png`, png72);
    fs.writeFileSync(`${base}@2x.png`, png144);
    console.log(`  brand ${name} from icon/icon.png`);
  }

  // Web favicon + tray-friendly copy next to scripts
  const webPublic = path.resolve(__dirname, "..", "..", "web", "public");
  fs.mkdirSync(webPublic, { recursive: true });
  await sharp(BRAND_ICON).resize(192, 192).png().toFile(path.join(webPublic, "favicon.png"));
  await sharp(BRAND_ICON).resize(192, 192).png().toFile(path.join(webPublic, "logo.png"));

  const iconDir = path.join(__dirname, "..", "..", "..", "icon");
  try {
    const trayPng = path.join(iconDir, "tray.png");
    await sharp(BRAND_ICON).resize(64, 64).png().toFile(trayPng);

    const icoPng = await sharp(BRAND_ICON).resize(32, 32).png().toBuffer();
    const ico = Buffer.alloc(22 + icoPng.length);
    ico.writeUInt16LE(0, 0);
    ico.writeUInt16LE(1, 2);
    ico.writeUInt16LE(1, 4);
    ico[6] = 32;
    ico[7] = 32;
    ico[8] = 0;
    ico[9] = 0;
    ico.writeUInt16LE(1, 10);
    ico.writeUInt16LE(32, 12);
    ico.writeUInt32LE(icoPng.length, 14);
    ico.writeUInt32LE(22, 18);
    icoPng.copy(ico, 22);
    fs.writeFileSync(path.join(iconDir, "tray.ico"), ico);
    console.log("  brand web favicon/logo + icon/tray.png + icon/tray.ico");
  } catch (err) {
    console.warn(`  brand tray files skipped (locked?): ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log(`Done -> ${outRoot}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
