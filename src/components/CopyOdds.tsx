import { useEffect, useState } from "react";
import { api } from "../api";
import type { GraderPrediction, OddsBasis, Prediction } from "../types";

// Grade odds for this copy from its current outlines (backend GET /v1/predict/{id}):
// a reviewed / fixed outline wins over the engine's, so after you fix a line
// the odds here are the ones the market tracker gets on its next fetch.
// "Expected" = an average copy of this card: the card's own graded copies when
// there are enough, else its rarity in its set, its set, its rarity in its era,
// its era, everything (PSA 10 uses the PSA population gem rate when known).

const SCOPE: Record<OddsBasis["scope"], string> = {
  card: "this card", set_rarity: "rarity in set", set: "set", era_rarity: "rarity in era", era: "era", all: "all copies",
};
const pct = (v: number) => `${v < 0.1 ? (v * 100).toFixed(1) : Math.round(v * 100)}%`;
const AXIS: Record<string, string> = {
  front_lr: "front L/R", front_tb: "front T/B", back_lr: "back L/R", back_tb: "back T/B", front_corners: "front corners", back_corners: "back corners",
};

// the top grade, and for a Pristine-topped grader also "10 or better"
function lines(g: GraderPrediction) {
  const top = g.outcomes[0];
  if (!top) return [];
  const out = [{ label: `${g.grader} ${top.grade.replace("pristine", "Pristine").replace("black label", "Black Label")}`, p: top.p, prior: top.prior }];
  const ten = g.outcomes.find((o) => o.grade === "10");
  if (ten && ten !== top) out.push({ label: `${g.grader} 10 or better`, p: top.p + ten.p, prior: top.prior + ten.prior });
  return out;
}

export default function CopyOdds({ copyId, refreshKey }: { copyId: number; refreshKey: string }) {
  const [p, setP] = useState<Prediction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prev, setPrev] = useState<Record<string, number>>({});
  const load = () => {
    setBusy(true);
    api.getPrediction(copyId).then((n) => {
      setP((old) => {
        // remember the odds before this refresh, to show what a fix changed
        if (old?.predictions && old.snapshot?.version !== n.snapshot?.version) {
          const m: Record<string, number> = {};
          old.predictions.forEach((g) => lines(g).forEach((l) => { m[l.label] = l.p; }));
          setPrev(m);
        }
        return n;
      });
      setErr(null);
    }).catch((e: unknown) => setErr(String(e))).finally(() => setBusy(false));
  };
  useEffect(() => { setPrev({}); setP(null); }, [copyId]);
  useEffect(load, [copyId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-surface border border-border rounded-md p-2 text-xs space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold">Grade odds</span>
        {p?.snapshot && <span className="text-[10px] text-muted" title={`model ${p.snapshot.model_version}, ${new Date(p.snapshot.created_at).toLocaleString()}`}>v{p.snapshot.version}</span>}
        <button onClick={load} disabled={busy} className="ml-auto text-[10px] text-muted hover:text-accent disabled:opacity-40">{busy ? "…" : "↻"}</button>
      </div>
      {err && <div className="text-red-400 text-[10px]">{err}</div>}
      {!p ? <div className="text-muted text-[10px]">loading…</div>
        : p.status === "measuring" ? <div className="text-yellow text-[10px]">Still measuring.</div>
        : p.status === "unmeasurable" ? <div className="text-red-400 text-[10px]">No usable outline on one side: fix the outlines to get odds.</div>
        : (p.predictions ?? []).map((g) => (
          <div key={g.grader} className="space-y-0.5">
            {lines(g).map((l, i) => {
              const d = l.p - l.prior;
              const was = prev[l.label];
              return (
                <div key={l.label} className={`flex items-baseline gap-1.5 ${i ? "text-[10px] text-muted" : ""}`}>
                  <span className="flex-1 truncate">{l.label}</span>
                  {was != null && Math.abs(was - l.p) >= 0.005 && <span className="text-[10px] text-muted line-through" title="before the last change">{pct(was)}</span>}
                  <span className={`font-mono ${i ? "" : "font-semibold"} ${d >= 0.01 ? "text-green" : d <= -0.01 ? "text-red-400" : ""}`}>{pct(l.p)}</span>
                  <span className="text-[10px] text-muted font-mono w-16 text-right" title="an average copy of this card">exp {pct(l.prior)}</span>
                </div>
              );
            })}
            <div className="text-[10px] text-muted" title={g.prior_source}>
              expected from {g.basis ? `${SCOPE[g.basis.scope]} (${g.basis.label}, ${g.basis.measured} copies${g.basis.reviewed ? `, ${g.basis.reviewed} reviewed` : ""})` : "all copies"}
              {g.population_p != null && " · PSA population gem rate"}
            </div>
            {g.centering_cap && g.centering_cap !== "10" && <div className="text-[10px] text-red-400">centering caps PSA at {g.centering_cap}</div>}
            {g.explain && (
              <div className="text-[10px] text-muted">
                {g.explain.axes.filter((a) => Math.abs(a.effect_pp) >= 1).sort((a, b) => Math.abs(b.effect_pp) - Math.abs(a.effect_pp)).slice(0, 3).map((a) => (
                  <span key={a.axis} className={`mr-2 ${a.effect_pp < 0 ? "text-red-400/80" : "text-green/80"}`} title={a.typical ? `typical ${a.typical}` : undefined}>
                    {AXIS[a.axis] ?? a.axis} {a.measured} {a.effect_pp > 0 ? "+" : ""}{a.effect_pp.toFixed(0)}
                  </span>
                ))}
                {g.explain.percentile != null && <span>· better centered than {g.explain.percentile}% of {g.explain.percentile_of ?? "graded copies"}</span>}
              </div>
            )}
          </div>
        ))}
      {p?.status === "ready" && <div className="text-[10px] text-muted">From the current outlines (yours win over the engine's). Corners/edges/surface beyond the corner check are assumed clean.</div>}
    </div>
  );
}
