export const DEFAULT_BRIDGE_PORT = 3847;
export const DEFAULT_BRIDGE_HOST = "127.0.0.1";

export type ActionId =
  | "mode.agent"
  | "mode.ask"
  | "mode.plan"
  | "mode.debug"
  | "model.cycle"
  | "chat.new"
  | "chat.stop"
  | "chat.accept_all"
  | "chat.reject_all"
  | "chat.focus"
  | "ide.focus"
  | "ide.sidepanel"
  | "ide.terminal"
  | "ide.command_palette"
  | "ide.save_all"
  | "ide.explorer";

export interface ActionChord {
  /** nut.js style key names, modifiers as separate keys */
  keys: string[];
  /** Human-readable chord for docs / health UI */
  label: string;
  /** Cursor / VS Code command ID this chord should be bound to */
  commandId?: string;
}

export const ACTION_CATALOG: Record<
  ActionId,
  {
    id: ActionId;
    title: string;
    description: string;
    inject: boolean;
    defaultChord: ActionChord;
  }
> = {
  "mode.agent": {
    id: "mode.agent",
    title: "Agent",
    description: "Switch Composer to Agent mode",
    inject: true,
    defaultChord: {
      keys: ["LeftControl", "LeftAlt", "LeftShift", "1"],
      label: "Ctrl+Alt+Shift+1",
      commandId: "composerMode.agent",
    },
  },
  "mode.ask": {
    id: "mode.ask",
    title: "Ask",
    description: "Switch Composer to Ask mode",
    inject: true,
    defaultChord: {
      keys: ["LeftControl", "LeftAlt", "LeftShift", "2"],
      label: "Ctrl+Alt+Shift+2",
      commandId: "composerMode.ask",
    },
  },
  "mode.plan": {
    id: "mode.plan",
    title: "Plan",
    description: "Switch Composer to Plan mode",
    inject: true,
    defaultChord: {
      keys: ["LeftControl", "LeftAlt", "LeftShift", "3"],
      label: "Ctrl+Alt+Shift+3",
      commandId: "composerMode.plan",
    },
  },
  "mode.debug": {
    id: "mode.debug",
    title: "Debug",
    description: "Switch Composer to Debug mode",
    inject: true,
    defaultChord: {
      keys: ["LeftControl", "LeftAlt", "LeftShift", "4"],
      label: "Ctrl+Alt+Shift+4",
      commandId: "composerMode.debug",
    },
  },
  "model.cycle": {
    id: "model.cycle",
    title: "Cycle Model",
    description: "Loop between AI models",
    inject: true,
    defaultChord: {
      keys: ["LeftControl", "LeftAlt", "LeftShift", "5"],
      label: "Ctrl+Alt+Shift+5",
      commandId: "composer.cycleModel",
    },
  },
  "chat.new": {
    id: "chat.new",
    title: "New Chat",
    description: "Start a new Composer chat",
    inject: true,
    defaultChord: {
      keys: ["LeftControl", "LeftAlt", "LeftShift", "N"],
      label: "Ctrl+Alt+Shift+N",
      commandId: "composer.createNewComposerTab",
    },
  },
  "chat.stop": {
    id: "chat.stop",
    title: "Stop",
    description: "Cancel the current agent generation",
    inject: true,
    defaultChord: {
      keys: ["LeftControl", "LeftAlt", "LeftShift", "Backspace"],
      label: "Ctrl+Alt+Shift+Backspace",
      commandId: "composer.cancelComposer",
    },
  },
  "chat.accept_all": {
    id: "chat.accept_all",
    title: "Accept All",
    description: "Accept all suggested changes",
    inject: true,
    defaultChord: {
      keys: ["LeftControl", "LeftAlt", "LeftShift", "Enter"],
      label: "Ctrl+Alt+Shift+Enter",
      commandId: "composer.acceptComposer",
    },
  },
  "chat.reject_all": {
    id: "chat.reject_all",
    title: "Reject All",
    description: "Reject all suggested changes",
    inject: true,
    defaultChord: {
      keys: ["LeftControl", "LeftAlt", "LeftShift", "Delete"],
      label: "Ctrl+Alt+Shift+Delete",
      commandId: "composer.rejectComposer",
    },
  },
  "chat.focus": {
    id: "chat.focus",
    title: "Focus Chat",
    description: "Focus Composer / AI chat",
    inject: true,
    defaultChord: {
      keys: ["LeftControl", "LeftAlt", "LeftShift", "C"],
      label: "Ctrl+Alt+Shift+C",
      commandId: "composer.focusComposer",
    },
  },
  "ide.focus": {
    id: "ide.focus",
    title: "Focus Cursor",
    description: "Bring Cursor IDE to the foreground",
    inject: false,
    defaultChord: { keys: [], label: "(focus only)" },
  },
  "ide.sidepanel": {
    id: "ide.sidepanel",
    title: "Sidepanel",
    description: "Toggle the AI sidepanel",
    inject: true,
    defaultChord: {
      keys: ["LeftControl", "LeftAlt", "LeftShift", "I"],
      label: "Ctrl+Alt+Shift+I",
      commandId: "workbench.action.toggleAuxiliaryBar",
    },
  },
  "ide.terminal": {
    id: "ide.terminal",
    title: "Terminal",
    description: "Toggle integrated terminal",
    inject: true,
    defaultChord: {
      keys: ["LeftControl", "LeftAlt", "LeftShift", "T"],
      label: "Ctrl+Alt+Shift+T",
      commandId: "workbench.action.terminal.toggleTerminal",
    },
  },
  "ide.command_palette": {
    id: "ide.command_palette",
    title: "Command Palette",
    description: "Open the command palette",
    inject: true,
    defaultChord: {
      keys: ["LeftControl", "LeftAlt", "LeftShift", "P"],
      label: "Ctrl+Alt+Shift+P",
      commandId: "workbench.action.showCommands",
    },
  },
  "ide.save_all": {
    id: "ide.save_all",
    title: "Save All",
    description: "Save all dirty editors",
    inject: true,
    defaultChord: {
      keys: ["LeftControl", "LeftAlt", "LeftShift", "S"],
      label: "Ctrl+Alt+Shift+S",
      commandId: "workbench.action.files.saveAll",
    },
  },
  "ide.explorer": {
    id: "ide.explorer",
    title: "Explorer",
    description: "Show the file explorer",
    inject: true,
    defaultChord: {
      keys: ["LeftControl", "LeftAlt", "LeftShift", "E"],
      label: "Ctrl+Alt+Shift+E",
      commandId: "workbench.view.explorer",
    },
  },
};

/** VS Code keybinding.json key strings for the installer */
export const KEYBINDING_ENTRIES: Array<{
  key: string;
  command: string;
  marker: string;
}> = [
  { key: "ctrl+alt+shift+1", command: "composerMode.agent", marker: "csd:mode.agent" },
  { key: "ctrl+alt+shift+2", command: "composerMode.ask", marker: "csd:mode.ask" },
  { key: "ctrl+alt+shift+3", command: "composerMode.plan", marker: "csd:mode.plan" },
  { key: "ctrl+alt+shift+4", command: "composerMode.debug", marker: "csd:mode.debug" },
  { key: "ctrl+alt+shift+5", command: "composer.cycleModel", marker: "csd:model.cycle" },
  { key: "ctrl+alt+shift+n", command: "composer.createNewComposerTab", marker: "csd:chat.new" },
  {
    key: "ctrl+alt+shift+backspace",
    command: "composer.cancelComposer",
    marker: "csd:chat.stop",
  },
  {
    key: "ctrl+alt+shift+enter",
    command: "composer.acceptComposer",
    marker: "csd:chat.accept_all",
  },
  {
    key: "ctrl+alt+shift+delete",
    command: "composer.rejectComposer",
    marker: "csd:chat.reject_all",
  },
  {
    key: "ctrl+alt+shift+c",
    command: "composer.focusComposer",
    marker: "csd:chat.focus",
  },
  {
    key: "ctrl+alt+shift+i",
    command: "workbench.action.toggleAuxiliaryBar",
    marker: "csd:ide.sidepanel",
  },
  {
    key: "ctrl+alt+shift+t",
    command: "workbench.action.terminal.toggleTerminal",
    marker: "csd:ide.terminal",
  },
  {
    key: "ctrl+alt+shift+p",
    command: "workbench.action.showCommands",
    marker: "csd:ide.command_palette",
  },
  {
    key: "ctrl+alt+shift+s",
    command: "workbench.action.files.saveAll",
    marker: "csd:ide.save_all",
  },
  {
    key: "ctrl+alt+shift+e",
    command: "workbench.view.explorer",
    marker: "csd:ide.explorer",
  },
];

export type AgentLifecycleStatus =
  | "idle"
  | "running"
  | "thinking"
  | "responding"
  | "completed"
  | "aborted"
  | "error";

export interface SessionMetrics {
  toolCalls: number;
  fileEdits: number;
  thoughts: number;
  responses: number;
  subagents: number;
  startedAt: string | null;
  endedAt: string | null;
  lastModel: string | null;
  lastStatus: string | null;
}

export interface AgentSessionState {
  conversationId: string | null;
  status: AgentLifecycleStatus;
  metrics: SessionMetrics;
  updatedAt: string;
}

export interface ActivityEvent {
  id: string;
  type: string;
  timestamp: string;
  summary: string;
  payload?: unknown;
}

export interface BridgeHealth {
  ok: boolean;
  port: number;
  startedAt: string;
  platform: string;
  cursorWindowFound: boolean;
  hooksLastSeenAt: string | null;
  keybindingsInstalled: boolean | null;
}

export interface BridgeStateSnapshot {
  health: BridgeHealth;
  session: AgentSessionState;
  activity: ActivityEvent[];
  lastAction: { id: ActionId; at: string; ok: boolean; error?: string } | null;
  /** Compact analytics for live WS (lifetime + recent turns/conversations). */
  analytics: AnalyticsSnapshot;
}

export type TurnStatus = "open" | "completed" | "aborted" | "error";

export interface TurnMetrics {
  toolCalls: number;
  fileEdits: number;
  thoughts: number;
  responses: number;
  subagents: number;
}

export interface PromptTurn {
  id: string;
  conversationId: string | null;
  generationId: string | null;
  startedAt: string;
  endedAt: string | null;
  promptPreview: string;
  model: string | null;
  modelsUsed: string[];
  status: TurnStatus;
  metrics: TurnMetrics;
}

export interface ConversationSummary {
  id: string;
  startedAt: string;
  endedAt: string | null;
  turnCount: number;
  totals: TurnMetrics;
  modelCounts: Record<string, number>;
  lastPromptPreview: string | null;
}

export interface DayBucket {
  day: string;
  turns: number;
  tools: number;
  edits: number;
}

export interface LifetimeStats {
  turns: number;
  conversations: number;
  toolCalls: number;
  fileEdits: number;
  thoughts: number;
  responses: number;
  subagents: number;
  modelCounts: Record<string, number>;
  byDay: DayBucket[];
}

export interface AnalyticsSnapshot {
  version: 1;
  lifetime: LifetimeStats;
  conversations: ConversationSummary[];
  turns: PromptTurn[];
  updatedAt: string;
}

export function emptyTurnMetrics(): TurnMetrics {
  return { toolCalls: 0, fileEdits: 0, thoughts: 0, responses: 0, subagents: 0 };
}

export function emptyLifetimeStats(): LifetimeStats {
  return {
    turns: 0,
    conversations: 0,
    toolCalls: 0,
    fileEdits: 0,
    thoughts: 0,
    responses: 0,
    subagents: 0,
    modelCounts: {},
    byDay: [],
  };
}

export function emptyAnalytics(): AnalyticsSnapshot {
  return {
    version: 1,
    lifetime: emptyLifetimeStats(),
    conversations: [],
    turns: [],
    updatedAt: new Date().toISOString(),
  };
}

export function truncatePromptPreview(text: string, max = 120): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

export type WsServerMessage =
  | { type: "state"; payload: BridgeStateSnapshot }
  | { type: "activity"; payload: ActivityEvent }
  | { type: "pong" };

export type WsClientMessage = { type: "ping" } | { type: "subscribe" };

export function emptyMetrics(): SessionMetrics {
  return {
    toolCalls: 0,
    fileEdits: 0,
    thoughts: 0,
    responses: 0,
    subagents: 0,
    startedAt: null,
    endedAt: null,
    lastModel: null,
    lastStatus: null,
  };
}

export function createInitialSession(): AgentSessionState {
  return {
    conversationId: null,
    status: "idle",
    metrics: emptyMetrics(),
    updatedAt: new Date().toISOString(),
  };
}

export function isActionId(value: string): value is ActionId {
  return value in ACTION_CATALOG;
}

export function bridgeBaseUrl(port = DEFAULT_BRIDGE_PORT, host = DEFAULT_BRIDGE_HOST) {
  return `http://${host}:${port}`;
}

export function bridgeWsUrl(port = DEFAULT_BRIDGE_PORT, host = DEFAULT_BRIDGE_HOST) {
  return `ws://${host}:${port}/ws`;
}

/** Per-key visual customization (Stream Deck PI + appearance.json). */
export type MotionStyle = "breathe" | "spin" | "orbit";

export interface KeyAppearance {
  /** Neon accent, e.g. #38BDF8 */
  color?: string;
  /** Lucide icon name, e.g. bot */
  icon?: string;
  /** Animation style used when regenerating art */
  motion?: MotionStyle;
  /** Label baked into generated art */
  label?: string;
  /** Runtime title on the Stream Deck key */
  titleOverride?: string;
  /** Animation speed multiplier (0.25–4, default 1) */
  speed?: number;
  /** Play animation backwards */
  reverse?: boolean;
  /** Phase offset 0–15 (feels like rotation start angle) */
  frameOffset?: number;
  /** Disable idle animation (static hero frame) */
  animate?: boolean;
}

export interface AppearanceFile {
  version: 1;
  actions: Partial<Record<string, KeyAppearance>>;
}

export function defaultKeyAppearance(): Required<
  Pick<KeyAppearance, "speed" | "reverse" | "frameOffset" | "animate">
> {
  return {
    speed: 1,
    reverse: false,
    frameOffset: 0,
    animate: true,
  };
}

export function clampAppearance(input: KeyAppearance | undefined): KeyAppearance {
  const a = { ...(input ?? {}) };
  if (a.speed !== undefined) a.speed = Math.min(4, Math.max(0.25, Number(a.speed) || 1));
  if (a.frameOffset !== undefined) {
    a.frameOffset = ((Math.round(Number(a.frameOffset)) % 16) + 16) % 16;
  }
  if (a.color && !/^#[0-9A-Fa-f]{6}$/.test(a.color)) delete a.color;
  if (a.animate !== undefined) a.animate = Boolean(a.animate);
  if (a.reverse !== undefined) a.reverse = Boolean(a.reverse);
  if (a.motion && !["breathe", "spin", "orbit"].includes(a.motion)) delete a.motion;
  if (typeof a.titleOverride === "string") a.titleOverride = a.titleOverride.slice(0, 24);
  if (typeof a.label === "string") a.label = a.label.slice(0, 12);
  if (typeof a.icon === "string") a.icon = a.icon.trim();
  return a;
}
