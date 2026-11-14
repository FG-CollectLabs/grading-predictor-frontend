import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { GraderReport, ReportCurve, ReportIssue, ReportSet, ReportThesis } from "../types";

// Grader reports: written-up analytics per set (and rarity tier), for rules
// of thumb next to the dynamic filters (backend reports.go). In-print English
// Pokémon sets since Stellar Crown; one report pools all of them.

// validated categorical slots 1-2 (dark steps, surface #161b22), as on Grader analytics
const SERIES = ["#3987e5", "#d95926"];
const MUTED = "#8b949e";
const GRID = "#30363d";
const pct = (p: number) => `${Math.round(p * 100)}%`;
const ratio = (d: number) => `${(50 + d).toFixed(d % 1 ? 1 : 0)}/${(50 - d).toFixed(d % 1 ? 1 : 0)}`;
const CHASE = ["Illustration Rare", "Special Illustration Rare", "Ultra Rare", "Mega Hyper Rare", "Hyper Rare"];

export function GraderReportsIndex() {
  const [params, setParams] = useSearchParams();
  const grader = params.get("grader") ?? "PSA";
  const [sets, setSets] = useState<ReportSet[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setSets(null);
    api.reportSets(grader).then((r) => setSets(r.sets)).catch((e) => setErr(String(e.message ?? e)));
  }, [grader]);
  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <div className="text-xs text-muted"><Link to="/grader-analytics" className="hover:text-accent">grader analytics</Link> / reports</div>
        <h1 className="text-lg font-semibold mt-1">Grader reports</h1>
        <p className="text-muted text-xs mt-1 max-w-3xl">
          Written-up findings per set, for rules of thumb: where graders start to ding front and back centering, whether a copy
          a point or two off 50/50 really tens less than a perfect one, and what the 9s have that the 10s don't. English sets
          still in print (since Stellar Crown). Pick a rarity inside a report.
        </p>
        <label className="text-xs text-muted mt-2 inline-block">grader{" "}
          <select value={grader} onChange={(e) => setParams({ grader: e.target.value })} className="bg-surface border border-border rounded px-1">
            {["PSA", "CGC", "BGS"].map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
      </div>
      <Link to={`/grader-analytics/reports/in-print?grader=${grader}`}
        className="block border border-accent/40 rounded-md p-3 hover:bg-accent/5">
        <div className="font-semibold text-sm">All in-print sets, pooled</div>
        <div className="text-xs text-muted">The most copies: the best test of the near-centre thesis and the ding points.</div>
      </Link>
      {err && <div className="text-red-400 text-xs">{err}</div>}
      {!sets ? <div className="text-muted text-xs">loading…</div> : (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {sets.map((s) => {
            const chase = CHASE.filter((r) => s.rarities[r]).map((r) => `${r.replace("Special Illustration Rare", "SIR").replace("Illustration Rare", "IR")} ${s.rarities[r]}`);
            return (
              <Link key={s.set_code} to={`/grader-analytics/reports/${s.set_code}?grader=${grader}`}
                className="border border-border rounded-md p-3 hover:border-accent/50 text-xs">
                <div className="font-semibold text-sm">{s.set_name}</div>
                <div className="text-muted">{s.set_code} · {s.release_date.slice(0, 10)} · {s.copies.toLocaleString()} measured {grader} copies</div>
                {chase.length > 0 && <div className="text-muted mt-1">{chase.join(" · ")}</div>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GraderReportPage() {
  const { scope = "in-print" } = useParams();
  const [params, setParams] = useSearchParams();
  const grader = params.get("grader") ?? "PSA";
  const rarity = params.get("rarity") ?? "";
  const [r, setR] = useState<GraderReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setR(null);
    setErr(null);
    api.getReport(scope, grader, rarity).then(setR).catch((e) => setErr(String(e.message ?? e)));
  }, [scope, grader, rarity]);
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p); };
  return (
    <article className="space-y-6 max-w-4xl">
      <div>
        <div className="text-xs text-muted">
          <Link to="/grader-analytics" className="hover:text-accent">grader analytics</Link> / <Link to={`/grader-analytics/reports?grader=${grader}`} className="hover:text-accent">reports</Link>
        </div>
        <h1 className="text-xl font-semibold mt-1">{r?.title ?? scope} · {grader}{rarity ? ` · ${rarity}` : ""}</h1>
        <div className="flex flex-wrap gap-1 mt-2 text-xs">
          {["", ...(r?.rarities ?? [])].map((t) => (
            <button key={t || "all"} onClick={() => set("rarity", t)}
              className={`px-2 py-0.5 rounded border ${rarity === t ? "border-accent text-accent" : "border-border text-muted"}`}>{t || "all rarities"}</button>
          ))}
        </div>
      </div>
      {err && <div className="text-red-400 text-xs">{err}</div>}
      {!r && !err && <div className="text-muted text-xs">building the report…</div>}
      {r && r.copies === 0 && <div className="text-muted text-sm">No measured {grader} copies here{rarity ? ` for ${rarity}` : ""}.</div>}
      {r && r.copies > 0 && <ReportBody r={r} />}
    </article>
  );
}

function ReportBody({ r }: { r: GraderReport }) {
  return (
    <>
      <section className="bg-surface border border-border rounded-md p-4 space-y-2">
        <div className="text-xs text-muted">
          {r.copies.toLocaleString()} measured copies · {r.top_copies.toLocaleString()} {r.grader} {r.top_grade} ({pct(r.top_copies / r.copies)} of the listings) ·
          {" "}{r.reviewed.toLocaleString()} with both sides checked by a person · measuring error ±{r.median_err_pp} pts
        </div>
        <h2 className="text-sm font-semibold">Key findings</h2>
        <ul className="list-disc ml-5 space-y-1 text-sm leading-relaxed">{r.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Where graders start to ding centering</h2>
        <p className="text-sm text-muted leading-relaxed">
          Each point is the share of {r.grader} {r.top_grade}s among copies whose worse axis on that side is that far off 50/50
          (0.5-point steps), with its 95% range. The dashed line is the <b>ding point</b>: the best fit of a model where the odds
          stay flat up to some distance and fall after it; the shaded strip is its uncertainty.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {r.curves.map((c) => <CurveChart key={c.axis} c={c} top={`${r.grader} ${r.top_grade}`} />)}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Can graders tell 50/50 from 51.5/48.5?</h2>
        <p className="text-sm text-muted leading-relaxed">
          The thesis: inside roughly 48.5–52.5 the odds don't change, because the eye can't tell that little off-centre from
          perfect. Tested by comparing copies within 1 point of 50/50 (49/51 or better) with copies 1–2.5 points off. "Smallest
          detectable gap" is what this many copies could reliably show; a gap smaller than that would go unseen.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <ThesisCard t={r.thesis.front} title="Front" />
          <ThesisCard t={r.thesis.back} title="Back" />
          <ThesisCard t={r.thesis.front_reviewed_only} title="Front, person-checked measurements only" />
        </div>
        <p className="text-xs text-muted">
          Our measuring error is about ±{r.median_err_pp} points, the same size as the zone in question: the person-checked
          column is the cleaner test, and the in-print pooled report has the most copies.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">What the 9s have</h2>
        {r.causes.length > 0 && <CauseBar causes={r.causes} />}
        {r.issues && r.issues.length > 0 ? (
          <>
            <p className="text-sm text-muted leading-relaxed">
              From the corner and edge check on {r.checked[0]} checked 9s and {r.checked[1]} checked 10s: how often each issue
              shows up. The issues the 9s carry far more often than the 10s are the ones to look for on this set.
            </p>
            <IssueBars rows={r.issues} />
            {r.where && r.where.length > 0 && <IssueBars rows={r.where} />}
          </>
        ) : <p className="text-sm text-muted">No corner / edge checks on these copies yet.</p>}
        {r.subgrade_n > 0 && r.subgrades && (
          <p className="text-sm text-muted">
            Lowest subgrade on {r.subgrade_n} below-top copies with subgrades on the label (BGS / CGC):{" "}
            {r.subgrades.filter((s) => s.n > 0).map((s) => `${s.label} ${pct(s.share)}`).join(" · ")}.
          </p>
        )}
      </section>

      {r.cards && r.cards.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Card by card</h2>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead className="text-muted text-left">
                <tr><th className="py-1">card</th><th>rarity</th><th className="text-right">copies</th><th className="text-right">{r.top_grade}s</th>
                  <th className="text-right">share</th><th className="text-right">10s: front</th><th className="text-right">back</th><th className="pl-3">most common 9 issue</th></tr>
              </thead>
              <tbody>
                {r.cards.slice(0, 60).map((c) => (
                  <tr key={c.card_id} className="border-t border-border">
                    <td className="py-1"><Link to={`/grader-analytics?card_id=${c.card_id}`} className="hover:text-accent">{c.name} <span className="text-muted">{c.number}</span></Link></td>
                    <td className="text-muted">{c.rarity}</td>
                    <td className="text-right">{c.n}</td><td className="text-right">{c.top}</td><td className="text-right">{pct(c.p)}</td>
                    <td className="text-right" title="median of the 10s' worse front axis">{c.top ? ratio(c.front_median) : "–"}</td>
                    <td className="text-right">{c.top ? ratio(c.back_median) : "–"}</td>
                    <td className="pl-3 text-muted">{c.top_9_issue ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold">How to read this</h2>
        <ul className="list-disc ml-5 text-xs text-muted space-y-1 mt-1">{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        <div className="text-[11px] text-muted mt-2">generated {new Date(r.generated_at).toLocaleString()}</div>
      </section>
    </>
  );
}

function CurveChart({ c, top }: { c: ReportCurve; top: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 420, H = 230, L = 40, R = 10, T = 12, B = 34;
  const maxX = Math.max(5, ...c.bins.filter((b) => b.n > 0).map((b) => b.to));
  const x = (v: number) => L + (v / maxX) * (W - L - R);
  const y = (p: number) => T + (1 - p) * (H - T - B);
  const pts = c.bins.filter((b) => b.n > 0);
  const mid = (b: { from: number; to: number }) => (b.from + b.to) / 2;
  const band = pts.map((b) => `${x(mid(b))},${y(b.hi)}`).join(" ") + " " + [...pts].reverse().map((b) => `${x(mid(b))},${y(b.lo)}`).join(" ");
  const d = c.ding;
  const hb = hover != null ? pts[hover] : null;
  return (
    <figure className="bg-surface border border-border rounded-md p-3">
      <figcaption className="text-sm font-semibold capitalize">{c.axis}: {top} share vs centering</figcaption>
      <div className="text-[11px] text-muted mb-1">{c.note}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}><line x1={L} x2={W - R} y1={y(p)} y2={y(p)} stroke={GRID} strokeWidth={1} />
            <text x={L - 6} y={y(p) + 4} textAnchor="end" fontSize={10} fill={MUTED}>{pct(p)}</text></g>
        ))}
        {Array.from({ length: Math.floor(maxX / 2.5) + 1 }, (_, i) => i * 2.5).map((v) => (
          <text key={v} x={x(v)} y={H - B + 14} textAnchor="middle" fontSize={10} fill={MUTED}>{ratio(v)}</text>
        ))}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fontSize={10} fill={MUTED}>worse axis (points off 50/50)</text>
        {d && !d.note && <rect x={x(d.lo)} y={T} width={Math.max(1, x(d.hi) - x(d.lo))} height={H - T - B} fill={SERIES[1]} opacity={0.12} />}
        {d && !d.note && <line x1={x(d.k)} x2={x(d.k)} y1={T} y2={H - B} stroke={SERIES[1]} strokeWidth={1.5} strokeDasharray="4 3" />}
        <polygon points={band} fill={SERIES[0]} opacity={0.15} />
        <polyline points={pts.map((b) => `${x(mid(b))},${y(b.p)}`).join(" ")} fill="none" stroke={SERIES[0]} strokeWidth={2} />
        {pts.map((b, i) => (
          <g key={i}>
            <circle cx={x(mid(b))} cy={y(b.p)} r={b.sparse ? 3 : 4} fill={b.sparse ? "#161b22" : SERIES[0]} stroke={SERIES[0]} strokeWidth={1.5} />
            <rect x={x(b.from)} y={T} width={x(b.to) - x(b.from)} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        ))}
        {hb && <line x1={x(mid(hb))} x2={x(mid(hb))} y1={T} y2={H - B} stroke={MUTED} strokeWidth={1} />}
      </svg>
      <div className="text-xs min-h-[1.25rem]">
        {hb ? <span>{ratio(hb.from)}–{ratio(hb.to)}: <b>{pct(hb.p)}</b> ({hb.top} of {hb.n}), 95% {pct(hb.lo)}–{pct(hb.hi)}{hb.sparse ? " · few copies" : ""}</span>
          : d ? (d.note ? <span className="text-muted">{d.note}</span>
            : <span>ding point <b>{d.ratio}</b> ({d.k} pts, 95% {d.lo}–{d.hi}) · flat at {pct(d.plateau)}, −{pct(d.drop_per_pt)} per point after</span>)
            : <span className="text-muted">too few copies for a ding point</span>}
      </div>
    </figure>
  );
}

function ThesisCard({ t, title }: { t: ReportThesis; title: string }) {
  const v = { indistinguishable: ["text-green", "no detectable difference"], core_better: ["text-yellow", "50/50 tens more: thesis rejected"],
    near_better: ["text-muted", "slightly-off tens more (noise?)"], too_little_data: ["text-muted", "too few copies"] }[t.verdict] ?? ["text-muted", t.verdict];
  return (
    <div className="bg-surface border border-border rounded-md p-3 text-xs space-y-1">
      <div className="font-semibold text-sm">{title}</div>
      <div className={v[0]}>{v[1]}</div>
      {t.verdict !== "too_little_data" && (
        <>
          <div>within 49/51: <b>{pct(t.core_p)}</b> <span className="text-muted">({t.core_n})</span></div>
          <div>1–2.5 off: <b>{pct(t.near_p)}</b> <span className="text-muted">({t.near_n})</span></div>
          <div className="text-muted">gap {(100 * t.diff).toFixed(1)} pts, 95% {(100 * t.diff_lo).toFixed(1)} to {(100 * t.diff_hi).toFixed(1)}</div>
          <div className="text-muted">smallest detectable gap ~{(100 * t.detectable).toFixed(0)} pts</div>
        </>
      )}
    </div>
  );
}

function CauseBar({ causes }: { causes: GraderReport["causes"] }) {
  const shown = causes.filter((c) => c.share > 0);
  const tones = ["#3987e5", "#2a78d6", "#d95926", "#a6481f", "#8b949e", "#484f58"];
  const order = ["centering", "corners", "edges", "corners_edges", "unseen", "unchecked"];
  return (
    <div className="space-y-1">
      <div className="text-sm">Why the 9s missed, as far as we can see:</div>
      <div className="flex h-5 rounded overflow-hidden gap-[2px] bg-[#161b22]">
        {order.map((k) => shown.find((c) => c.key === k)).filter(Boolean).map((c) => (
          <div key={c!.key} title={`${c!.label}: ${pct(c!.share)} (${c!.n})`} style={{ width: `${100 * c!.share}%`, background: tones[order.indexOf(c!.key)] }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {order.map((k) => shown.find((c) => c.key === k)).filter(Boolean).map((c) => (
          <span key={c!.key} className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: tones[order.indexOf(c!.key)] }} />
            {c!.label} <span className="text-[#e6edf3]">{pct(c!.share)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function IssueBars({ rows }: { rows: ReportIssue[] }) {
  const max = Math.max(0.05, ...rows.map((r) => Math.max(r.in_9, r.in_10)));
  return (
    <div className="space-y-1.5">
      <div className="flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: SERIES[1] }} />9s</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: SERIES[0] }} />10s</span>
      </div>
      {rows.map((r) => (
        <div key={r.key} className="grid items-center gap-2 text-xs" style={{ gridTemplateColumns: "11rem 1fr 6rem" }}
          title={`${r.label}: ${pct(r.in_9)} of checked 9s (${r.n9}) vs ${pct(r.in_10)} of 10s`}>
          <span className="truncate">{r.label}</span>
          <span className="space-y-[2px]">
            <span className="block h-2 rounded-r" style={{ width: `${(100 * r.in_9) / max}%`, background: SERIES[1], minWidth: r.in_9 ? 2 : 0 }} />
            <span className="block h-2 rounded-r" style={{ width: `${(100 * r.in_10) / max}%`, background: SERIES[0], minWidth: r.in_10 ? 2 : 0 }} />
          </span>
          <span className="text-muted text-right">{pct(r.in_9)} vs {pct(r.in_10)}{r.lift >= 1.5 && r.in_10 > 0 ? ` · ${r.lift}×` : ""}</span>
        </div>
      ))}
    </div>
  );
}
