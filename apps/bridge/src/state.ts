import {
  createInitialSession,
  emptyAnalytics,
  emptyMetrics,
  type ActionId,
  type ActivityEvent,
  type AgentLifecycleStatus,
  type AgentSessionState,
  type AnalyticsSnapshot,
  type BridgeHealth,
  type BridgeStateSnapshot,
  type SessionMetrics,
} from "@csd/shared";
import { AnalyticsStore } from "./analytics.js";

type Listener = (snapshot: BridgeStateSnapshot) => void;

const MAX_ACTIVITY = 200;

export class StateStore {
  private session: AgentSessionState = createInitialSession();
  private activity: ActivityEvent[] = [];
  private lastAction: BridgeStateSnapshot["lastAction"] = null;
  private hooksLastSeenAt: string | null = null;
  private cursorWindowFound = false;
  private keybindingsInstalled: boolean | null = null;
  private readonly startedAt = new Date().toISOString();
  private readonly listeners = new Set<Listener>();
  private readonly analytics = new AnalyticsStore();

  constructor(
    private readonly port: number,
    private readonly platform: string,
  ) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }

  snapshot(): BridgeStateSnapshot {
    return {
      health: this.health(),
      session: structuredClone(this.session),
      activity: [...this.activity],
      lastAction: this.lastAction ? { ...this.lastAction } : null,
      analytics: this.analytics.compact(),
    };
  }

  analyticsFull(): AnalyticsSnapshot {
    return this.analytics.full();
  }

  analyticsTurn(id: string) {
    return this.analytics.getTurn(id);
  }

  clearAnalytics(): AnalyticsSnapshot {
    const cleared = this.analytics.clear();
    this.emit();
    return cleared;
  }

  health(): BridgeHealth {
    return {
      ok: true,
      port: this.port,
      startedAt: this.startedAt,
      platform: this.platform,
      cursorWindowFound: this.cursorWindowFound,
      hooksLastSeenAt: this.hooksLastSeenAt,
      keybindingsInstalled: this.keybindingsInstalled,
    };
  }

  setCursorWindowFound(found: boolean) {
    if (this.cursorWindowFound === found) return;
    this.cursorWindowFound = found;
    this.emit();
  }

  setKeybindingsInstalled(installed: boolean | null) {
    this.keybindingsInstalled = installed;
    this.emit();
  }

  recordAction(id: ActionId, ok: boolean, error?: string) {
    this.lastAction = { id, at: new Date().toISOString(), ok, error };
    this.emit();
  }

  pushActivity(event: Omit<ActivityEvent, "id"> & { id?: string }) {
    const full: ActivityEvent = {
      id: event.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: event.type,
      timestamp: event.timestamp,
      summary: event.summary,
      payload: event.payload,
    };
    this.activity.unshift(full);
    if (this.activity.length > MAX_ACTIVITY) this.activity.length = MAX_ACTIVITY;
    this.emit();
    return full;
  }

  touchHooks() {
    this.hooksLastSeenAt = new Date().toISOString();
  }

  applyHook(hookEvent: string, payload: Record<string, unknown>) {
    this.touchHooks();
    const now = new Date().toISOString();
    const conversationId =
      (payload.conversation_id as string | undefined) ??
      (payload.conversationId as string | undefined) ??
      this.session.conversationId;

    const model =
      (payload.model as string | undefined) ??
      (payload.model_name as string | undefined) ??
      this.session.metrics.lastModel;

    const metrics: SessionMetrics = { ...this.session.metrics };
    let status: AgentLifecycleStatus = this.session.status;
    let summary = hookEvent;

    switch (hookEvent) {
      case "sessionStart":
        status = "running";
        Object.assign(metrics, emptyMetrics(), {
          startedAt: now,
          lastModel: model ?? null,
        });
        summary = "Session started";
        break;
      case "sessionEnd":
        status =
          status === "running" || status === "thinking" || status === "responding"
            ? "completed"
            : status;
        metrics.endedAt = now;
        summary = "Session ended";
        break;
      case "preToolUse":
      case "postToolUse":
        status = "running";
        if (hookEvent === "postToolUse") metrics.toolCalls += 1;
        summary = `${hookEvent}: ${(payload.tool_name as string) ?? (payload.toolName as string) ?? "tool"}`;
        break;
      case "postToolUseFailure":
        metrics.toolCalls += 1;
        summary = `Tool failed: ${(payload.tool_name as string) ?? "tool"}`;
        break;
      case "afterFileEdit":
        status = "running";
        metrics.fileEdits += 1;
        summary = `Edited ${(payload.file_path as string) ?? (payload.filePath as string) ?? "file"}`;
        break;
      case "afterAgentThought":
        status = "thinking";
        metrics.thoughts += 1;
        summary = "Agent thinking";
        break;
      case "afterAgentResponse":
        status = "responding";
        metrics.responses += 1;
        summary = "Agent response";
        break;
      case "subagentStart":
        status = "running";
        metrics.subagents += 1;
        summary = `Subagent started: ${(payload.subagent_type as string) ?? "task"}`;
        break;
      case "subagentStop":
        summary = `Subagent stopped: ${(payload.status as string) ?? "done"}`;
        break;
      case "stop": {
        const stopStatus = String(payload.status ?? "completed");
        metrics.lastStatus = stopStatus;
        metrics.endedAt = now;
        if (stopStatus === "error") status = "error";
        else if (stopStatus === "aborted") status = "aborted";
        else status = "completed";
        summary = `Agent stopped (${stopStatus})`;
        break;
      }
      case "beforeSubmitPrompt":
        status = "running";
        if (!metrics.startedAt) metrics.startedAt = now;
        summary = "Prompt submitted";
        break;
      case "beforeShellExecution":
      case "afterShellExecution":
        status = "running";
        summary = `${hookEvent}: ${String(payload.command ?? "shell")}`;
        break;
      case "beforeMCPExecution":
      case "afterMCPExecution":
        status = "running";
        if (hookEvent === "afterMCPExecution") metrics.toolCalls += 1;
        summary = `${hookEvent}: ${String(payload.tool_name ?? payload.toolName ?? "mcp")}`;
        break;
      case "beforeReadFile":
        status = "running";
        summary = `Read ${String(payload.file_path ?? payload.filePath ?? "file")}`;
        break;
      case "preCompact":
        summary = "Context compact";
        break;
      default:
        if (payload.conversation_id || payload.conversationId || payload.generation_id) {
          if (status === "idle" || status === "completed" || status === "aborted") status = "running";
          if (!metrics.startedAt) metrics.startedAt = now;
        }
        summary = hookEvent === "unknown" ? "Hook event" : hookEvent;
    }

    if (model) metrics.lastModel = model;

    this.session = {
      conversationId: conversationId ?? null,
      status,
      metrics,
      updatedAt: now,
    };

    this.analytics.onHook(hookEvent, payload, {
      conversationId: conversationId ?? null,
      model: model ?? null,
      now,
    });

    const activity = this.pushActivity({
      type: hookEvent,
      timestamp: now,
      summary,
      payload,
    });

    return activity;
  }
}

/** Used only if analytics missing on older clients — should not happen. */
export function fallbackAnalytics(): AnalyticsSnapshot {
  return emptyAnalytics();
}
