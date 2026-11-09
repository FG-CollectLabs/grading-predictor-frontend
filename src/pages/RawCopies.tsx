import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, imageUrl } from "../api";
import type { CopyDetail, CopyList, CopyRow, Prediction, RawCalibration, RawFeedback } from "../types";

// Raw copies: cards sent for grade odds without a slab (POST /v1/predict, e.g.
// the market tracker's eBay listings and "check centering"). Their photos and
// the engine's measurements are kept so a person can check them, above all
// for the copies that were bought, and say what the engine got wrong.

const PAGE = 60;
const ratio = (p: number | null | undefined) => (p == null ? "—" : `${Math.round(p * 10) / 10}/${Math.round((100 - p) * 10) / 10}`);
const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function RawCopies() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "flagged";
  const offset = Number(params.get("offset") ?? 0);
  const [data, setData] = useState<CopyList | null>(null);
  const [counts, setCounts] = useState<{ bought: number; all: number; ebay: number; inventory: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (view === "flagged") return;
    const p = new URLSearchParams({ grader: "RAW", limit: String(PAGE), offset: String(offset) });
    if (view === "bought") p.set("bought", "yes");
    if (view === "ebay") p.set("kind", "listing");
    if (view === "inventory") p.set("kind", "inventory");
    setData(null);
    api.listCopies(p).then(setData).catch((e: unknown) => setErr(String(e)));
  }, [view, offset]);

  useEffect(() => {
    Promise.all([
      api.listCopies(new URLSearchParams({ grader: "RAW", bought: "yes", limit: "1" })),
      api.listCopies(new URLSearchParams({ grader: "RAW", limit: "1" })),
      api.listCopies(new URLSearchParams({ grader: "RAW", kind: "listing", limit: "1" })),
      api.listCopies(new URLSearchParams({ grader: "RAW", kind: "inventory", limit: "1" })),
    ]).then(([b, a, e, i]) => setCounts({ bought: b.total, all: a.total, ebay: e.total, inventory: i.total })).catch(() => undefined);
  }, []);

  const tab = (v: string, label: string, n?: number) => (
    <button onClick={() => setParams({ view: v })}
      className={`px-3 py-1 rounded border text-xs ${view === v ? "border-accent text-accent" : "border-border text-muted hover:text-[#e6edf3]"}`}>
      {label}{n != null && <span className="text-[10px] text-muted ml-1">{n}</span>}
    </button>
  );

  return (
    <section className="space-y-4">
      <div>
        <div className="text-xs text-muted"><Link to="/factory" className="hover:text-accent">factory</Link> / raw copies</div>
        <h1 className="text-base font-semibold mt-1">Raw copies</h1>
        <p className="text-xs text-muted max-w-3xl mt-1">
          Cards sent for grade odds without a slab: the market tracker's eBay listings and its "check centering" button.
          Their photos and the engine's measurements are kept here. Check the ones you bought: fix the outline and corners
          where the engine is off, so the raw-card analysis improves. Mark a copy bought from its review page.
        </p>
      </div>
      <div className="flex gap-2">
        {tab("flagged", "flagged by the tracker")}
        {tab("ebay", "eBay listings", counts?.ebay)}
        {tab("inventory", "our inventory", counts?.inventory)}
        {tab("bought", "bought", counts?.bought)}
        {tab("all", "all raw copies", counts?.all)}
      </div>
      {err && <div className="text-xs text-red-400">{err}</div>}
      {view === "inventory" && <InventoryResults />}
      {view === "flagged" ? <Flagged /> : !data ? <div className="text-xs text-muted">loading…</div>
        : data.items.length === 0 ? <div className="text-xs text-muted">{view === "bought" ? "No copies marked bought yet." : view === "inventory" ? "No in-hand scans yet (the admin app sends them; they need the API token under Settings)." : "No raw copies yet."}</div>
        : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {data.items.map((c) => <Tile key={c.id} c={c} />)}
          </div>
        )}
      {view !== "flagged" && data && data.total > PAGE && (
        <div className="flex gap-2 text-xs">
          <button disabled={offset === 0} onClick={() => setParams({ view, offset: String(Math.max(0, offset - PAGE)) })}
            className="border border-border rounded px-2 py-1 disabled:opacity-40">← newer</button>
          <span className="text-muted py-1">{offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total}</span>
          <button disabled={offset + PAGE >= data.total} onClick={() => setParams({ view, offset: String(offset + PAGE) })}
            className="border border-border rounded px-2 py-1 disabled:opacity-40">older →</button>
        </div>
      )}
    </section>
  );
}

function Tile({ c }: { c: CopyRow }) {
  const reviewed = c.front_centering?.status === "accepted" && c.back_centering?.status === "accepted";
  return (
    <Link to={`/copies/${c.id}`} className="bg-surface border border-border rounded p-2 hover:border-accent/60 space-y-1 block">
      <div className="aspect-[5/7] bg-bg rounded overflow-hidden flex items-center justify-center">
        {c.front_image ? <img src={imageUrl(c.front_image)} alt={c.card_name} className="w-full h-full object-contain" loading="lazy" />
          : <span className="text-[10px] text-muted">no photo</span>}
      </div>
      <div className="text-xs truncate">{c.card_name} <span className="text-muted">{c.card_number}</span></div>
      <div className="text-[10px] text-muted truncate">{c.set_name}</div>
      <div className="text-[10px] font-mono">
        F {ratio(c.front_centering?.lr)} · {ratio(c.front_centering?.tb)}<br />
        B {ratio(c.back_centering?.lr)} · {ratio(c.back_centering?.tb)}
      </div>
      <div className="flex flex-wrap gap-1 text-[9px]">
        {c.bought_at && <span className="border border-green/50 text-green rounded px-1">bought{c.bought_price_cents != null ? ` ${usd(c.bought_price_cents)}` : ""}</span>}
        <span className={`border rounded px-1 ${reviewed ? "border-green/50 text-green" : "border-border text-muted"}`}>{reviewed ? "reviewed" : "engine only"}</span>
        <span className="text-muted">{new Date(c.updated_at).toLocaleDateString()}</span>
      </div>
    </Link>
  );
}

// ── flagged by the tracker ───────────────────────────────────────────────────

const VERDICT: Record<string, string> = {
  false_positive: "odds too high", false_negative: "odds too low", bad_measurement: "bad measurement",
  wrong_card: "wrong card", unusable_photos: "unusable photos", looks_right: "looks right",
};
const RESOLUTIONS = [
  ["model_wrong", "model wrong"], ["measurement_wrong", "measurement wrong"], ["photo_limit", "photo limit"], ["user_wrong", "flag was wrong"],
] as const;
const pct = (p?: number | null) => (p == null ? "—" : `${Math.round(p * 100)}%`);

function Flagged() {
  const [list, setList] = useState<RawFeedback[] | null>(null);
  const [cal, setCal] = useState<RawCalibration | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = () => {
    const p = new URLSearchParams({ limit: "300" });
    if (!showResolved) p.set("resolved", "no");
    api.listFeedback(p).then((r) => setList(r.feedback)).catch((e: unknown) => setErr(String(e)));
    api.rawCalibration().then(setCal).catch(() => undefined);
  };
  useEffect(load, [showResolved]); // eslint-disable-line react-hooks/exhaustive-deps
  // flagged first: odds too high, then bad measurements, then the rest
  const order = ["false_positive", "bad_measurement", "false_negative", "wrong_card", "unusable_photos", "looks_right"];
  const rows = (list ?? []).slice().sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict) || b.id - a.id);
  return (
    <div className="space-y-4">
      {cal && <Counters cal={cal} />}
      <label className="text-xs text-muted flex items-center gap-1">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> show resolved
      </label>
      {err && <div className="text-xs text-red-400">{err}</div>}
      {!list ? <div className="text-xs text-muted">loading…</div>
        : rows.length === 0 ? <div className="text-xs text-muted">No {showResolved ? "" : "open "}feedback from the tracker yet.</div>
        : <div className="space-y-3">{rows.map((f) => <FlagRow key={f.id} f={f} onChange={load} />)}</div>}
    </div>
  );
}

function Counters({ cal }: { cal: RawCalibration }) {
  const dims: [keyof RawCalibration["feedback"]["by"], string][] = [["issue", "issue"], ["card", "card"], ["err_pp", "measurement ±"], ["flag", "engine flag"]];
  return (
    <div className="bg-surface border border-border rounded p-3 text-xs space-y-2">
      <div className="font-semibold">Where the raw-copy odds go wrong</div>
      <div className="text-[10px] text-muted">
        {cal.outcomes > 0
          ? <>{cal.outcomes} graded outcomes · Brier {cal.brier} · {cal.buckets.filter((b) => b.n).map((b) => `${pct(b.predicted)} predicted → ${pct(b.actual)} (${b.n})`).join(" · ")}</>
          : <>No grading outcomes yet: the false-positive rate among judged feedback is the stand-in ({cal.feedback.all.false_positive} of {cal.feedback.all.judged} judged = {pct(cal.feedback.all.false_positive_rate)}).</>}
      </div>
      <div className="grid md:grid-cols-4 gap-3">
        {dims.map(([k, label]) => (
          <div key={k}>
            <div className="text-[10px] text-muted mb-1">by {label}</div>
            {(cal.feedback.by[k] ?? []).slice(0, 6).map((r) => (
              <div key={r.key} className="flex justify-between gap-2 font-mono text-[10px]">
                <span className="truncate">{r.key || "—"}</span><span>{pct(r.false_positive_rate)} of {r.judged}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function FlagRow({ f, onChange }: { f: RawFeedback; onChange: () => void }) {
  const [copy, setCopy] = useState<CopyDetail | null>(null);
  const [now, setNow] = useState<Prediction | null>(null);
  const [res, setRes] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api.getCopy(f.copy_id).then(setCopy).catch(() => undefined);
    api.getPrediction(f.copy_id).then(setNow).catch(() => undefined);
  }, [f.copy_id]);
  const p10now = now?.predictions?.find((g) => g.grader === "PSA")?.outcomes.find((o) => o.grade === "10")?.p;
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg(done); onChange(); } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="bg-surface border border-border rounded p-3 flex flex-wrap gap-3 text-xs">
      <div className="flex gap-1">
        {(["front_image", "back_image"] as const).map((k) => (
          <div key={k} className="w-24 aspect-[5/7] bg-bg rounded overflow-hidden flex items-center justify-center">
            {copy?.[k] ? <img src={imageUrl(copy[k]!)} alt={k} className="w-full h-full object-contain" loading="lazy" /> : <span className="text-[10px] text-muted">—</span>}
          </div>
        ))}
      </div>
      <div className="flex-1 min-w-64 space-y-1">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="font-semibold">{copy ? `${copy.card_name} ${copy.card_number}` : `copy ${f.copy_id}`}</span>
          <span className={`border rounded px-1 text-[10px] ${f.verdict === "looks_right" ? "border-green/50 text-green" : "border-red-400/50 text-red-300"}`}>{VERDICT[f.verdict] ?? f.verdict}</span>
          {f.issues.map((i) => <span key={i} className="border border-border rounded px-1 text-[10px] text-muted">{i.replace(/_/g, " ")}</span>)}
          {f.resolution && <span className="text-[10px] text-green">resolved: {f.resolution.replace(/_/g, " ")}</span>}
        </div>
        {f.note && <div className="text-muted">“{f.note}”</div>}
        <div className="font-mono text-[11px]">
          PSA 10 shown {pct(f.odds_shown?.psa10_p)} (snapshot v{f.snapshot_version ?? "?"}) · now {pct(p10now)}
          {f.source_ref && <> · <a href={f.source_ref} target="_blank" rel="noreferrer" className="text-accent hover:underline">listing</a></>}
        </div>
        <div className="flex flex-wrap items-center gap-1 pt-1">
          <Link to={`/copies/${f.copy_id}`} className="border border-border rounded px-1.5 py-0.5 hover:text-accent">fix the outline →</Link>
          <select value={res} onChange={(e) => setRes(e.target.value)} className="bg-bg border border-border rounded px-1 py-0.5">
            <option value="">resolve as…</option>
            {RESOLUTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note" className="w-40 bg-bg border border-border rounded px-1 py-0.5" />
          <button disabled={busy || !res} onClick={() => act(() => api.resolveFeedback(f.id, res, note), "resolved")}
            className="border border-border rounded px-1.5 py-0.5 hover:text-accent disabled:opacity-40">resolve</button>
          {f.resolution && <button disabled={busy} onClick={() => act(() => api.resolveFeedback(f.id, ""), "reopened")}
            className="border border-border rounded px-1.5 py-0.5 text-muted">reopen</button>}
          <span className="text-muted ml-2">tag:</span>
          {(["training", "evaluation"] as const).map((t) => (
            <button key={t} disabled={busy} onClick={() => act(() => api.datasetTag(f.copy_id, t), `tagged ${t}`)}
              className="border border-border rounded px-1.5 py-0.5 hover:text-accent">{t}</button>
          ))}
          {msg && <span className="text-[10px] text-muted ml-1">{msg}</span>}
        </div>
      </div>
    </div>
  );
}

// Our inventory vs the grades it got (backend inventory_results.go): the
// pre-grader's odds of a 10 from the in-hand scan, from the listing photos
// and for an average copy, against what actually came back.
interface InvSummary {
  grader: string; graded: number; tens: number; actual_rate: number; scan_p10: number | null; listing_p10: number | null; listing_n: number;
  expected_p10: number | null; brier?: number | null; buckets: { lo: number; hi: number; n: number; predicted: number; actual: number }[];
}
interface InvCopy {
  copy_id: number; card_name: string; card_number: string; set_name: string; listing_copy_id?: number; grader: string;
  scan_p10: number | null; listing_p10: number | null; expected_p10: number | null; rescan?: boolean;
  graded?: { grade: string; cert_number?: string; ten: boolean };
}
const pc = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function InventoryResults() {
  const [d, setD] = useState<{ copies: InvCopy[]; summary: InvSummary[]; notes: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.inventoryResults().then(setD).catch((e: unknown) => setErr(String(e))); }, []);
  if (err) return <div className="text-xs text-red-400">{err.includes("401") ? "Inventory results need the API token (Settings → API token)." : err}</div>;
  if (!d) return <div className="text-xs text-muted">loading results…</div>;
  const graded = d.copies.filter((c) => c.graded && !c.rescan);
  return (
    <div className="bg-surface border border-border rounded-md p-3 space-y-3 text-xs">
      <div>
        <div className="font-semibold">Pre-grade vs real grades</div>
        <p className="text-muted mt-0.5 max-w-3xl">
          Copies we own, scanned in hand and later graded: did the pre-grader's odds of a 10 hold up? {graded.length} graded of{" "}
          {d.copies.filter((c) => !c.rescan).length} in inventory.
        </p>
      </div>
      {graded.length === 0 ? (
        <div className="text-muted">No graded inventory copies yet. Grades arrive from the admin app (or the tracker) as outcomes.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="text-[10px] text-muted">
              <tr><th className="text-left py-1">grader</th><th className="text-right">graded</th><th className="text-right">10s</th>
                <th className="text-right px-2">actual 10 rate</th><th className="text-right px-2">predicted (scan)</th>
                <th className="text-right px-2">predicted (listing)</th><th className="text-right px-2">average copy</th><th className="text-right px-2" title="lower is better">Brier</th></tr>
            </thead>
            <tbody>
              {d.summary.filter((s) => s.graded > 0).map((s) => (
                <tr key={s.grader} className="border-t border-border">
                  <td className="py-1 font-semibold">{s.grader}</td><td className="text-right font-mono">{s.graded}</td><td className="text-right font-mono">{s.tens}</td>
                  <td className="text-right font-mono px-2 text-accent">{pc(s.actual_rate)}</td><td className="text-right font-mono px-2">{pc(s.scan_p10)}</td>
                  <td className="text-right font-mono px-2">{pc(s.listing_p10)}{s.listing_n ? <span className="text-muted"> ({s.listing_n})</span> : null}</td>
                  <td className="text-right font-mono px-2">{pc(s.expected_p10)}</td><td className="text-right font-mono px-2">{s.brier?.toFixed(3) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.copies.length > 0 && (
        <details>
          <summary className="cursor-pointer text-muted">per copy ({d.copies.length})</summary>
          <div className="overflow-x-auto mt-1">
            <table className="w-full">
              <tbody>
                {d.copies.map((c) => (
                  <tr key={c.copy_id} className={`border-t border-border ${c.rescan ? "opacity-50" : ""}`}>
                    <td className="py-1"><Link to={`/copies/${c.copy_id}`} className="hover:text-accent">{c.card_name} {c.card_number}</Link> <span className="text-muted">{c.set_name}</span></td>
                    <td>{c.listing_copy_id ? <Link to={`/copies/${c.listing_copy_id}`} className="text-muted hover:text-accent">listing #{c.listing_copy_id}</Link> : <span className="text-muted">off-board</span>}</td>
                    <td className="font-mono text-right px-2" title="scan / listing / average copy">{pc(c.scan_p10)} <span className="text-muted">/ {pc(c.listing_p10)} / {pc(c.expected_p10)}</span></td>
                    <td className="px-2">{c.graded ? <span className={c.graded.ten ? "text-green" : "text-red-400"}>{c.grader} {c.graded.grade}</span> : <span className="text-muted">not graded</span>}{c.rescan && <span className="text-muted"> · older scan</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <ul className="text-[10px] text-muted list-disc pl-4">{d.notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </div>
  );
}
