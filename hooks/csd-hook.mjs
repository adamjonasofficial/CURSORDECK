#!/usr/bin/env node
/**
 * CursorDeck hook relay.
 * Reads JSON from stdin (Cursor hook payload) and POSTs it to the local bridge.
 * Event name is taken from argv (reliable) and/or payload.hook_event_name.
 * Always exits 0 (fail-open) so agent work is never blocked.
 */
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BRIDGE =
  process.env.CSD_BRIDGE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:3847";

function logDebug(line) {
  try {
    const dir = join(homedir(), ".cursor-streamdeck", "logs");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "hooks.log"), `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {
    /* ignore */
  }
}

function pickEvent(payload, argvEvent) {
  const fromPayload =
    payload?.hook_event_name ??
    payload?.hookEventName ??
    payload?.event_name ??
    payload?.eventName ??
    payload?.event ??
    null;
  return String(argvEvent || fromPayload || "unknown");
}

async function main() {
  const argvEvent = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : null;

  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    raw = "";
  }

  let payload = {};
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw };
    }
  }

  const hookEvent = pickEvent(payload, argvEvent);
  if (!payload.hook_event_name) payload.hook_event_name = hookEvent;
  if (!payload.hookEventName) payload.hookEventName = hookEvent;

  logDebug(`event=${hookEvent} keys=${Object.keys(payload).join(",")}`);

  try {
    // Prefer path with event so bridge always knows the type
    const url = `${BRIDGE}/hooks/${encodeURIComponent(hookEvent)}`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2000),
    });
  } catch (err) {
    logDebug(`post-failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  process.stdout.write("{}\n");
}

main().finally(() => process.exit(0));
