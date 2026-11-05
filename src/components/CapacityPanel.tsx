import { useState } from "react";
import type { InfraCapacity, InfraCapacityDay } from "../types";

// Data growth and how much more fits (backend computeCapacity). Photos are
// the bulk, so everything is counted in copies (front + back each).

const GB = 1 << 30;
const size = (b: number) => (b >= 1024 * GB ? `${(b / 1024 / GB).toFixed(1)} TB` : b >= GB ? `${(b / GB).toFixed(1)} GB` : `${Math.round(b / (1 << 20))} MB`);
const num = (n: number) => Math.round(n).toLocaleString();
const days = (d: number | null) => (d == null ? "—" : d > 365 * 3 ? "3+ years" : d > 90 ? `~${Math.round(d / 30)} months` : `~${Math.round(d)} days`);

export default function CapacityPanel({ c }: { c: InfraCapacity }) {
  const perCopy = c.bytes_per_copy;
  const waiting = c.backlog_copies + c.over_cap_copies;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex items-baseline gap-2 mb-2">
        <div className="text-sm font-semibold">Data growth &amp; capacity</div>
        <div className="text-[10px] text-muted">grading predictor photos + database</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile value={c.headroom_bytes != null ? size(c.headroom_bytes) : "—"}
          label={`room left for photos (${size(c.photo_bytes)} used${c.budget_bytes ? ` of a ${size(c.budget_bytes)} budget` : ""}${c.free_bytes != null ? `, ${size(c.free_bytes)} free on the share` : ""})`} />
        <Tile value={c.copies_that_fit != null ? num(c.copies_that_fit) : "—"}
          label={`more copies fit · ${size(perCopy)} per copy (front + back)`} />
        <Tile value={`${num(c.new_listings_per_day_7d)}/day`}
          label={`new listings this week (30-day avg ${num(c.new_listings_per_day_30d)}) · ${num(c.copies_per_day_7d)}/day downloaded`} />
        <Tile value={days(c.days_left_at_pace)}
          label={`until full at this week's pace (${size(c.photo_bytes_per_day_7d)}/day)`} />
        <Tile value={days(c.days_left_keep_all)}
          label={`until full keeping everything: ${num(waiting)} waiting, then every new listing (${size(c.steady_bytes_per_day)}/day)`} />
      </div>
      <div className="text-[10px] text-muted mt-2">
        Waiting: {num(c.backlog_copies)} in the triage backlog ({size(c.backlog_copies * perCopy)}) and {num(c.over_cap_copies)} held
        back by the per-card cap ({size(c.over_cap_copies * perCopy)}). Database {size(c.db_bytes)}
        {c.db_bytes_per_day != null ? `, growing ${size(Math.max(0, c.db_bytes_per_day))}/day` : " (growth shown once a few days are sampled)"}.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
        <Bars title="Photos downloaded per day" days={c.days} v={(d) => d.photo_bytes} fmt={size}
          tip={(d) => `${d.day}: ${size(d.photo_bytes)} · ${num(d.copies)} copies · ${size(d.photo_total)} on disk`} />
        <Bars title="New listings from the feed per day" days={c.days} v={(d) => d.new_listings} fmt={num}
          tip={(d) => `${d.day}: ${num(d.new_listings)} new listings`} />
      </div>
    </div>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-bg border border-border rounded px-3 py-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[10px] text-muted leading-tight">{label}</div>
    </div>
  );
}

// One series, one axis: bars per day, max labelled, hover tooltip per bar.
function Bars({ title, days, v, fmt, tip }: {
  title: string; days: InfraCapacityDay[]; v: (d: InfraCapacityDay) => number;
  fmt: (n: number) => string; tip: (d: InfraCapacityDay) => string;
}) {
  const [hover, setHover] = useState<InfraCapacityDay | null>(null);
  const max = Math.max(1, ...days.map(v));
  const W = 600, H = 120, n = Math.max(1, days.length), bw = W / n;
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="font-semibold">{title}</span>
        <span className="text-muted">{hover ? tip(hover) : `last ${days.length} days · peak ${fmt(max)}`}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full h-32" onMouseLeave={() => setHover(null)} role="img" aria-label={title}>
        <line x1={0} x2={W} y1={H} y2={H} className="stroke-border" strokeWidth={1} />
        <line x1={0} x2={W} y1={0} y2={0} className="stroke-border" strokeWidth={1} strokeDasharray="2 4" />
        {days.map((d, i) => {
          const h = (v(d) / max) * H;
          return (
            <g key={d.day} onMouseEnter={() => setHover(d)}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              {h > 0 && (
                <rect x={i * bw + 1} y={H - h} width={Math.max(1, bw - 2)} height={h} rx={Math.min(2, (bw - 2) / 2)}
                  className={hover?.day === d.day ? "fill-accent" : "fill-accent/70"} />
              )}
            </g>
          );
        })}
        <text x={0} y={H + 12} className="fill-muted" fontSize={10}>{days[0]?.day.slice(5)}</text>
        <text x={W} y={H + 12} textAnchor="end" className="fill-muted" fontSize={10}>{days[days.length - 1]?.day.slice(5)}</text>
      </svg>
    </div>
  );
}
