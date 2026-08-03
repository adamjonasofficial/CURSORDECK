import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  emptyAnalytics,
  emptyLifetimeStats,
  emptyTurnMetrics,
  truncatePromptPreview,
  type AnalyticsSnapshot,
  type ConversationSummary,
  type DayBucket,
  type PromptTurn,
  type TurnMetrics,
  type TurnStatus,
} from "@csd/shared";
import { ensureConfigDir } from "./config.js";

const ANALYTICS_PATH = path.join(os.homedir(), ".cursor-streamdeck", "analytics.json");
const MAX_TURNS = 500;
const MAX_CONVERSATIONS = 100;
const MAX_DAYS = 60;
const PROMPT_PREVIEW_LEN = 120;

export function analyticsPath(): string {
  return ANALYTICS_PATH;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function bumpModel(counts: Record<string, number>, model: string | null | undefined) {
  if (!model) return;
  counts[model] = (counts[model] ?? 0) + 1;
}

function addMetrics(target: TurnMetrics, delta: Partial<TurnMetrics>) {
  target.toolCalls += delta.toolCalls ?? 0;
  target.fileEdits += delta.fileEdits ?? 0;
  target.thoughts += delta.thoughts ?? 0;
  target.responses += delta.responses ?? 0;
  target.subagents += delta.subagents ?? 0;
}

function ensureDay(byDay: DayBucket[], day: string): DayBucket {
  let bucket = byDay.find((d) => d.day === day);
  if (!bucket) {
    bucket = { day, turns: 0, tools: 0, edits: 0 };
    byDay.push(bucket);
    byDay.sort((a, b) => a.day.localeCompare(b.day));
    while (byDay.length > MAX_DAYS) byDay.shift();
  }
  return bucket;
}

function extractPromptText(payload: Record<string, unknown>): string {
  const candidates = [payload.prompt, payload.message, payload.text, payload.content];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return "";
}

function extractGenerationId(payload: Record<string, unknown>): string | null {
  const g = payload.generation_id ?? payload.generationId;
  return typeof g === "string" && g ? g : null;
}

function normalizeLoaded(raw: Partial<AnalyticsSnapshot> | null): AnalyticsSnapshot {
  const empty = emptyAnalytics();
  if (!raw || raw.version !== 1) return empty;
  return {
    version: 1,
    lifetime: { ...emptyLifetimeStats(), ...(raw.lifetime ?? {}) },
    conversations: Array.isArray(raw.conversations) ? raw.conversations : [],
    turns: Array.isArray(raw.turns) ? raw.turns : [],
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

export class AnalyticsStore {
  private data: AnalyticsSnapshot;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;

  constructor() {
    this.data = this.loadFromDisk();
  }

  private loadFromDisk(): AnalyticsSnapshot {
    ensureConfigDir();
    if (!fs.existsSync(ANALYTICS_PATH)) {
      const empty = emptyAnalytics();
      fs.writeFileSync(ANALYTICS_PATH, JSON.stringify(empty, null, 2), "utf8");
      return empty;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(ANALYTICS_PATH, "utf8")) as Partial<AnalyticsSnapshot>;
      return normalizeLoaded(raw);
    } catch {
      return emptyAnalytics();
    }
  }

  private scheduleSave() {
    this.dirty = true;
    this.data.updatedAt = new Date().toISOString();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 500);
  }

  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    if (!this.dirty) return;
    ensureConfigDir();
    this.trim();
    fs.writeFileSync(ANALYTICS_PATH, JSON.stringify(this.data, null, 2), "utf8");
    this.dirty = false;
  }

  private trim() {
    if (this.data.turns.length > MAX_TURNS) this.data.turns.length = MAX_TURNS;
    if (this.data.conversations.length > MAX_CONVERSATIONS) {
      this.data.conversations.length = MAX_CONVERSATIONS;
    }
    if (this.data.lifetime.byDay.length > MAX_DAYS) {
      this.data.lifetime.byDay = this.data.lifetime.byDay.slice(-MAX_DAYS);
    }
  }

  full(): AnalyticsSnapshot {
    this.trim();
    return structuredClone(this.data);
  }

  /** Compact payload for WS state — lifetime + recent slices. */
  compact(maxTurns = 40, maxConversations = 30): AnalyticsSnapshot {
    const full = this.full();
    return {
      ...full,
      turns: full.turns.slice(0, maxTurns),
      conversations: full.conversations.slice(0, maxConversations),
    };
  }

  getTurn(id: string): PromptTurn | null {
    return this.data.turns.find((t) => t.id === id) ?? null;
  }

  clear(): AnalyticsSnapshot {
    this.data = emptyAnalytics();
    this.dirty = true;
    this.flush();
    return this.full();
  }

  private openTurn(): PromptTurn | undefined {
    return this.data.turns.find((t) => t.status === "open");
  }

  private ensureConversation(id: string, now: string): ConversationSummary {
    let conv = this.data.conversations.find((c) => c.id === id);
    if (!conv) {
      conv = {
        id,
        startedAt: now,
        endedAt: null,
        turnCount: 0,
        totals: emptyTurnMetrics(),
        modelCounts: {},
        lastPromptPreview: null,
      };
      this.data.conversations.unshift(conv);
      this.data.lifetime.conversations += 1;
    }
    return conv;
  }

  private noteModel(model: string | null | undefined, turn?: PromptTurn, conv?: ConversationSummary) {
    if (!model) return;
    if (turn) {
      const isNew = !turn.modelsUsed.includes(model);
      turn.model = model;
      if (isNew) {
        turn.modelsUsed.push(model);
        bumpModel(this.data.lifetime.modelCounts, model);
        if (conv) bumpModel(conv.modelCounts, model);
      }
      return;
    }
    if (conv) bumpModel(conv.modelCounts, model);
  }

  startTurn(opts: {
    conversationId: string | null;
    generationId: string | null;
    promptPreview: string;
    model: string | null;
    now: string;
  }): PromptTurn {
    // Close any dangling open turn before starting a new one
    this.closeOpenTurns(opts.now, "completed");

    const turn: PromptTurn = {
      id: newId("turn"),
      conversationId: opts.conversationId,
      generationId: opts.generationId,
      startedAt: opts.now,
      endedAt: null,
      promptPreview: truncatePromptPreview(opts.promptPreview || "(no prompt text)", PROMPT_PREVIEW_LEN),
      model: null,
      modelsUsed: [],
      status: "open",
      metrics: emptyTurnMetrics(),
    };
    this.data.turns.unshift(turn);
    this.data.lifetime.turns += 1;

    const day = ensureDay(this.data.lifetime.byDay, dayKey(opts.now));
    day.turns += 1;

    if (opts.conversationId) {
      const conv = this.ensureConversation(opts.conversationId, opts.now);
      conv.endedAt = null;
      conv.turnCount += 1;
      conv.lastPromptPreview = turn.promptPreview;
      this.noteModel(opts.model, turn, conv);
    } else {
      this.noteModel(opts.model, turn);
    }

    this.scheduleSave();
    return turn;
  }

  private applyDelta(delta: Partial<TurnMetrics>, model: string | null, now: string) {
    const turn = this.openTurn();
    if (turn) {
      addMetrics(turn.metrics, delta);
      this.noteModel(model, turn);
      if (turn.conversationId) {
        const conv = this.data.conversations.find((c) => c.id === turn.conversationId);
        if (conv) {
          addMetrics(conv.totals, delta);
          this.noteModel(model, turn, conv);
        }
      }
    }

    this.data.lifetime.toolCalls += delta.toolCalls ?? 0;
    this.data.lifetime.fileEdits += delta.fileEdits ?? 0;
    this.data.lifetime.thoughts += delta.thoughts ?? 0;
    this.data.lifetime.responses += delta.responses ?? 0;
    this.data.lifetime.subagents += delta.subagents ?? 0;

    if (model && !turn) bumpModel(this.data.lifetime.modelCounts, model);

    const day = ensureDay(this.data.lifetime.byDay, dayKey(now));
    day.tools += delta.toolCalls ?? 0;
    day.edits += delta.fileEdits ?? 0;

    this.scheduleSave();
  }

  closeOpenTurns(now: string, status: Exclude<TurnStatus, "open">) {
    let changed = false;
    for (const turn of this.data.turns) {
      if (turn.status !== "open") continue;
      turn.status = status;
      turn.endedAt = now;
      changed = true;
    }
    if (changed) this.scheduleSave();
  }

  endConversation(conversationId: string | null, now: string) {
    this.closeOpenTurns(now, "completed");
    if (!conversationId) return;
    const conv = this.data.conversations.find((c) => c.id === conversationId);
    if (conv) {
      conv.endedAt = now;
      this.scheduleSave();
    }
  }

  /** Feed hook events into analytics (call from StateStore.applyHook). */
  onHook(hookEvent: string, payload: Record<string, unknown>, ctx: {
    conversationId: string | null;
    model: string | null;
    now: string;
  }) {
    const { conversationId, model, now } = ctx;

    switch (hookEvent) {
      case "beforeSubmitPrompt": {
        this.startTurn({
          conversationId,
          generationId: extractGenerationId(payload),
          promptPreview: extractPromptText(payload),
          model,
          now,
        });
        break;
      }
      case "postToolUse":
      case "postToolUseFailure":
      case "afterMCPExecution":
        this.applyDelta({ toolCalls: 1 }, model, now);
        break;
      case "afterFileEdit":
        this.applyDelta({ fileEdits: 1 }, model, now);
        break;
      case "afterAgentThought":
        this.applyDelta({ thoughts: 1 }, model, now);
        break;
      case "afterAgentResponse":
        this.applyDelta({ responses: 1 }, model, now);
        this.closeOpenTurns(now, "completed");
        break;
      case "subagentStart":
        this.applyDelta({ subagents: 1 }, model, now);
        break;
      case "stop": {
        const stopStatus = String(payload.status ?? "completed");
        const st: Exclude<TurnStatus, "open"> =
          stopStatus === "error" ? "error" : stopStatus === "aborted" ? "aborted" : "completed";
        this.closeOpenTurns(now, st);
        break;
      }
      case "sessionEnd":
        this.endConversation(conversationId, now);
        break;
      default:
        if (model) {
          const turn = this.openTurn();
          if (turn) this.noteModel(model, turn);
          else bumpModel(this.data.lifetime.modelCounts, model);
          this.scheduleSave();
        }
        break;
    }
  }
}

export function extractPromptFromPayload(payload: Record<string, unknown>): string {
  return extractPromptText(payload);
}
