import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

// Review priority (backend review_priority.go): the market tracker's hot list
// (and the Settings focus cards) against what's been reviewed per card and
// grader. A card's odds use its own copies once it has 30 reviewed copies,
// 5+ at the top grade and 5+ below; until then they borrow its set / era.

interface ClassCov { grade: string; measured: number; reviewed: number }
interface GraderCov {
  grader: string; measured: number; reviewed: number; top_grade: string; classes: ClassCov[] | null;
  shortfall: number; to_review: number; level_now: string; next_grade?: string; next_reason?: string; priority: number;
}
interface PCard {
  card_id: number; display_key?: string; card_name: string; card_number: string; set_name: string; language: string;
  image_url?: string; reasons: string[]; hot_score: number; live_raw_listings: number; focus: boolean;
  graders: GraderCov[] | null; priority: number; action: string;
}
interface Report { source: string; source_note?: string; goal: { reviewed: number; each_side: number }; cards: PCard[]; unmatched_display_keys?: string[] }

const REASON: Record<string, string> = {
  raw_grade_target: "raw to grade", raw_invest_target: "raw to invest", hunt_list: "hunt list", owned_raw: "owned raw",
  bid_plan: "bid plan", watchlist: "watchlist", focus: "focus card",
};

// the copies list for one grade of a card, unreviewed first
function reviewLink(c: PCard, g: GraderCov, grade?: string) {
  const p = new URLSearchParams({ card_id: String(c.card_id), grader: g.grader, centering: "proposed" });
  if (grade) {
    const [num, ...label] = grade.split(" ");
    p.set("grade", num);
    if (label.length) p.set("label", label.join("_")); else if (g.grader === "CGC" && num === "10") p.set("label", "none");
  }
  return `/copies?${p.toString()}`;
}

export default function ReviewPriority() {
  const [rep, setRep] = useState<{ as_of: string; report: Report } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = (fresh = false) => {
    setBusy(true);
    api.reviewPriority(fresh).then(setRep).catch((e: unknown) => setErr(String(e))).finally(() => setBusy(false));
  };
  useEffect(() => load(), []);
  const r = rep?.report;
  return (
    <section className="space-y-4 max-w-6xl">
      <div>
        <div className="text-xs text-muted"><Link to="/factory" className="hover:text-accent">factory</Link> / review priority</div>
        <h1 className="text-base font-semibold mt-1">What to review next</h1>
        <p className="text-xs text-muted mt-1 max-w-3xl">
          Cards on the market tracker's hot list (and your focus cards), ranked by how much we care × how far each is from
          having its own odds: {r?.goal.reviewed ?? 30} copies you reviewed, with {r?.goal.each_side ?? 5}+ at the top grade and {r?.goal.each_side ?? 5}+ below.
          Until then a card borrows its odds from its set or era.
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <button onClick={() => load(true)} disabled={busy} className="border border-border rounded px-2 py-1 hover:text-accent disabled:opacity-40">↻ refresh</button>
        {rep && <span className="text-muted">as of {new Date(rep.as_of).toLocaleTimeString()} · source: {r?.source === "tracker" ? "tracker hot list + focus cards" : "focus cards only"}</span>}
        {r?.source_note && <span className="text-yellow">{r.source_note}</span>}
      </div>
      {err && <div className="text-xs text-red-400">{err}</div>}
      {!r ? <div className="text-xs text-muted">loading…</div> : r.cards.length === 0 ? <div className="text-xs text-muted">No hot or focus cards yet.</div> : (
        <div className="space-y-2">
          {r.cards.map((c, i) => (
            <div key={c.card_id} className="bg-surface border border-border rounded p-3 flex gap-3 text-xs">
              <div className="w-6 text-muted font-mono pt-0.5">{i + 1}</div>
              {c.image_url ? <img src={c.image_url} alt="" className="w-12 h-16 object-contain rounded" loading="lazy" /> : <div className="w-12" />}
              <div className="flex-1 space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link to={`/grader-analytics?card_id=${c.card_id}`} className="font-semibold hover:text-accent">{c.card_name} <span className="text-muted font-normal">{c.card_number} · {c.set_name} ({c.language})</span></Link>
                  {c.reasons.map((x) => <span key={x} className="border border-border rounded px-1 text-[10px] text-muted">{REASON[x] ?? x}</span>)}
                  {c.live_raw_listings > 0 && <span className="text-[10px] text-muted">{c.live_raw_listings} raw for sale</span>}
                  <span className="ml-auto font-mono text-[10px] text-muted" title="hot score × shortfall × copies left to review">priority {c.priority.toFixed(2)}</span>
                </div>
                <div className="text-[11px]">{c.action}</div>
                <div className="grid md:grid-cols-2 gap-3">
                  {(c.graders ?? []).map((g) => (
                    <div key={g.grader} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-10 font-semibold">{g.grader}</span>
                        <div className="flex-1 h-2 bg-bg rounded overflow-hidden" title={`${g.reviewed} of ${r.goal.reviewed} reviewed`}>
                          <div className="h-full bg-accent rounded-r" style={{ width: `${Math.min(100, (100 * g.reviewed) / r.goal.reviewed)}%` }} />
                        </div>
                        <span className="font-mono text-[10px] w-28 text-right">{g.reviewed}/{r.goal.reviewed} reviewed</span>
                        <span className="text-[10px] text-muted w-20">odds from {g.level_now}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(g.classes ?? []).map((k) => (
                          <Link key={k.grade} to={reviewLink(c, g, k.grade)}
                            className={`border rounded px-1 text-[10px] hover:border-accent ${k.grade === g.next_grade ? "border-accent text-accent" : "border-border text-muted"}`}
                            title={`${k.measured - k.reviewed} measured copies not reviewed yet`}>
                            {g.grader} {k.grade.replace("pristine", "Pristine").replace("black label", "Black Label")}: {k.reviewed}/{k.measured}
                          </Link>
                        ))}
                        {g.next_grade && g.shortfall > 0 && g.to_review > 0 && (
                          <Link to={reviewLink(c, g, g.next_grade)} className="text-[10px] text-accent hover:underline ml-1">review next →</Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {!!r.unmatched_display_keys?.length && (
            <div className="text-[10px] text-muted">Not in the predictor's catalog yet (synced every 6 h): {r.unmatched_display_keys.join(", ")}</div>
          )}
        </div>
      )}
    </section>
  );
}
