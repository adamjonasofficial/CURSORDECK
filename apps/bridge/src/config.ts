import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ACTION_CATALOG,
  type ActionChord,
  type ActionId,
  DEFAULT_BRIDGE_PORT,
} from "@csd/shared";

export interface BridgeConfig {
  port: number;
  host: string;
  windowTitleMatch: string;
  chords: Record<ActionId, ActionChord>;
  injectDelayMs: number;
}

const CONFIG_DIR = path.join(os.homedir(), ".cursor-streamdeck");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

function defaultChords(): Record<ActionId, ActionChord> {
  const chords = {} as Record<ActionId, ActionChord>;
  for (const [id, meta] of Object.entries(ACTION_CATALOG)) {
    chords[id as ActionId] = { ...meta.defaultChord, keys: [...meta.defaultChord.keys] };
  }
  return chords;
}

export function ensureConfigDir(): string {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  return CONFIG_DIR;
}

export function loadConfig(): BridgeConfig {
  ensureConfigDir();
  const defaults: BridgeConfig = {
    port: DEFAULT_BRIDGE_PORT,
    host: "127.0.0.1",
    windowTitleMatch: "Cursor",
    chords: defaultChords(),
    injectDelayMs: 80,
  };

  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2), "utf8");
    return defaults;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Partial<BridgeConfig>;
    return {
      ...defaults,
      ...raw,
      chords: { ...defaults.chords, ...(raw.chords ?? {}) },
    };
  } catch {
    return defaults;
  }
}

export function configPath(): string {
  return CONFIG_PATH;
}
