import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_BRIDGE_PORT, KEYBINDING_ENTRIES } from "@csd/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const HOOKS_SRC = path.join(REPO_ROOT, "hooks");

function cursorUserDir(): string {
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
      "Cursor",
      "User",
    );
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Cursor", "User");
  }
  return path.join(os.homedir(), ".config", "Cursor", "User");
}

function cursorHomeDir(): string {
  return path.join(os.homedir(), ".cursor");
}

function stripJsonComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function backupFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${filePath}.csd-backup-${stamp}`;
  fs.copyFileSync(filePath, backup);
  return backup;
}

function installKeybindings(): void {
  const userDir = cursorUserDir();
  fs.mkdirSync(userDir, { recursive: true });
  const file = path.join(userDir, "keybindings.json");

  let existing: unknown[] = [];
  if (fs.existsSync(file)) {
    const backup = backupFile(file);
    console.log(`Backed up keybindings → ${backup}`);
    try {
      existing = JSON.parse(stripJsonComments(fs.readFileSync(file, "utf8"))) as unknown[];
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }
  }

  const markers = new Set(KEYBINDING_ENTRIES.map((e) => e.marker));
  const kept = existing.filter((entry) => {
    if (!entry || typeof entry !== "object") return true;
    const marker = (entry as { csdMarker?: string }).csdMarker;
    return !marker || !markers.has(marker);
  });

  const additions = KEYBINDING_ENTRIES.map((e) => ({
    key: e.key,
    command: e.command,
    csdMarker: e.marker,
  }));

  const next = [...kept, ...additions];
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`Installed ${additions.length} CursorDeck keybindings → ${file}`);
}

function installHooks(): void {
  const cursorDir = cursorHomeDir();
  const hooksDir = path.join(cursorDir, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });

  const scriptName = "csd-hook.mjs";
  const destScript = path.join(hooksDir, scriptName);
  const srcScript = path.join(HOOKS_SRC, scriptName);
  if (!fs.existsSync(srcScript)) {
    throw new Error(`Missing hook script at ${srcScript}`);
  }
  fs.copyFileSync(srcScript, destScript);
  console.log(`Installed hook script → ${destScript}`);

  const hooksJsonPath = path.join(cursorDir, "hooks.json");
  let hooksJson: { version: number; hooks: Record<string, Array<{ command: string }>> } = {
    version: 1,
    hooks: {},
  };

  if (fs.existsSync(hooksJsonPath)) {
    const backup = backupFile(hooksJsonPath);
    console.log(`Backed up hooks.json → ${backup}`);
    try {
      hooksJson = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8")) as typeof hooksJson;
      if (!hooksJson.hooks) hooksJson.hooks = {};
    } catch {
      /* start fresh-ish but keep version */
    }
  }

  const events = [
    "sessionStart",
    "sessionEnd",
    "preToolUse",
    "postToolUse",
    "postToolUseFailure",
    "afterFileEdit",
    "afterAgentThought",
    "afterAgentResponse",
    "subagentStart",
    "subagentStop",
    "beforeSubmitPrompt",
    "beforeShellExecution",
    "afterShellExecution",
    "beforeMCPExecution",
    "afterMCPExecution",
    "beforeReadFile",
    "preCompact",
    "stop",
  ];

  // Pass event name as argv — Cursor payload sometimes omits hook_event_name
  for (const event of events) {
    const command = `node ./hooks/${scriptName} ${event}`;
    const list = hooksJson.hooks[event] ?? [];
    const filtered = list.filter((h) => !h.command.includes("csd-hook"));
    filtered.push({ command });
    hooksJson.hooks[event] = filtered;
  }

  hooksJson.version = 1;
  fs.writeFileSync(hooksJsonPath, `${JSON.stringify(hooksJson, null, 2)}\n`, "utf8");
  console.log(`Merged CursorDeck hooks → ${hooksJsonPath}`);
  console.log(`Bridge expected at http://127.0.0.1:${DEFAULT_BRIDGE_PORT}`);
}

function writeLocalConfigHint(): void {
  const dir = path.join(os.homedir(), ".cursor-streamdeck");
  fs.mkdirSync(dir, { recursive: true });
  const readme = path.join(dir, "README.txt");
  fs.writeFileSync(
    readme,
    [
      "CursorDeck",
      "",
      `Default bridge: http://127.0.0.1:${DEFAULT_BRIDGE_PORT}`,
      "config.json is created automatically when the bridge starts.",
      "",
      "After setup:",
      "  1. pnpm --filter @csd/bridge dev",
      "  2. pnpm --filter @csd/web dev",
      "  3. Reload Cursor window so keybindings/hooks pick up.",
      "",
    ].join("\n"),
    "utf8",
  );
}

installKeybindings();
installHooks();
writeLocalConfigHint();
console.log("Setup complete. Reload Cursor (Developer: Reload Window) to apply.");
