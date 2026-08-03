import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ACTION_CATALOG,
  emptyAnalytics,
  type ActionId,
  type AgentLifecycleStatus,
  type BridgeStateSnapshot,
  type WsServerMessage,
  bridgeWsUrl,
  DEFAULT_BRIDGE_PORT,
} from "@csd/shared";
import { StatsView } from "./StatsView";

const MODE_KEYS: ActionId[] = ["mode.agent", "mode.ask", "mode.plan", "mode.debug", "model.cycle"];
const CHAT_KEYS: ActionId[] = [
  "chat.new",
  "chat.focus",
  "chat.stop",
  "chat.accept_all",
  "chat.reject_all",
];
const IDE_KEYS: ActionId[] = [
  "ide.focus",
  "ide.sidepanel",
  "ide.terminal",
  "ide.command_palette",
  "ide.save_all",
  "ide.explorer",
];

const API_BASE = import.meta.env.DEV ? "/api" : `http://127.0.0.1:${DEFAULT_BRIDGE_PORT}`;

type TabId = "pad" | "stats";

const KEY_TINT: Partial<Record<ActionId, string>> = {
  "mode.agent": "#38bdf8",
  "mode.ask": "#22d3ee",
  "mode.plan": "#c084fc",
  "mode.debug": "#fb923c",
  "model.cycle": "#2dd4bf",
  "chat.new": "#4ade80",
  "chat.focus": "#38bdf8",
  "chat.stop": "#f87171",
  "chat.accept_all": "#34d399",
  "chat.reject_all": "#fb7185",
  "ide.terminal": "#4ade80",
  "ide.command_palette": "#fbbf24",
  "ide.save_all": "#34d399",
  "ide.explorer": "#67e8f9",
};

function statusLabel(status: AgentLifecycleStatus): string {
  switch (status) {
    case "thinking":
      return "THINK";
    case "running":
      return "RUN";
    case "responding":
      return "REPLY";
    case "completed":
      return "DONE";
    case "aborted":
      return "STOP";
    case "error":
      return "ERROR";
    default:
      return "IDLE";
  }
}

function statusColor(status: AgentLifecycleStatus): string {
  switch (status) {
    case "running":
      return "var(--running)";
    case "thinking":
      return "var(--thinking)";
    case "responding":
      return "var(--reply)";
    case "completed":
      return "var(--ok)";
    case "aborted":
      return "var(--warn)";
    case "error":
      return "var(--err)";
    default:
      return "var(--muted)";
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

function durationLabel(startedAt: string | null, endedAt: string | null, now: number): string {
  if (!startedAt) return "—";
  const end = endedAt ? new Date(endedAt).getTime() : now;
  const ms = Math.max(0, end - new Date(startedAt).getTime());
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

function activityBuckets(state: BridgeStateSnapshot | null, buckets = 24, windowMs = 300_000): number[] {
  const counts = new Array(buckets).fill(0) as number[];
  if (!state) return counts;
  const now = Date.now();
  for (const evt of state.activity) {
    const t = Date.parse(evt.timestamp);
    if (!Number.isFinite(t)) continue;
    const age = now - t;
    if (age < 0 || age > windowMs) continue;
    const idx = Math.min(buckets - 1, Math.floor(((windowMs - age) / windowMs) * buckets));
    counts[idx]! += 1;
  }
  return counts;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  const w = 240;
  const h = 56;
  const step = w / Math.max(1, values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = h - 4 - (v / max) * (h - 10);
      return `${x},${y}`;
    })
    .join(" ");
  const area = `0,${h} ${points} ${w},${h}`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polygon points={area} fill={color} opacity="0.18" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

function MetricBars({
  tools,
  edits,
  thoughts,
  subagents,
}: {
  tools: number;
  edits: number;
  thoughts: number;
  subagents: number;
}) {
  const rows = [
    { label: "Tools", value: tools, color: "#38bdf8" },
    { label: "Edits", value: edits, color: "#a78bfa" },
    { label: "Thoughts", value: thoughts, color: "#2dd4bf" },
    { label: "Subagents", value: subagents, color: "#fb923c" },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value), 5);
  return (
    <div className="bar-metrics">
      {rows.map((row) => (
        <div className="bar-row" key={row.label}>
          <div className="bar-meta">
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${Math.max(4, (row.value / max) * 100)}%`, background: row.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function KeyGrid({
  ids,
  pressed,
  busy,
  onRun,
}: {
  ids: ActionId[];
  pressed: ActionId | null;
  busy: ActionId | null;
  onRun: (id: ActionId) => void;
}) {
  return (
    <div className="deck-grid">
      {ids.map((id) => {
        const meta = ACTION_CATALOG[id];
        const tint = KEY_TINT[id] ?? "#64748b";
        return (
          <button
            key={id}
            type="button"
            className={`deck-key${pressed === id ? " is-pressed" : ""}`}
            style={{ "--key-tint": tint } as CSSProperties}
            disabled={busy === id}
            onClick={() => onRun(id)}
            title={meta.description}
          >
            <span className="key-glow" aria-hidden />
            <span className="title">{meta.title}</span>
            <span className="hint">{meta.defaultChord.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function App() {
  const [tab, setTab] = useState<TabId>("pad");
  const [state, setState] = useState<BridgeStateSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [pressed, setPressed] = useState<ActionId | null>(null);
  const [busy, setBusy] = useState<ActionId | null>(null);
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const url = import.meta.env.DEV
        ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`
        : bridgeWsUrl();
      ws = new WebSocket(url);
      ws.onopen = () => {
        setConnected(true);
        ws?.send(JSON.stringify({ type: "subscribe" }));
      };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data)) as WsServerMessage;
          if (msg.type === "state") setState(msg.payload);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const runAction = useCallback(async (id: ActionId) => {
    setPressed(id);
    setBusy(id);
    setTimeout(() => setPressed(null), 140);
    try {
      const res = await fetch(`${API_BASE}/actions/${id}`, { method: "POST" });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setToast({ text: body.error ?? `Action ${id} failed`, err: true });
      } else {
        setToast({ text: `${ACTION_CATALOG[id].title} sent` });
      }
    } catch (err) {
      setToast({
        text: err instanceof Error ? err.message : "Bridge unreachable",
        err: true,
      });
    } finally {
      setBusy(null);
    }
  }, []);

  const session = state?.session;
  const health = state?.health;
  const status = session?.status ?? "idle";
  const buckets = useMemo(() => activityBuckets(state), [state]);
  const recentCount = buckets.reduce((a, b) => a + b, 0);

  const healthItems = useMemo(
    () => [
      {
        label: "Bridge",
        ok: connected,
        text: connected ? `:${health?.port ?? DEFAULT_BRIDGE_PORT}` : "offline",
      },
      {
        label: "Cursor",
        ok: !!health?.cursorWindowFound,
        text: health?.cursorWindowFound ? "focused window" : "not found",
      },
      {
        label: "Keys",
        ok: health?.keybindingsInstalled === true,
        warn: health?.keybindingsInstalled === null,
        text:
          health?.keybindingsInstalled === true
            ? "installed"
            : health?.keybindingsInstalled === false
              ? "run setup.bat"
              : "unknown",
      },
      {
        label: "Hooks",
        ok: !!health?.hooksLastSeenAt,
        warn: !health?.hooksLastSeenAt,
        text: health?.hooksLastSeenAt ? formatTime(health.hooksLastSeenAt) : "waiting…",
      },
    ],
    [connected, health],
  );

  return (
    <div className={`app${tab === "stats" ? " app-stats" : ""}`}>
      <header className="brand">
        <div className="brand-lockup">
          <img className="brand-mark" src="/logo.png" alt="" width={72} height={72} />
          <div>
            <p className="brand-kicker">Local control</p>
            <h1>CursorDeck</h1>
            <p className="brand-sub">Modes, chat, live pulse, and persistent analytics</p>
          </div>
        </div>
        <div className="brand-right">
          <nav className="tabs" aria-label="Views">
            <button
              type="button"
              className={`tab${tab === "pad" ? " is-active" : ""}`}
              onClick={() => setTab("pad")}
            >
              Pad
            </button>
            <button
              type="button"
              className={`tab${tab === "stats" ? " is-active" : ""}`}
              onClick={() => setTab("stats")}
            >
              Stats
            </button>
          </nav>
          <div
            className={`live-chip${connected ? " is-on" : ""}`}
            style={{ "--status-color": statusColor(status) } as CSSProperties}
          >
            <span className="live-dot" />
            <span className="live-label">{statusLabel(status)}</span>
            <span className="live-meta">{connected ? "live" : "reconnecting"}</span>
          </div>
        </div>
      </header>

      {tab === "stats" ? (
        <div className="stats-shell">
          <StatsView apiBase={API_BASE} live={state?.analytics ?? emptyAnalytics()} />
        </div>
      ) : (
        <>
          <section
            className="status-hero"
            style={{ "--status-color": statusColor(status) } as CSSProperties}
            aria-live="polite"
          >
            <div className="status-hero-copy">
              <p className="eyebrow">Agent</p>
              <h2>{statusLabel(status)}</h2>
              <p>
                {durationLabel(session?.metrics.startedAt ?? null, session?.metrics.endedAt ?? null, now)}
                {session?.metrics.lastModel ? ` · ${session.metrics.lastModel}` : ""}
              </p>
            </div>
            <div className="status-hero-chart">
              <div className="chart-head">
                <span>Activity · 5 min</span>
                <strong>{recentCount}</strong>
              </div>
              <Sparkline values={buckets} color="var(--status-color)" />
            </div>
          </section>

          <section className="deck-shell" aria-label="Stream Deck">
            <div className="group">
              <h3>Modes</h3>
              <KeyGrid ids={MODE_KEYS} pressed={pressed} busy={busy} onRun={(id) => void runAction(id)} />
            </div>
            <div className="group">
              <h3>Chat</h3>
              <KeyGrid ids={CHAT_KEYS} pressed={pressed} busy={busy} onRun={(id) => void runAction(id)} />
            </div>
            <div className="group">
              <h3>IDE</h3>
              <KeyGrid ids={IDE_KEYS} pressed={pressed} busy={busy} onRun={(id) => void runAction(id)} />
            </div>
          </section>

          <aside className="side">
            <section className="panel">
              <h2>Health</h2>
              <div className="health-grid">
                {healthItems.map((item) => (
                  <div className="health-row" key={item.label}>
                    <span>
                      <span className={`dot ${item.ok ? "ok" : item.warn ? "warn" : "err"}`} />
                      {item.label}
                    </span>
                    <span className="health-text">{item.text}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <h2>Session metrics</h2>
              <MetricBars
                tools={session?.metrics.toolCalls ?? 0}
                edits={session?.metrics.fileEdits ?? 0}
                thoughts={session?.metrics.thoughts ?? 0}
                subagents={session?.metrics.subagents ?? 0}
              />
            </section>

            <section className="panel panel-feed">
              <h2>Activity</h2>
              <ul className="feed">
                {(state?.activity ?? []).slice(0, 36).map((evt) => (
                  <li key={evt.id}>
                    <span className="when">
                      {formatTime(evt.timestamp)} · {evt.type}
                    </span>
                    {evt.summary}
                  </li>
                ))}
                {!state?.activity?.length ? (
                  <li>
                    <span className="when">waiting</span>
                    No events yet — keep the tray host running and use Cursor with hooks installed (
                    <code>setup.bat</code>).
                  </li>
                ) : null}
              </ul>
            </section>
          </aside>
        </>
      )}

      {toast ? <div className={`toast${toast.err ? " err" : ""}`}>{toast.text}</div> : null}
    </div>
  );
}
