type Pair = { label: string; value: number; color: string };

export function BarChart({
  items,
  height = 140,
}: {
  items: Pair[];
  height?: number;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const gap = 6;
  const barW = items.length ? Math.max(8, (280 - gap * (items.length - 1)) / items.length) : 8;
  const w = items.length * barW + Math.max(0, items.length - 1) * gap;
  return (
    <svg className="chart-svg" viewBox={`0 0 ${Math.max(w, 40)} ${height}`} role="img">
      {items.map((item, i) => {
        const h = Math.max(2, (item.value / max) * (height - 28));
        const x = i * (barW + gap);
        const y = height - 18 - h;
        return (
          <g key={item.label}>
            <rect x={x} y={y} width={barW} height={h} rx={4} fill={item.color} opacity={0.9} />
            <text x={x + barW / 2} y={height - 4} textAnchor="middle" className="chart-label">
              {item.label.length > 6 ? item.label.slice(0, 5) + "…" : item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function HorizontalBars({
  items,
}: {
  items: Pair[];
}) {
  const max = Math.max(1, ...items.map((i) => i.value), 5);
  return (
    <div className="hbar-list">
      {items.map((item) => (
        <div className="hbar-row" key={item.label}>
          <div className="hbar-meta">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
          <div className="hbar-track">
            <div
              className="hbar-fill"
              style={{
                width: `${Math.max(3, (item.value / max) * 100)}%`,
                background: item.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({
  items,
  size = 160,
}: {
  items: Pair[];
  size?: number;
}) {
  const total = Math.max(1, items.reduce((a, b) => a + b.value, 0));
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  const stroke = size * 0.14;
  let angle = -Math.PI / 2;
  const arcs: Array<{ d: string; color: string; key: string }> = [];

  for (const item of items) {
    if (item.value <= 0) continue;
    const sweep = (item.value / total) * Math.PI * 2;
    const a1 = angle + sweep;
    const x0 = cx + Math.cos(angle) * r;
    const y0 = cy + Math.sin(angle) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    const large = sweep > Math.PI ? 1 : 0;
    arcs.push({
      key: item.label,
      color: item.color,
      d: `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`,
    });
    angle = a1;
  }

  return (
    <div className="donut-wrap">
      <svg className="chart-svg donut" viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke} />
        {arcs.map((a) => (
          <path key={a.key} d={a.d} fill="none" stroke={a.color} strokeWidth={stroke} strokeLinecap="butt" />
        ))}
        <text x={cx} y={cy + 4} textAnchor="middle" className="donut-center">
          {total}
        </text>
      </svg>
      <ul className="donut-legend">
        {items.map((item) => (
          <li key={item.label}>
            <span className="swatch" style={{ background: item.color }} />
            <span className="leg-label">{item.label}</span>
            <strong>{item.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AreaSpark({
  values,
  color = "#38bdf8",
  width = 320,
  height = 96,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - 6 - (v / max) * (height - 14);
      return `${x},${y}`;
    })
    .join(" ");
  const area = `0,${height} ${points} ${width},${height}`;
  return (
    <svg className="chart-svg spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polygon points={area} fill={color} opacity="0.16" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}

const MODEL_PALETTE = ["#38bdf8", "#a78bfa", "#2dd4bf", "#fb923c", "#f472b6", "#fbbf24", "#4ade80", "#94a3b8"];

export function modelColor(name: string, index: number): string {
  void name;
  return MODEL_PALETTE[index % MODEL_PALETTE.length]!;
}
