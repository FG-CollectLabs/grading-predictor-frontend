import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { CenteringAnalytics, CenteringOdds, GraderPrediction, OffCenter } from "../types";

// Grader analytics: how centering moves the odds of each grade, fitted on the
// graded copies the factory has measured (backend grade_model.go).
//   - a what-if: type a centering, get the odds per grader
//   - front L/R × T/B heatmap of the top grade's odds, with the copies seen
//   - per-axis curves, the effect of each point, and the backtest

const ERAS = ["Mega Evolution", "Scarlet & Violet", "Sword & Shield", "Sun & Moon", "XY", "Black & White", "Earlier"];
const AXES: { key: keyof OffCenter; label: string }[] = [
  { key: "front_lr", label: "Front L/R" }, { key: "front_tb", label: "Front T/B" },
  { key: "back_lr", label: "Back L/R" }, { key: "back_tb", label: "Back T/B" },
];
// validated categorical slots 1-2 (dark steps, surface #161b22)
const SERIES = ["#3987e5", "#d95926"];
// sequential blue, dark mode: near-surface step = low odds, light = high
const RAMP = ["#0d366b", "#104281", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef", "#9ec5f4", "#b7d3f6", "#cde2fb"];

const ratio = (d: number) => `${(50 + d).toFixed(d % 1 ? 1 : 0)}/${(50 - d).toFixed(d % 1 ? 1 : 0)}`;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const rampColor = (p: number) => RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.floor(p * RAMP.length)))];
const label = (grader: string, c: string) => `${grader} ${c.replace("pristine", "Pristine")}`;

export default function GraderAnalytics() {
  const [params, setParams] = useSearchParams();
  const grader = params.get("grader") ?? "PSA";
  const language = params.get("language") ?? "";
  const era = params.get("era") ?? "";
  const [data, setData] = useState<CenteringAnalytics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams({ grader });
    if (language) p.set("language", language);
    if (era) p.set("era", era);
    setLoading(true);
    setErr(null);
    api.getCenteringAnalytics(p).then(setData).catch((e: unknown) => setErr(String(e))).finally(() => setLoading(false));
  }, [grader, language, era]);

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  };
  const graders = Object.entries(data?.graders ?? { PSA: 0 }).sort((a, b) => b[1] - a[1]);

  return (
    <section className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-base font-semibold">Grader analytics · centering vs grade</h1>
        <p className="text-xs text-muted mt-1 max-w-3xl">
          How each point off-center changes the odds of each grade, learned from the graded copies the factory has measured.
          Only centering is measured: corners, edges and surface are assumed clean.
        </p>
      </div>

      <WhatIf />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">grader</span>
        {graders.map(([g, n]) => (
          <button key={g} onClick={() => set("grader", g)}
            className={`px-2 py-1 rounded border ${g === grader ? "border-accent text-accent" : "border-border text-muted hover:text-[#e6edf3]"}`}>
            {g} <span className="text-[10px] text-muted">{n.toLocaleString()}</span>
          </button>
        ))}
        <span className="text-muted ml-4">language</span>
        <select value={language} onChange={(e) => set("language", e.target.value)} className="bg-surface border border-border rounded px-1 py-0.5">
          <option value="">all</option><option value="en">English</option><option value="ja">Japanese</option>
        </select>
        <span className="text-muted ml-2">era</span>
        <select value={era} onChange={(e) => set("era", e.target.value)} className="bg-surface border border-border rounded px-1 py-0.5">
          <option value="">all</option>{ERAS.map((e) => <option key={e}>{e}</option>)}
        </select>
        {loading && <span className="text-muted">fitting…</span>}
      </div>

      {err && <div className="text-xs text-red-400">{err}</div>}
      {data?.status === "too_few" && <div className="text-xs text-yellow">{data.note}</div>}
      {data?.status === "ready" && <Fitted d={data} />}
    </section>
  );
}

// ── what-if ──────────────────────────────────────────────────────────────────

function WhatIf() {
  const [v, setV] = useState<Record<keyof OffCenter, string>>({ front_lr: "52", front_tb: "50", back_lr: "55", back_tb: "52" });
  const [cardId, setCardId] = useState("");
  const [res, setRes] = useState<CenteringOdds | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const valid = Object.values(v).every((x) => x !== "" && +x >= 0 && +x <= 100);

  useEffect(() => {
    if (!valid) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams(v);
      if (cardId.trim()) p.set("card_id", cardId.trim());
      api.getCenteringOdds(p).then((r) => { setRes(r); setErr(null); }).catch((e: unknown) => setErr(String(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [v, cardId, valid]);

  return (
    <div className="bg-surface border border-border rounded p-4 space-y-3">
      <div className="text-xs font-semibold">What are the odds? <span className="font-normal text-muted">type the left (or top) share, e.g. 55 for 55/45</span></div>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        {AXES.map((a) => (
          <label key={a.key} className="flex flex-col gap-1">
            <span className="text-muted">{a.label}</span>
            <span className="flex items-center gap-1">
              <input type="number" min={0} max={100} step={0.5} value={v[a.key]}
                onChange={(e) => setV({ ...v, [a.key]: e.target.value })}
                className="w-16 bg-bg border border-border rounded px-1 py-0.5 font-mono" aria-label={`${a.label} left or top percent`} />
              <span className="text-muted font-mono">/{v[a.key] === "" ? "" : (100 - +v[a.key]).toString()}</span>
            </span>
          </label>
        ))}
        <label className="flex flex-col gap-1">
          <span className="text-muted">card id (optional: its PSA gem rate)</span>
          <input value={cardId} onChange={(e) => setCardId(e.target.value)} placeholder="e.g. 1234"
            className="w-28 bg-bg border border-border rounded px-1 py-0.5 font-mono" />
        </label>
      </div>
      {err && <div className="text-xs text-red-400">{err}</div>}
      {res && !res.predictions?.length && <div className="text-xs text-muted">No grader has enough measured copies yet.</div>}
      <div className="grid md:grid-cols-2 gap-4">
        {res?.predictions?.map((g) => <OddsBars key={g.grader} g={g} />)}
      </div>
    </div>
  );
}

export function OddsBars({ g }: { g: GraderPrediction }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold">
        {g.grader}
        {g.centering_cap && g.centering_cap !== "10" && <span className="text-red-400 font-normal"> · centering caps it at {g.centering_cap}</span>}
      </div>
      {g.outcomes.map((o) => (
        <div key={o.grade} className="flex items-center gap-2 text-xs" title={`started from ${pct(o.prior)} at typical centering · ${o.copies} measured copies of this grade · ${o.in_bucket ?? 0} within a point of this centering`}>
          <span className="w-28">{label(g.grader, o.grade)}</span>
          <div className="flex-1 max-w-xs h-3 bg-bg rounded overflow-hidden">
            <div className="h-full rounded-r" style={{ width: `${Math.round(o.p * 100)}%`, background: SERIES[0] }} />
          </div>
          <span className="w-10 font-mono text-right">{pct(o.p)}</span>
          <span className="text-[10px] text-muted">{o.in_bucket ?? 0} seen here</span>
        </div>
      ))}
      <div className="text-[10px] text-muted">start: {g.prior_source}{g.note ? ` · ${g.note}` : ""}</div>
    </div>
  );
}

// ── the fitted model ─────────────────────────────────────────────────────────

function Fitted({ d }: { d: CenteringAnalytics }) {
  const classes = d.classes ?? [];
  const top = classes[classes.length - 1];
  const bt = d.backtest;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="measured copies" value={(d.n ?? 0).toLocaleString()} sub={`${(d.validated ?? 0).toLocaleString()} validated by a person`} />
        <Tile label="grades modelled" value={classes.map((c) => c.replace(" pristine", " P")).join(" · ")}
          sub={classes.map((c) => `${c}: ${d.counts?.[c] ?? 0}`).join(" · ")} />
        <Tile label={`backtest AUC (${top})`} value={bt ? bt.auc_top.toFixed(2) : "—"} sub="0.5 = centering says nothing · 1 = perfect" />
        <Tile label="backtest log loss" value={bt ? bt.log_loss.toFixed(3) : "—"} sub={bt ? `vs ${bt.baseline_log_loss.toFixed(3)} guessing the mix (lower is better)` : "not enough copies"} />
      </div>
      <Heatmap d={d} />
      <div className="grid md:grid-cols-2 gap-6">
        <Curves d={d} axes={["front_lr", "front_tb"]} title="Front" max={15} />
        <Curves d={d} axes={["back_lr", "back_tb"]} title="Back" max={30} />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Effects d={d} />
        {bt && <ReliabilityTable bt={bt} top={label(d.grader, top)} />}
      </div>
      <ul className="text-[10px] text-muted list-disc pl-4 space-y-0.5">{d.notes?.map((n) => <li key={n}>{n}</li>)}</ul>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-surface border border-border rounded p-3">
      <div className="text-[10px] text-muted">{label}</div>
      <div className="text-lg font-semibold font-mono mt-0.5">{value}</div>
      <div className="text-[10px] text-muted mt-0.5">{sub}</div>
    </div>
  );
}

function Heatmap({ d }: { d: CenteringAnalytics }) {
  const g = d.grid!;
  const classes = d.classes ?? [];
  const K = classes.length;
  const top = classes[K - 1];
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const cell = 26;
  const n = g.max + 1;
  const pad = { l: 56, t: 8, b: 40 };
  const W = pad.l + n * cell + 8, H = pad.t + n * cell + pad.b;
  const h = hover ? g.cells[hover.y][hover.x] : null;
  return (
    <div className="bg-surface border border-border rounded p-4">
      <div className="text-xs font-semibold">Odds of {label(d.grader, top)} by front centering</div>
      <div className="text-[10px] text-muted mb-2">
        listing scale · back held at {ratio(g.back_off_center.lr)} L/R, {ratio(g.back_off_center.tb)} T/B · dot = 5+ copies observed in that cell (the rest is the model filling in)
      </div>
      <div className="flex flex-wrap gap-4 items-start">
        <svg width={W} height={H} role="img" aria-label={`Heatmap of ${top} odds over front left/right and top/bottom centering`} onMouseLeave={() => setHover(null)}>
          {g.cells.map((row, y) => row.map((c, x) => {
            const obs = Object.values(c.observed).reduce((a, b) => a + b, 0);
            return (
              <g key={`${x}-${y}`} onMouseEnter={() => setHover({ x, y })}>
                <rect x={pad.l + x * cell + 1} y={pad.t + y * cell + 1} width={cell - 2} height={cell - 2} rx={3}
                  fill={rampColor(c.p[K - 1])} stroke={hover?.x === x && hover?.y === y ? "#e6edf3" : "none"} strokeWidth={1.5} />
                {obs >= 5 && <circle cx={pad.l + x * cell + cell / 2} cy={pad.t + y * cell + cell / 2} r={2.5} fill={c.p[K - 1] < 0.45 ? "#e6edf3" : "#0d1117"} />}
              </g>
            );
          }))}
          {Array.from({ length: n }, (_, i) => i).filter((i) => i % 5 === 0).map((i) => (
            <g key={i} className="fill-[#8b949e]" fontSize={10}>
              <text x={pad.l + i * cell + cell / 2} y={pad.t + n * cell + 14} textAnchor="middle">{ratio(i)}</text>
              <text x={pad.l - 6} y={pad.t + i * cell + cell / 2 + 3} textAnchor="end">{ratio(i)}</text>
            </g>
          ))}
          <text x={pad.l + (n * cell) / 2} y={H - 4} textAnchor="middle" fontSize={10} className="fill-[#8b949e]">front left/right →</text>
        </svg>
        <div className="space-y-3 text-xs min-w-56">
          <div>
            <div className="text-[10px] text-muted mb-1">{top} odds</div>
            <div className="flex">{RAMP.map((c) => <div key={c} className="w-4 h-3" style={{ background: c }} />)}</div>
            <div className="flex justify-between text-[10px] text-muted w-[208px]"><span>0%</span><span>100%</span></div>
            <div className="text-[10px] text-muted mt-1">rows: front top/bottom ↓</div>
          </div>
          {h && hover ? (
            <div className="border border-border rounded p-2 space-y-1">
              <div className="font-semibold">front {ratio(hover.x)} L/R · {ratio(hover.y)} T/B</div>
              {classes.map((c, i) => ({ c, p: h.p[i] })).reverse().map(({ c, p }) => (
                <div key={c} className="flex justify-between gap-4"><span>{label(d.grader, c)}</span><span className="font-mono">{pct(p)}</span></div>
              ))}
              <div className="text-[10px] text-muted pt-1 border-t border-border">
                observed here: {Object.keys(h.observed).length ? classes.slice().reverse().map((c) => `${h.observed[c] ?? 0} × ${c}`).join(" · ") : "none"}
              </div>
            </div>
          ) : <div className="text-[10px] text-muted">hover a cell for every grade's odds and the copies seen there</div>}
        </div>
      </div>
    </div>
  );
}

function Curves({ d, axes, title, max }: { d: CenteringAnalytics; axes: (keyof OffCenter)[]; title: string; max: number }) {
  const classes = d.classes ?? [];
  const K = classes.length;
  const top = classes[K - 1];
  const [hx, setHx] = useState<number | null>(null);
  const W = 420, H = 220, pad = { l: 40, r: 70, t: 10, b: 30 };
  const sx = (x: number) => pad.l + (x / max) * (W - pad.l - pad.r);
  const sy = (p: number) => pad.t + (1 - p) * (H - pad.t - pad.b);
  const series = useMemo(() => axes.map((a) => (d.curves?.[a] ?? []).filter((r) => r[0] <= max).map((r) => [r[0], r[K]] as [number, number])), [d, axes, max, K]);
  const at = (s: [number, number][], x: number) => s.reduce((best, r) => (Math.abs(r[0] - x) < Math.abs(best[0] - x) ? r : best), s[0]);
  const names = axes.map((a) => AXES.find((x) => x.key === a)!.label);
  // line-end labels, pushed apart when the lines end close together
  const endY = useMemo(() => {
    const ys = series.map((s, i) => ({ i, y: s.length ? sy(s[s.length - 1][1]) + 3 : 0 })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ys.length; k++) if (ys[k].y - ys[k - 1].y < 12) ys[k].y = ys[k - 1].y + 12;
    const over = ys.length ? ys[ys.length - 1].y - (sy(0) - 4) : 0; // keep clear of the x-axis labels
    if (over > 0) ys.forEach((v) => { v.y -= over; });
    const out: number[] = [];
    ys.forEach(({ i, y }) => { out[i] = y; });
    return out;
  }, [series]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="bg-surface border border-border rounded p-4">
      <div className="text-xs font-semibold">{title}: odds of {label(d.grader, top)} as one axis moves</div>
      <div className="text-[10px] text-muted mb-1">other axes held at the dataset's median · listing scale</div>
      <div className="flex gap-3 text-[10px] text-muted mb-1">
        {names.map((n, i) => <span key={n} className="flex items-center gap-1"><span className="inline-block w-3 h-0.5" style={{ background: SERIES[i] }} />{n}</span>)}
      </div>
      <svg width={W} height={H} role="img" aria-label={`${title} centering curves`}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - r.left - pad.l) / (W - pad.l - pad.r)) * max;
          setHx(x < 0 || x > max ? null : Math.round(x * 2) / 2);
        }}
        onMouseLeave={() => setHx(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(p)} y2={sy(p)} stroke="#30363d" strokeWidth={0.5} />
            <text x={pad.l - 6} y={sy(p) + 3} textAnchor="end" fontSize={10} className="fill-[#8b949e]">{pct(p)}</text>
          </g>
        ))}
        {Array.from({ length: max / 5 + 1 }, (_, i) => i * 5).map((x) => (
          <text key={x} x={sx(x)} y={H - 12} textAnchor="middle" fontSize={10} className="fill-[#8b949e]">{ratio(x)}</text>
        ))}
        {series.map((s, i) => (
          <g key={i}>
            <polyline fill="none" stroke={SERIES[i]} strokeWidth={2} points={s.map(([x, p]) => `${sx(x)},${sy(p)}`).join(" ")} />
            {s.length > 0 && <text x={sx(s[s.length - 1][0]) + 4} y={endY[i]} fontSize={10} className="fill-[#e6edf3]">{names[i]}</text>}
          </g>
        ))}
        {hx != null && (
          <g>
            <line x1={sx(hx)} x2={sx(hx)} y1={pad.t} y2={H - pad.b} stroke="#8b949e" strokeWidth={1} strokeDasharray="3 3" />
            {series.map((s, i) => { const r = at(s, hx); return r && <circle key={i} cx={sx(r[0])} cy={sy(r[1])} r={4} fill={SERIES[i]} stroke="#161b22" strokeWidth={2} />; })}
          </g>
        )}
      </svg>
      <div className="text-[10px] h-4 font-mono">
        {hx != null && <>at {ratio(hx)}: {series.map((s, i) => `${names[i]} ${pct(at(s, hx)?.[1] ?? 0)}`).join(" · ")}</>}
      </div>
    </div>
  );
}

function Effects({ d }: { d: CenteringAnalytics }) {
  const top = d.classes?.[d.classes.length - 1] ?? "";
  const fmt = (m: number) => (m >= 1 ? `×${m.toFixed(2)}` : `×${m.toFixed(2)} (${Math.round((1 - m) * 100)}% lower)`);
  return (
    <div className="bg-surface border border-border rounded p-4 text-xs">
      <div className="font-semibold">What one more point off-center does</div>
      <div className="text-[10px] text-muted mb-2">odds multiplier on reaching {label(d.grader, top)} (front knee 55/45, back knee 65/35)</div>
      <table className="w-full">
        <thead className="text-[10px] text-muted"><tr><th className="text-left font-normal">axis</th><th className="text-right font-normal">before the knee</th><th className="text-right font-normal">past the knee</th></tr></thead>
        <tbody>
          {AXES.map((a) => {
            const e = d.effects?.[a.key];
            return e && (
              <tr key={a.key} className="border-t border-border">
                <td className="py-1">{a.label}</td>
                <td className="text-right font-mono">{fmt(e.per_point_before_knee)}</td>
                <td className="text-right font-mono">{fmt(e.per_point_past_knee)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReliabilityTable({ bt, top }: { bt: NonNullable<CenteringAnalytics["backtest"]>; top: string }) {
  return (
    <div className="bg-surface border border-border rounded p-4 text-xs">
      <div className="font-semibold">Backtest: does a predicted {pct(0.5)} come true half the time?</div>
      <div className="text-[10px] text-muted mb-2">{bt.explanation} {bt.n.toLocaleString()} held-out copies, {bt.folds} folds.</div>
      <table className="w-full">
        <thead className="text-[10px] text-muted"><tr><th className="text-left font-normal">tenth of copies</th><th className="text-right font-normal">predicted {top}</th><th className="text-right font-normal">actually {top}</th><th className="text-right font-normal">copies</th></tr></thead>
        <tbody>
          {bt.reliability.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-0.5">{i + 1}</td>
              <td className="text-right font-mono">{pct(r.predicted)}</td>
              <td className="text-right font-mono">{pct(r.actual)}</td>
              <td className="text-right font-mono text-muted">{r.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
