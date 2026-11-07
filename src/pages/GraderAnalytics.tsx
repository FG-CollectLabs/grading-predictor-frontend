import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { CardHit, CardView, CenteringAnalytics, CenteringOdds, GraderPrediction, ObservedBin, OffCenter, SetSummary } from "../types";

// Grader analytics: how centering moves the odds of each grade, fitted on the
// graded copies the factory has measured (backend grade_model.go).
//   - filters: grader, language, era, set, one card
//   - a what-if: type a centering (and pick a card), get the odds per grader
//   - one card: its grades, its measured copies, why its copies missed a 10
//   - front L/R × T/B heatmap, per-axis curves with the raw evidence, where
//     graders start noticing, and the backtest

const ERAS = ["Mega Evolution", "Scarlet & Violet", "Sword & Shield", "Sun & Moon", "XY", "Black & White", "Earlier"];
const AXES: { key: keyof OffCenter; label: string }[] = [
  { key: "front_lr", label: "Front L/R" }, { key: "front_tb", label: "Front T/B" },
  { key: "back_lr", label: "Back L/R" }, { key: "back_tb", label: "Back T/B" },
];
// validated categorical slots 1-2 (dark steps, surface #161b22)
const SERIES = ["#3987e5", "#d95926"];
// sequential blue, dark mode: near-surface step = low odds, light = high
const RAMP = ["#0d366b", "#104281", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef", "#9ec5f4", "#b7d3f6", "#cde2fb"];
const MUTED = "#8b949e";

const ratio = (d: number) => `${(50 + d).toFixed(d % 1 ? 1 : 0)}/${(50 - d).toFixed(d % 1 ? 1 : 0)}`;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const rampColor = (p: number) => RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.floor(p * RAMP.length)))];
const label = (grader: string, c: string) => `${grader} ${c.replace("pristine", "Pristine")}`;
const gradeKey = (c: string) => parseFloat(c) + (c.includes("pristine") ? 0.2 : 0) + (c.includes("black") || c.includes("flawless") ? 0.3 : 0);

export default function GraderAnalytics() {
  const [params, setParams] = useSearchParams();
  const grader = params.get("grader") ?? "PSA";
  const language = params.get("language") ?? "";
  const era = params.get("era") ?? "";
  const setCode = params.get("set_code") ?? "";
  const cardId = params.get("card_id") ?? "";
  const [data, setData] = useState<CenteringAnalytics | null>(null);
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams({ grader });
    if (language) p.set("language", language);
    if (era) p.set("era", era);
    if (setCode) p.set("set_code", setCode);
    if (cardId) p.set("card_id", cardId);
    setLoading(true);
    setErr(null);
    api.getCenteringAnalytics(p).then(setData).catch((e: unknown) => setErr(String(e))).finally(() => setLoading(false));
  }, [grader, language, era, setCode, cardId]);

  useEffect(() => {
    api.getSets(language).then((r) => setSets(r.sets ?? [])).catch(() => setSets([]));
  }, [language]);

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  };
  const graders = Object.entries(data?.graders ?? { PSA: 0 }).filter(([, n]) => n >= 20).sort((a, b) => b[1] - a[1]);
  const setsShown = sets.filter((s) => !era || s.era === era).sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""));

  return (
    <section className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-base font-semibold">Grader analytics · centering vs grade</h1>
        <p className="text-xs text-muted mt-1 max-w-3xl">
          How each point off-center changes the odds of each grade, learned from the graded copies the factory has measured.
          Only centering is measured so far: corners, edges and surface are assumed clean.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">grader</span>
        {graders.map(([g, n]) => (
          <button key={g} onClick={() => set("grader", g)}
            className={`px-2 py-1 rounded border ${g === grader ? "border-accent text-accent" : "border-border text-muted hover:text-[#e6edf3]"}`}>
            {g} <span className="text-[10px] text-muted">{n.toLocaleString()}</span>
          </button>
        ))}
        <span className="text-muted ml-3">language</span>
        <select value={language} onChange={(e) => set("language", e.target.value)} className="bg-surface border border-border rounded px-1 py-0.5">
          <option value="">all</option><option value="en">English</option><option value="ja">Japanese</option>
        </select>
        <span className="text-muted ml-2">era</span>
        <select value={era} onChange={(e) => set("era", e.target.value)} className="bg-surface border border-border rounded px-1 py-0.5">
          <option value="">all</option>{ERAS.map((e) => <option key={e}>{e}</option>)}
        </select>
        <span className="text-muted ml-2">set</span>
        <select value={setCode} onChange={(e) => set("set_code", e.target.value)} className="bg-surface border border-border rounded px-1 py-0.5 max-w-48">
          <option value="">all</option>
          {setsShown.map((s) => <option key={`${s.set_code}-${s.language}`} value={s.set_code}>{s.set_name}{language ? "" : ` (${s.language})`}</option>)}
        </select>
        <span className="text-muted ml-2">card</span>
        <CardPicker cardId={cardId} name={data?.card ? `${data.card.card.card_name} ${data.card.card.card_number} · ${data.card.card.set_name}` : ""}
          onPick={(id) => set("card_id", id ? String(id) : "")} />
        {loading && <span className="text-muted">fitting…</span>}
      </div>

      <WhatIf cardId={cardId} cardName={data?.card?.card.card_name} />

      {err && <div className="text-xs text-red-400">{err}</div>}
      {data?.card && <CardSection v={data.card} grader={grader} classes={data.classes ?? []} />}
      {data?.status === "too_few" && <div className="text-xs text-yellow">{data.note}</div>}
      {data?.status === "ready" && <Fitted d={data} />}
    </section>
  );
}

// ── card picker ──────────────────────────────────────────────────────────────

function CardPicker({ cardId, name, onPick }: { cardId: string; name: string; onPick: (id: number | null) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CardHit[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => { api.searchCards(q).then((r) => setHits(r.cards)).catch(() => setHits([])); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  if (cardId) {
    return (
      <span className="flex items-center gap-1 border border-accent text-accent rounded px-2 py-0.5">
        {name || `card ${cardId}`}
        <button onClick={() => onPick(null)} className="text-muted hover:text-[#e6edf3]" aria-label="clear card">×</button>
      </span>
    );
  }
  return (
    <span className="relative">
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="search, e.g. clefairy 094" className="w-56 bg-surface border border-border rounded px-1 py-0.5" />
      {open && hits.length > 0 && (
        <div className="absolute z-20 mt-1 w-96 max-h-80 overflow-auto bg-surface border border-border rounded shadow-lg">
          {hits.map((c) => (
            <button key={c.id} onMouseDown={() => { onPick(c.id); setQ(""); }}
              className="w-full flex items-center gap-2 px-2 py-1 text-left hover:bg-bg">
              {c.image_url ? <img src={c.image_url} alt="" className="w-6 h-8 object-contain" /> : <span className="w-6" />}
              <span className="flex-1">{c.card_name} <span className="text-muted">{c.card_number} · {c.set_name} ({c.language})</span></span>
              <span className="text-[10px] text-muted">{c.measured} measured</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// ── what-if ──────────────────────────────────────────────────────────────────

function WhatIf({ cardId, cardName }: { cardId: string; cardName?: string }) {
  const [v, setV] = useState<Record<keyof OffCenter, string>>({ front_lr: "52", front_tb: "50", back_lr: "55", back_tb: "52" });
  // worst corner off-round per side (mm); null = not known (counts as average)
  const [corner, setCorner] = useState<{ front: number | null; back: number | null }>({ front: null, back: null });
  const [res, setRes] = useState<CenteringOdds | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const valid = Object.values(v).every((x) => x !== "" && +x >= 0 && +x <= 100);

  useEffect(() => {
    if (!valid) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams(v);
      if (cardId) p.set("card_id", cardId);
      if (corner.front != null) p.set("front_corner_offround", String(corner.front));
      if (corner.back != null) p.set("back_corner_offround", String(corner.back));
      api.getCenteringOdds(p).then((r) => { setRes(r); setErr(null); }).catch((e: unknown) => setErr(String(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [v, cardId, valid, corner]);

  return (
    <div className="bg-surface border border-border rounded p-4 space-y-3">
      <div className="text-xs font-semibold">
        What are the odds{cardName ? <> for this <span className="text-accent">{cardName}</span></> : ""}?{" "}
        <span className="font-normal text-muted">slide each axis to the centering you see{cardName ? "" : " · pick a card above to use how that card grades"}</span>
      </div>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        {AXES.map((a, i) => {
          const val = v[a.key] === "" ? 50 : +v[a.key];
          const lim = i < 2 ? 15 : 30;            // front 65/35 .. 35/65, back 80/20 .. 20/80
          return (
            <label key={a.key} className="flex flex-col gap-1 w-56">
              <span className="flex justify-between">
                <span className="text-muted">{a.label}</span>
                <span className="font-mono">{+val.toFixed(1)}/{+(100 - val).toFixed(1)}</span>
              </span>
              <input type="range" min={50 - lim} max={50 + lim} step={0.5} value={val}
                onChange={(e) => setV({ ...v, [a.key]: e.target.value })}
                aria-label={`${a.label}: left or top share`} />
              <span className="flex justify-between text-[9px] text-muted font-mono">
                <span>{50 - lim}/{50 + lim}</span><span>50/50</span><span>{50 + lim}/{50 - lim}</span>
              </span>
            </label>
          );
        })}
        {(["front", "back"] as const).map((side) => (
          <label key={side} className="flex flex-col gap-1 w-56">
            <span className="flex justify-between">
              <span className="text-muted">{side === "front" ? "Front" : "Back"} worst corner</span>
              <span className="font-mono">
                {corner[side] == null ? "not known" : `${Math.round(corner[side]! * 1000)} µm off-round`}
                {corner[side] != null && <button className="ml-1 text-muted hover:text-accent" onClick={(e) => { e.preventDefault(); setCorner({ ...corner, [side]: null }); }}>×</button>}
              </span>
            </span>
            <input type="range" min={0} max={0.4} step={0.01} value={corner[side] ?? 0.1}
              onChange={(e) => setCorner({ ...corner, [side]: +e.target.value })}
              aria-label={`${side} worst corner off-round in mm`} />
            <span className="flex justify-between text-[9px] text-muted font-mono"><span>clean cut</span><span>0.2 mm</span><span>0.4 mm</span></span>
          </label>
        ))}
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
        <div key={o.grade} className="flex items-center gap-2 text-xs" title={`starts from ${pct(o.prior)} at typical centering · ${o.copies} measured copies of this grade · ${o.in_bucket ?? 0} within a point of this centering`}>
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

// ── one card ─────────────────────────────────────────────────────────────────

function CardSection({ v, grader, classes }: { v: CardView; grader: string; classes: string[] }) {
  const graders = Object.entries(v.grades).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0));
  const pts = v.points.filter((p) => p.grader === grader);
  const top = classes[classes.length - 1] ?? Object.keys(v.grades[grader] ?? {}).sort((a, b) => gradeKey(b) - gradeKey(a))[0];
  return (
    <div className="bg-surface border border-border rounded p-4 space-y-4">
      <div className="flex gap-4 items-start">
        {v.card.image_url && <img src={v.card.image_url} alt={v.card.card_name} className="w-24 rounded" />}
        <div className="space-y-2 text-xs flex-1">
          <div className="text-sm font-semibold">{v.card.card_name} <span className="text-muted font-normal">{v.card.card_number} · {v.card.set_name}</span></div>
          <div className="text-muted">
            {v.measured} copies measured on both sides
            {v.psa_gem_rate && <> · PSA population gem rate <span className="text-[#e6edf3] font-mono">{v.psa_gem_rate.pct}%</span> of {v.psa_gem_rate.pop_total.toLocaleString()} graded (GemRate)</>}
            <Link to={`/cards/${v.card.id}`} className="text-accent hover:underline ml-2">card page</Link>
            <FocusButton cardId={v.card.id} />
          </div>
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-2">
            {graders.map(([g, m]) => {
              const total = Object.values(m).reduce((a, b) => a + b, 0);
              return (
                <div key={g}>
                  <div className="text-[10px] text-muted">{g} copies listed ({total})</div>
                  {Object.entries(m).sort((a, b) => gradeKey(b[0]) - gradeKey(a[0])).map(([c, n]) => (
                    <div key={c} className="flex items-center gap-2">
                      <span className="w-32 whitespace-nowrap">{label(g, c)}</span>
                      <div className="flex-1 max-w-40 h-2.5 bg-bg rounded overflow-hidden"><div className="h-full rounded-r" style={{ width: `${(100 * n) / total}%`, background: SERIES[0] }} /></div>
                      <span className="font-mono w-24 text-right whitespace-nowrap">{n} · {pct(n / total)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-muted">Listed copies: sellers list more top grades than grading produces, so the population gem rate is the honest "how is it grading" number.</div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <CardScatter pts={pts} grader={grader} top={top} />
        <div className="text-xs space-y-2">
          <div className="font-semibold">Why copies missed the top grade</div>
          {v.misses.length === 0 && <div className="text-muted">No measured below-top copies yet.</div>}
          {v.misses.map((m) => (
            <div key={m.grader} className="space-y-1">
              <div>{m.grader}: {m.below_top} measured copies below the top grade</div>
              <div className="flex h-3 rounded overflow-hidden max-w-sm bg-bg">
                <div style={{ width: `${(100 * m.off_center) / m.below_top}%`, background: SERIES[1] }} />
                <div style={{ width: `${(100 * m.centered_anyway) / m.below_top}%`, background: SERIES[0] }} className="border-l-2 border-surface" />
              </div>
              <div className="text-[10px] text-muted">
                <span style={{ color: "#e6edf3" }}>{m.off_center}</span> off-center (front past 55/45 or back past 65/35) ·{" "}
                <span style={{ color: "#e6edf3" }}>{m.centered_anyway}</span> centered fine, so the grade went on corners, edges or surface
              </div>
            </div>
          ))}
          <div className="text-[10px] text-muted">Corners, edges and surface aren't measured yet (factory stations 6–7); until then, a centered copy that missed the top grade is the signal for those flaws.</div>
        </div>
      </div>
    </div>
  );
}

function CardScatter({ pts, grader, top }: { pts: CardView["points"]; grader: string; top: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 380, H = 300, pad = { l: 44, r: 24, t: 10, b: 34 }, max = 15;
  const sx = (d: number) => pad.l + (Math.min(d, max) / max) * (W - pad.l - pad.r);
  const sy = (d: number) => pad.t + (Math.min(d, max) / max) * (H - pad.t - pad.b);
  const h = hover != null ? pts.find((p) => p.copy_id === hover) : null;
  return (
    <div className="text-xs">
      <div className="font-semibold">This card's measured {grader} copies by front centering</div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted my-1 [&>span]:whitespace-nowrap">
        <span className="flex items-center gap-1"><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill={SERIES[0]} /></svg>{label(grader, top)}</span>
        <span className="flex items-center gap-1"><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill={SERIES[1]} /></svg>lower</span>
        <span className="flex items-center gap-1"><svg width="10" height="10"><circle cx="5" cy="5" r="3.5" fill="none" stroke={MUTED} strokeWidth="1.5" /></svg>hollow = engine's, not validated</span>
        <span>× = measured past what the grade allows</span>
      </div>
      {pts.length === 0 ? <div className="text-muted">No {grader} copies of this card measured yet.</div> : (
        <svg width={W} height={H} role="img" aria-label="scatter of this card's copies by front centering" onMouseLeave={() => setHover(null)}>
          {[0, 5, 10, 15].map((d) => (
            <g key={d} fontSize={10} className="fill-[#8b949e]">
              <line x1={sx(d)} x2={sx(d)} y1={pad.t} y2={H - pad.b} stroke="#30363d" strokeWidth={0.5} />
              <line x1={pad.l} x2={W - pad.r} y1={sy(d)} y2={sy(d)} stroke="#30363d" strokeWidth={0.5} />
              <text x={sx(d)} y={H - pad.b + 14} textAnchor="middle">{ratio(d)}</text>
              <text x={pad.l - 4} y={sy(d) + 3} textAnchor="end">{ratio(d)}</text>
            </g>
          ))}
          <text x={(W + pad.l) / 2} y={H - 4} textAnchor="middle" fontSize={10} className="fill-[#8b949e]">front left/right → · rows: top/bottom ↓</text>
          {pts.map((p) => {
            const c = p.grade === top ? SERIES[0] : SERIES[1];
            const x = sx(p.front_lr), y = sy(p.front_tb);
            return (
              <g key={p.copy_id} onMouseEnter={() => setHover(p.copy_id)} className="cursor-pointer"
                onClick={() => window.open(`#/copies/${p.copy_id}`, "_blank")}>
                <circle cx={x} cy={y} r={9} fill="transparent" />
                {!p.plausible ? (
                  <path d={`M${x - 4},${y - 4}L${x + 4},${y + 4}M${x + 4},${y - 4}L${x - 4},${y + 4}`} stroke={MUTED} strokeWidth={1.5} />
                ) : p.validated ? (
                  <circle cx={x} cy={y} r={4.5} fill={c} stroke="#161b22" strokeWidth={2} />
                ) : (
                  <circle cx={x} cy={y} r={4} fill="none" stroke={c} strokeWidth={1.5} />
                )}
              </g>
            );
          })}
        </svg>
      )}
      <div className="text-[10px] h-4 font-mono">
        {h && <>copy {h.copy_id} · {label(h.grader, h.grade)} · front {ratio(h.front_lr)} L/R, {ratio(h.front_tb)} T/B · back {ratio(h.back_lr)}, {ratio(h.back_tb)} · {h.validated ? "validated" : "auto"} · click to open</>}
      </div>
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
        <Tile label="measured copies" value={(d.n ?? 0).toLocaleString()}
          sub={`${(d.validated ?? 0).toLocaleString()} validated by a person · ${(d.excluded_implausible ?? 0).toLocaleString()} left out as mismeasured`} />
        <Tile label="grades modelled" value={classes.map((c) => c.replace(" pristine", " P")).join(" · ")}
          sub={classes.map((c) => `${c}: ${d.counts?.[c] ?? 0}`).join(" · ")} />
        <Tile label={`backtest AUC (${top})`} value={bt ? bt.auc_top.toFixed(2) : "—"}
          sub={bt ? "0.5 = centering says nothing · 1 = perfect" : d.pooled ? "too few copies for a backtest of this filter" : "not enough copies"} />
        <Tile label="backtest log loss" value={bt ? bt.log_loss.toFixed(3) : "—"} sub={bt ? `vs ${bt.baseline_log_loss.toFixed(3)} guessing the mix (lower is better)` : "—"} />
      </div>
      <NoticedTable d={d} />
      {d.corner_curves && <CornerChart d={d} />}
      <div className="grid md:grid-cols-2 gap-6">
        <Curves d={d} axes={["front_lr", "front_tb"]} title="Front" max={15} />
        <Curves d={d} axes={["back_lr", "back_tb"]} title="Back" max={30} />
      </div>
      <Heatmap d={d} />
      {bt && <ReliabilityTable bt={bt} top={label(d.grader, top)} />}
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

function NoticedTable({ d }: { d: CenteringAnalytics }) {
  const top = d.classes?.[d.classes.length - 1] ?? "";
  const front = ["52/48", "53/47", "55/45", "58/42", "60/40"];
  const back = ["55/45", "60/40", "65/35", "70/30", "75/25"];
  return (
    <div className="bg-surface border border-border rounded p-4 text-xs overflow-x-auto">
      <div className="font-semibold">Where graders start noticing</div>
      <div className="text-[10px] text-muted mb-2">
        odds of {label(d.grader, top)} as one axis moves off-center (others typical) · "notices from" = first point the odds sit 2+ points below a perfectly centered copy
      </div>
      <table className="w-full">
        <thead className="text-[10px] text-muted">
          <tr>
            <th className="text-left font-normal">axis</th><th className="text-right font-normal">notices from</th><th className="text-right font-normal">50/50</th>
            {front.map((r, i) => <th key={r} className="text-right font-normal">{r} <span className="text-border">/</span> {back[i]}</th>)}
          </tr>
        </thead>
        <tbody>
          {AXES.map((a, ai) => {
            const n = d.noticed?.[a.key];
            if (!n) return null;
            const marks = ai < 2 ? front : back;
            return (
              <tr key={a.key} className="border-t border-border">
                <td className="py-1">{a.label}</td>
                <td className="text-right font-mono">{n.starts_at == null ? "never (in range)" : ratio(n.starts_at)}</td>
                <td className="text-right font-mono">{pct(n.centered)}</td>
                {marks.map((r) => <td key={r} className="text-right font-mono">{n.at[r] != null ? pct(n.at[r]) : "—"}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="text-[10px] text-muted mt-1">column headers: front / back landmarks</div>
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
  const W = 440, H = 240, pad = { l: 40, r: 74, t: 10, b: 30 };
  const sx = (x: number) => pad.l + (x / max) * (W - pad.l - pad.r);
  const sy = (p: number) => pad.t + (1 - p) * (H - pad.t - pad.b);
  const series = useMemo(() => axes.map((a) => (d.curves?.[a] ?? []).filter((r) => r[0] <= max).map((r) => [r[0], r[K]] as [number, number])), [d, axes, max, K]);
  const obs: ObservedBin[][] = axes.map((a) => (d.observed?.[a] ?? []).filter((b) => b.n >= 10));
  const at = (s: [number, number][], x: number) => s.reduce((best, r) => (Math.abs(r[0] - x) < Math.abs(best[0] - x) ? r : best), s[0]);
  const names = axes.map((a) => AXES.find((x) => x.key === a)!.label);
  // line-end labels, pushed apart when the lines end close together
  const endY = useMemo(() => {
    const ys = series.map((s, i) => ({ i, y: s.length ? sy(s[s.length - 1][1]) + 3 : 0 })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ys.length; k++) if (ys[k].y - ys[k - 1].y < 12) ys[k].y = ys[k - 1].y + 12;
    const over = ys.length ? ys[ys.length - 1].y - (sy(0) - 4) : 0;
    if (over > 0) ys.forEach((v) => { v.y -= over; });
    const out: number[] = [];
    ys.forEach(({ i, y }) => { out[i] = y; });
    return out;
  }, [series]); // eslint-disable-line react-hooks/exhaustive-deps
  const hb = (i: number) => (hx == null ? null : obs[i].find((b) => hx >= b.lo && hx < b.hi));
  return (
    <div className="bg-surface border border-border rounded p-4">
      <div className="text-xs font-semibold">{title}: odds of {label(d.grader, top)} as one axis moves</div>
      <div className="text-[10px] text-muted mb-1">line = model (other axes typical) · dots = raw share of listed copies at that centering, bars = 90% range (bins with 10+ copies) · dashed = graders start noticing</div>
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
        {axes.map((a, i) => {
          const s = d.noticed?.[a]?.starts_at;
          return s != null && s <= max && (
            <line key={a} x1={sx(s)} x2={sx(s)} y1={pad.t} y2={H - pad.b} stroke={SERIES[i]} strokeWidth={1} strokeDasharray="2 3" opacity={0.8} />
          );
        })}
        {obs.map((bins, i) => bins.map((b) => {
          const x = sx((b.lo + b.hi) / 2) + (i ? 3 : -3);
          return (
            <g key={`${i}-${b.lo}`}>
              <line x1={x} x2={x} y1={sy(b.ci_lo)} y2={sy(b.ci_hi)} stroke={SERIES[i]} strokeWidth={1} opacity={0.6} />
              <circle cx={x} cy={sy(b.rate)} r={3} fill={SERIES[i]} stroke="#161b22" strokeWidth={1.5} />
            </g>
          );
        }))}
        {series.map((s, i) => (
          <g key={i}>
            <polyline fill="none" stroke={SERIES[i]} strokeWidth={2} points={s.map(([x, p]) => `${sx(x)},${sy(p)}`).join(" ")} />
            {s.length > 0 && <text x={sx(s[s.length - 1][0]) + 4} y={endY[i]} fontSize={10} className="fill-[#e6edf3]">{names[i]}</text>}
          </g>
        ))}
        {hx != null && (
          <g>
            <line x1={sx(hx)} x2={sx(hx)} y1={pad.t} y2={H - pad.b} stroke={MUTED} strokeWidth={1} strokeDasharray="3 3" />
            {series.map((s, i) => { const r = at(s, hx); return r && <circle key={i} cx={sx(r[0])} cy={sy(r[1])} r={4} fill={SERIES[i]} stroke="#161b22" strokeWidth={2} />; })}
          </g>
        )}
      </svg>
      <div className="text-[10px] min-h-8 font-mono space-y-0.5">
        {hx != null && series.map((s, i) => {
          const b = hb(i);
          return (
            <div key={i}>
              {names[i]} at {ratio(hx)}: model {pct(at(s, hx)?.[1] ?? 0)}
              {b ? ` · seen ${b.top}/${b.n} = ${pct(b.rate)} (90%: ${pct(b.ci_lo)}–${pct(b.ci_hi)})` : " · too few copies seen here"}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReliabilityTable({ bt, top }: { bt: NonNullable<CenteringAnalytics["backtest"]>; top: string }) {
  return (
    <div className="bg-surface border border-border rounded p-4 text-xs max-w-xl">
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

// Focus card (Settings: focus.card_ids): every copy of the card gets photos,
// triage and centering ahead of everything else.
function FocusButton({ cardId }: { cardId: number }) {
  const [ids, setIds] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.getSettings().then((r) => {
      const s = r.settings.find((x) => x.key === "focus.card_ids");
      setIds(Array.isArray(s?.value) ? s!.value : []);
    }).catch(() => setIds(null));
  }, []);
  if (ids === null) return null;
  const on = ids.includes(cardId);
  const toggle = async () => {
    setBusy(true);
    setErr(null);
    try {
      const next = on ? ids.filter((x) => x !== cardId) : [...ids, cardId];
      const r = await api.saveSettings({ "focus.card_ids": next });
      const s = r.settings.find((x) => x.key === "focus.card_ids");
      setIds(Array.isArray(s?.value) ? s!.value : next);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="ml-3">
      <button onClick={toggle} disabled={busy}
        title="Focus card: every copy gets photos (no per-card cap), photo triage and centering ahead of everything else"
        className={`text-[10px] border rounded px-1.5 py-0.5 ${on ? "border-green text-green" : "border-border text-muted hover:text-accent"}`}>
        {on ? "focus card ✓ (processed first)" : "focus this card"}
      </button>
      {err && <span className="text-red-400 ml-2">{err}</span>}
    </span>
  );
}

// odds as the worst corner's cut strays from a clean quarter circle (corner
// check), centering at the median; dots = what was seen, with a 90% range
function CornerChart({ d }: { d: CenteringAnalytics }) {
  const classes = d.classes ?? [];
  const K = classes.length;
  const top = classes[K - 1];
  const W = 440, H = 220, pad = { l: 40, r: 60, t: 10, b: 30 }, max = 0.4;
  const sx = (x: number) => pad.l + (x / max) * (W - pad.l - pad.r);
  const sy = (p: number) => pad.t + (1 - p) * (H - pad.t - pad.b);
  const sides = ["front", "back"] as const;
  const seen = (sd: (typeof sides)[number]) => (d.corner_observed?.[sd] ?? []).filter((b) => b.n >= 10);
  const measured = sides.reduce((a, sd) => a + (d.corner_observed?.[sd] ?? []).reduce((x, b) => x + b.n, 0), 0);
  return (
    <div className="bg-surface border border-border rounded p-4">
      <div className="text-xs font-semibold">Corner cut: odds of {label(d.grader, top)} as the worst corner strays from a clean quarter circle</div>
      <div className="text-[10px] text-muted mb-1">
        line = model (centering typical, the other side's corners average) · dots = share seen, bars = 90% range (10+ copies) · {measured.toLocaleString()} measured sides so far; the factor firms up as corners are measured
      </div>
      <div className="flex gap-3 text-[10px] text-muted mb-1">
        {sides.map((sd, i) => <span key={sd} className="flex items-center gap-1"><span className="inline-block w-3 h-0.5" style={{ background: SERIES[i] }} />{sd}</span>)}
      </div>
      <svg width={W} height={H} role="img" aria-label="odds by corner off-round">
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(p)} y2={sy(p)} stroke="#30363d" strokeWidth={0.5} />
            <text x={pad.l - 6} y={sy(p) + 3} textAnchor="end" fontSize={10} className="fill-[#8b949e]">{pct(p)}</text>
          </g>
        ))}
        {[0, 0.1, 0.2, 0.3, 0.4].map((x) => (
          <text key={x} x={sx(x)} y={H - 12} textAnchor="middle" fontSize={10} className="fill-[#8b949e]">{x} mm</text>
        ))}
        {sides.map((sd, i) => (
          <g key={sd}>
            {seen(sd).map((b) => {
              const x = sx((b.lo + b.hi) / 2) + (i ? 3 : -3);
              return (
                <g key={b.lo}>
                  <line x1={x} x2={x} y1={sy(b.ci_lo)} y2={sy(b.ci_hi)} stroke={SERIES[i]} strokeWidth={1} opacity={0.6} />
                  <circle cx={x} cy={sy(b.rate)} r={3} fill={SERIES[i]} stroke="#161b22" strokeWidth={1.5}>
                    <title>{`${sd} ${b.lo.toFixed(2)}–${b.hi.toFixed(2)} mm: ${b.top}/${b.n} = ${pct(b.rate)} (90%: ${pct(b.ci_lo)}–${pct(b.ci_hi)})`}</title>
                  </circle>
                </g>
              );
            })}
            <polyline fill="none" stroke={SERIES[i]} strokeWidth={2}
              points={(d.corner_curves?.[sd] ?? []).map((r) => `${sx(r[0])},${sy(r[K])}`).join(" ")} />
          </g>
        ))}
      </svg>
    </div>
  );
}
