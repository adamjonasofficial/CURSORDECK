function normalizeHookEvent(raw: string): string {
  const s = raw.trim();
  if (!s || s === "unknown") return "unknown";
  const aliases: Record<string, string> = {
    PreToolUse: "preToolUse",
    PostToolUse: "postToolUse",
    PostToolUseFailure: "postToolUseFailure",
    SessionStart: "sessionStart",
    SessionEnd: "sessionEnd",
    Stop: "stop",
    SubagentStart: "subagentStart",
    SubagentStop: "subagentStop",
    BeforeSubmitPrompt: "beforeSubmitPrompt",
    AfterFileEdit: "afterFileEdit",
    AfterAgentThought: "afterAgentThought",
    AfterAgentResponse: "afterAgentResponse",
    BeforeShellExecution: "beforeShellExecution",
    AfterShellExecution: "afterShellExecution",
    BeforeMCPExecution: "beforeMCPExecution",
    AfterMCPExecution: "afterMCPExecution",
    BeforeReadFile: "beforeReadFile",
    PreCompact: "preCompact",
    UserPromptSubmit: "beforeSubmitPrompt",
  };
  if (aliases[s]) return aliases[s]!;
  if (/^[A-Z]/.test(s) && !s.includes("_")) {
    return s[0]!.toLowerCase() + s.slice(1);
  }
  return s;
}

function inferHookEvent(payload: Record<string, unknown>): string | null {
  if (payload.tool_name || payload.toolName || payload.tool_input || payload.toolInput) {
    return payload.error || payload.failure_type ? "postToolUseFailure" : "postToolUse";
  }
  if (payload.file_path || payload.filePath || payload.edits) return "afterFileEdit";
  if (payload.prompt && payload.command === undefined) return "beforeSubmitPrompt";
  if (payload.command !== undefined) return "beforeShellExecution";
  if (payload.status && (payload.loop_count !== undefined || payload.summary)) return "subagentStop";
  return null;
}

export function resolveHookEvent(body: Record<string, unknown>, pathEvent?: string): string {
  const candidates = [
    pathEvent,
    body.hook_event_name,
    body.hookEventName,
    body.event_name,
    body.eventName,
    body.event,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() && c.trim() !== "unknown") {
      return normalizeHookEvent(c);
    }
  }
  const inferred = inferHookEvent(body);
  return inferred ? normalizeHookEvent(inferred) : "unknown";
}
