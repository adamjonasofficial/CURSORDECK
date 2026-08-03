import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  clampAppearance,
  type AppearanceFile,
  type KeyAppearance,
} from "@csd/shared";
import { ensureConfigDir } from "./config.js";

const APPEARANCE_PATH = path.join(os.homedir(), ".cursor-streamdeck", "appearance.json");

export function appearancePath(): string {
  return APPEARANCE_PATH;
}

export function defaultAppearance(): AppearanceFile {
  return { version: 1, actions: {} };
}

export function loadAppearance(): AppearanceFile {
  ensureConfigDir();
  if (!fs.existsSync(APPEARANCE_PATH)) {
    const empty = defaultAppearance();
    fs.writeFileSync(APPEARANCE_PATH, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(APPEARANCE_PATH, "utf8")) as AppearanceFile;
    const actions: AppearanceFile["actions"] = {};
    for (const [k, v] of Object.entries(raw.actions ?? {})) {
      actions[k] = clampAppearance(v);
    }
    return { version: 1, actions };
  } catch {
    return defaultAppearance();
  }
}

export function saveAppearance(file: AppearanceFile): AppearanceFile {
  ensureConfigDir();
  const normalized: AppearanceFile = { version: 1, actions: {} };
  for (const [k, v] of Object.entries(file.actions ?? {})) {
    normalized.actions[k] = clampAppearance(v);
  }
  fs.writeFileSync(APPEARANCE_PATH, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export function mergeActionAppearance(key: string, patch: KeyAppearance): AppearanceFile {
  const current = loadAppearance();
  current.actions[key] = clampAppearance({ ...(current.actions[key] ?? {}), ...patch });
  return saveAppearance(current);
}
