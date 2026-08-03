import { useEffect, useMemo, useState } from "react";
import {
  emptyAnalytics,
  type AnalyticsSnapshot,
  type ConversationSummary,
  type PromptTurn,
} from "@csd/shared";
import { AreaSpark, BarChart, DonutChart, HorizontalBars, modelColor } from "./charts";

const WORK_COLORS = {
  tools: "#38bdf8",
  edits: "#a78bfa",
  thoughts: "#2dd4bf",
  responses: "#f472b6",
  subagents: "#fb923c",
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function shortId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function topModel(counts: Record<string, number>): string {
  let best = "—";
  let n = -1;
  for (const [k, v] of Object.entries(counts)) {
    if (v > n) {
      n = v;
      best = k;
    }
  }
  return best;
}

function durationMs(start: string, end: string | null): string {
  const e = end ? Date.parse(end) : Date.now();
  const s = Date.parse(start);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return "—";
  const sec = Math.max(0, Math.floor((e - s) / 1000));
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s`;
}

export function StatsView({
  apiBase,
  live,
}: {
  apiBase: string;
  live: AnalyticsSnapshot | null | undefined;
}) {
  const [full, setFull] = useState<AnalyticsSnapshot | null>(null);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const [busyClear, setBusyClear] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const res = await fetch(`${apiBase}/analytics`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFull((await res.json()) as AnalyticsSnapshot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    }
  };

  useEffect(() => {
    void refresh();
  }, [apiBase]);

  // Prefer full REST snapshot; fall back to live WS compact
  const data = full ?? live ?? emptyAnalytics();

  useEffect(() => {
    if (live && !full) setFull(live);
  }, [live, full]);

  // Keep list fresh when WS updates (merge lifetime from live if newer)
  useEffect(() => {
    if (!live) return;
    setFull((prev) => {
      if (!prev) return live;
      if (Date.parse(live.updatedAt) >= Date.parse(prev.updatedAt)) {
        // Re-fetch full periodically when live updates
        return prev;
      }
      return prev;
    });
  }, [live]);

  useEffect(() => {
    if (!live) return;
    const t = setTimeout(() => void refresh(), 800);
    return () => clearTimeout(t);
  }, [live?.updatedAt, apiBase]);

  const selectedTurn: PromptTurn | null =
    (selectedTurnId && data.turns.find((t) => t.id === selectedTurnId)) || null;

  const modelItems = useMemo(() => {
    const entries = Object.entries(data.lifetime.modelCounts).sort((a, b) => b[1] - a[1]);
    return entries.map(([label, value], i) => ({
      label,
      value,
      color: modelColor(label, i),
    }));
  }, [data.lifetime.modelCounts]);

  const dayItems = useMemo(() => {
    const days = data.lifetime.byDay.slice(-14);
    return days.map((d) => ({
      label: d.day.slice(5),
      value: d.turns,
      color: "#38bdf8",
    }));
  }, [data.lifetime.byDay]);

  const workItems = useMemo(
    () => [
      { label: "Tools", value: data.lifetime.toolCalls, color: WORK_COLORS.tools },
      { label: "Edits", value: data.lifetime.fileEdits, color: WORK_COLORS.edits },
      { label: "Thoughts", value: data.lifetime.thoughts, color: WORK_COLORS.thoughts },
      { label: "Responses", value: data.lifetime.responses, color: WORK_COLORS.responses },
      { label: "Subagents", value: data.lifetime.subagents, color: WORK_COLORS.subagents },
    ],
    [data.lifetime],
  );

  const turnSpark = useMemo(() => {
    const recent = [...data.turns].slice(0, 24).reverse();
    return recent.map(
      (t) => t.metrics.toolCalls + t.metrics.fileEdits + t.metrics.thoughts + t.metrics.responses,
    );
  }, [data.turns]);

  const clearAll = async () => {
    if (!window.confirm("Smazat veškerou analytiku (otázky, konverzace, lifetime)?")) return;
    setBusyClear(true);
    try {
      const res = await fetch(`${apiBase}/analytics`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFull(emptyAnalytics());
      setSelectedTurnId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setBusyClear(false);
    }
  };

  const kpis = [
    { label: "Questions", value: data.lifetime.turns },
    { label: "Conversations", value: data.lifetime.conversations },
    { label: "Tools", value: data.lifetime.toolCalls },
    { label: "Edits", value: data.lifetime.fileEdits },
    { label: "Thoughts", value: data.lifetime.thoughts },
    { label: "Models", value: Object.keys(data.lifetime.modelCounts).length },
  ];

  return (
    <div className="stats-view">
      <div className="stats-toolbar">
        <div>
          <h2 className="stats-title">Analytics</h2>
          <p className="stats-sub">
            Perzistentní historie otázek a modelů · {formatWhen(data.updatedAt)}
          </p>
        </div>
        <div className="stats-actions">
          <button type="button" className="ghost-btn" onClick={() => void refresh()}>
            Refresh
          </button>
          <button type="button" className="danger-btn" disabled={busyClear} onClick={() => void clearAll()}>
            Clear
          </button>
        </div>
      </div>

      {error ? <p className="stats-error">{error}</p> : null}

      <section className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi-card" key={k.label}>
            <span>{k.label}</span>
            <strong>{k.value}</strong>
          </div>
        ))}
      </section>

      <div className="stats-grid">
        <section className="panel chart-panel">
          <h3>Model mix</h3>
          {modelItems.length ? (
            <DonutChart items={modelItems} />
          ) : (
            <p className="empty-hint">Zatím žádná data o modelech — odešli prompt v Cursoru.</p>
          )}
        </section>

        <section className="panel chart-panel">
          <h3>Questions · 14 days</h3>
          {dayItems.length ? (
            <BarChart items={dayItems} />
          ) : (
            <p className="empty-hint">Denní aktivita se objeví po prvních otázkách.</p>
          )}
        </section>

        <section className="panel chart-panel">
          <h3>Work mix (lifetime)</h3>
          <HorizontalBars items={workItems} />
        </section>

        <section className="panel chart-panel">
          <h3>Recent turn intensity</h3>
          {turnSpark.length ? (
            <AreaSpark values={turnSpark} color="#2dd4bf" />
          ) : (
            <p className="empty-hint">Žádné otázky v historii.</p>
          )}
        </section>
      </div>

      <div className="stats-lists">
        <section className="panel">
          <h3>Conversations</h3>
          <ul className="entity-list">
            {data.conversations.map((c: ConversationSummary) => (
              <li key={c.id}>
                <div className="entity-head">
                  <strong title={c.id}>{shortId(c.id)}</strong>
                  <span>{c.turnCount} Q</span>
                </div>
                <p className="entity-meta">
                  {topModel(c.modelCounts)} · {formatWhen(c.startedAt)}
                  {c.endedAt ? "" : " · open"}
                </p>
                {c.lastPromptPreview ? <p className="entity-preview">{c.lastPromptPreview}</p> : null}
              </li>
            ))}
            {!data.conversations.length ? (
              <li className="empty-hint">Zatím žádné konverzace.</li>
            ) : null}
          </ul>
        </section>

        <section className="panel">
          <h3>Questions</h3>
          <ul className="entity-list turns">
            {data.turns.map((t: PromptTurn) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`turn-btn${selectedTurnId === t.id ? " is-active" : ""}`}
                  onClick={() => setSelectedTurnId(t.id)}
                >
                  <div className="entity-head">
                    <strong>{t.model ?? "unknown model"}</strong>
                    <span className={`turn-status st-${t.status}`}>{t.status}</span>
                  </div>
                  <p className="entity-preview">{t.promptPreview}</p>
                  <p className="entity-meta">
                    {formatWhen(t.startedAt)} · T{t.metrics.toolCalls} E{t.metrics.fileEdits} ·{" "}
                    {durationMs(t.startedAt, t.endedAt)}
                  </p>
                </button>
              </li>
            ))}
            {!data.turns.length ? <li className="empty-hint">Zatím žádné otázky.</li> : null}
          </ul>
        </section>
      </div>

      {selectedTurn ? (
        <aside className="turn-detail panel">
          <div className="entity-head">
            <h3>Question detail</h3>
            <button type="button" className="ghost-btn" onClick={() => setSelectedTurnId(null)}>
              Close
            </button>
          </div>
          <p className="entity-preview big">{selectedTurn.promptPreview}</p>
          <dl className="detail-grid">
            <div>
              <dt>Status</dt>
              <dd>{selectedTurn.status}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{durationMs(selectedTurn.startedAt, selectedTurn.endedAt)}</dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{formatWhen(selectedTurn.startedAt)}</dd>
            </div>
            <div>
              <dt>Conversation</dt>
              <dd title={selectedTurn.conversationId ?? ""}>
                {selectedTurn.conversationId ? shortId(selectedTurn.conversationId) : "—"}
              </dd>
            </div>
          </dl>
          <h4>Models used</h4>
          {selectedTurn.modelsUsed.length ? (
            <ul className="model-chips">
              {selectedTurn.modelsUsed.map((m, i) => (
                <li key={m} style={{ borderColor: modelColor(m, i) }}>
                  {m}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-hint">Model neuveden.</p>
          )}
          <h4>Metrics</h4>
          <HorizontalBars
            items={[
              { label: "Tools", value: selectedTurn.metrics.toolCalls, color: WORK_COLORS.tools },
              { label: "Edits", value: selectedTurn.metrics.fileEdits, color: WORK_COLORS.edits },
              { label: "Thoughts", value: selectedTurn.metrics.thoughts, color: WORK_COLORS.thoughts },
              { label: "Responses", value: selectedTurn.metrics.responses, color: WORK_COLORS.responses },
              { label: "Subagents", value: selectedTurn.metrics.subagents, color: WORK_COLORS.subagents },
            ]}
          />
        </aside>
      ) : null}
    </div>
  );
}
