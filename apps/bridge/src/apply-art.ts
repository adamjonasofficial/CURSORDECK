import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bridgePkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function exists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function hasGenerator(root: string): boolean {
  return exists(path.join(root, "apps", "streamdeck-plugin", "scripts", "generate-icons.mjs"));
}

/** Resolve CursorDeck repo / install root that contains the icon generator. */
export function resolveProjectRoot(): string | null {
  const candidates = [
    process.env.CURSORDECK_ROOT,
    // bridge at <root>/apps/bridge[/dist]
    path.resolve(bridgePkgRoot, "../.."),
    path.resolve(process.cwd()),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "CursorDeck") : "",
    path.join(os.homedir(), "AppData", "Local", "CursorDeck"),
  ].filter(Boolean) as string[];

  const seen = new Set<string>();
  for (const root of candidates) {
    const normalized = path.resolve(root);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (hasGenerator(normalized)) return normalized;
  }
  return null;
}

function run(command: string, args: string[], cwd: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: true,
      windowsHide: true,
      env: { ...process.env },
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => {
      out += String(d);
    });
    child.stderr?.on("data", (d) => {
      err += String(d);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, out, err }));
    child.on("error", (e) => resolve({ code: 1, out, err: String(e) }));
  });
}

function copyPlugin(root: string): { ok: boolean; dest: string; error?: string } {
  const src = path.join(root, "apps", "streamdeck-plugin", "com.cursorstreamdeck.bridge.sdPlugin");
  const dest = path.join(
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
    "Elgato",
    "StreamDeck",
    "Plugins",
    "com.cursorstreamdeck.bridge.sdPlugin",
  );
  if (!exists(path.join(src, "bin", "plugin.js"))) {
    return { ok: false, dest, error: `Prebuilt plugin missing at ${src}` };
  }
  const pluginsDir = path.dirname(dest);
  if (!exists(pluginsDir)) {
    return {
      ok: false,
      dest,
      error: `Stream Deck Plugins folder not found: ${pluginsDir}. Start Elgato Stream Deck once.`,
    };
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
  return { ok: true, dest };
}

/**
 * Regenerate key art from appearance.json and copy plugin into Elgato Plugins.
 */
export async function applyAppearanceArt(): Promise<{
  ok: boolean;
  root?: string;
  dest?: string;
  log?: string;
  error?: string;
}> {
  const root = resolveProjectRoot();
  if (!root) {
    const hint = process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "CursorDeck")
      : "%LOCALAPPDATA%\\CursorDeck";
    return {
      ok: false,
      error:
        `Icon generator missing under ${hint}\\apps\\streamdeck-plugin\\scripts\\generate-icons.mjs. ` +
        `Reinstall CursorDeck 0.9.2+ or run apply-appearance.bat from the git repo.`,
    };
  }

  const pluginDir = path.join(root, "apps", "streamdeck-plugin");
  const genScript = path.join(pluginDir, "scripts", "generate-icons.mjs");
  const lucideOk =
    exists(path.join(pluginDir, "node_modules", "lucide-static", "package.json")) ||
    exists(path.join(root, "node_modules", "lucide-static", "package.json"));
  const sharpOk =
    exists(path.join(pluginDir, "node_modules", "sharp", "package.json")) ||
    exists(path.join(root, "node_modules", "sharp", "package.json"));

  if (!lucideOk || !sharpOk) {
    return {
      ok: false,
      root,
      error:
        "Missing lucide-static/sharp next to the plugin. Reinstall CursorDeck or from the repo run: " +
        "npm install lucide-static sharp --prefix apps/streamdeck-plugin",
    };
  }

  const gen = await run("node", [genScript], pluginDir);
  if (gen.code !== 0) {
    const viaPnpm = await run("npx", ["--yes", "pnpm@9.15.0", "--filter", "@csd/streamdeck-plugin", "icons"], root);
    if (viaPnpm.code !== 0) {
      return {
        ok: false,
        root,
        log: [gen.out, gen.err, viaPnpm.out, viaPnpm.err].filter(Boolean).join("\n").slice(0, 4000),
        error: "Icon generation failed. Check bridge logs or run apply-appearance.bat from the repo.",
      };
    }
  }

  const copied = copyPlugin(root);
  if (!copied.ok) {
    return { ok: false, root, dest: copied.dest, error: copied.error, log: gen.out };
  }

  return {
    ok: true,
    root,
    dest: copied.dest,
    log: (gen.out || gen.err || "icons ok").slice(0, 4000),
  };
}
