import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KEYBINDING_ENTRIES } from "@csd/shared";

const MARKER_PREFIX = "csd:";

export function keybindingsPath(): string {
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
      "Cursor",
      "User",
      "keybindings.json",
    );
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Cursor",
      "User",
      "keybindings.json",
    );
  }
  return path.join(os.homedir(), ".config", "Cursor", "User", "keybindings.json");
}

function stripJsonComments(text: string): string {
  // Cursor keybindings may be JSONC
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

export function areKeybindingsInstalled(): boolean | null {
  const file = keybindingsPath();
  if (!fs.existsSync(file)) return false;
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(stripJsonComments(raw)) as unknown;
    if (!Array.isArray(parsed)) return false;
    const markers = new Set(KEYBINDING_ENTRIES.map((e) => e.marker));
    let hit = 0;
    for (const entry of parsed) {
      if (
        entry &&
        typeof entry === "object" &&
        "csdMarker" in entry &&
        markers.has(String((entry as { csdMarker: string }).csdMarker))
      ) {
        hit += 1;
      }
    }
    return hit >= KEYBINDING_ENTRIES.length;
  } catch {
    return null;
  }
}

export { MARKER_PREFIX };
