import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import type { CardAnalytics as CA, Prediction } from "../../types";

// One card: what the factory has measured for it (centering by grade = the
// backtest), and grade odds for a raw copy from its photos (POST /v1/predict,
// the same call the tracker app uses).

const ratio = (d: number) => `${Math.round(50 + d)}/${Math.round(50 - d)}`;

export default function CardAnalytics() {
  const { id } = useParams<{ id: string }>();
  const cardId = Number(id);
  const [data, setData] = useState<CA | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.getCardAnalytics(cardId).then(setData).catch((e: unknown) => setErr(String(e))); }, [cardId]);

  if (err) return <div className="text-red-400 py-12 text-center">{err}</div>;
  if (!data) return <div className="text-muted py-12 text-center">Loading…</div>;
  const c = data.card;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link to="/" className="hover:text-accent">Analytics</Link><span className="text-border">/</span>
        <Link to="/games/pokemon" className="hover:text-accent">Pokémon</Link><span className="text-border">/</span>
        <Link to={`/sets/${encodeURIComponent(c.set_code)}`} className="hover:text-accent">{c.set_name}</Link><span className="text-border">/</span>
        <span className="text-[#e6edf3]">{c.card_name}</span>
      </div>

      <div className="flex flex-wrap gap-4">
        {c.image_url ? <img src={c.image_url} alt="" className="w-40 rounded border border-border" /> : <div className="w-40 aspect-[5/7] bg-surface rounded" />}
        <div className="flex-1 min-w-72 space-y-2">
          <h1 className="text-lg font-semibold">{c.card_name}</h1>
          <div className="text-xs text-muted">{c.set_name} · #{c.card_number} · {c.game}</div>
          {data.psa_gem_rate && (
            <div className="text-xs">PSA population gem rate <span className="text-green font-semibold">{data.psa_gem_rate.pct}%</span>
              <span className="text-muted"> of {data.psa_gem_rate.pop_total.toLocaleString()} graded (GemRate)</span></div>
          )}
          <div className="flex gap-3 text-xs">
            <Link to={`/copies?card_id=${c.id}`} className="text-accent hover:underline">all copies of this card →</Link>
            <Link to={`/copies?card_id=${c.id}&centering=proposed`} className="text-accent hover:underline">copies to validate →</Link>
            <Link to={`/intake?card_id=${c.id}`} className="text-accent hover:underline">+ add a copy</Link>
          </div>
        </div>
      </div>

      <section className="bg-surface border border-border rounded-md p-4">
        <div className="text-sm font-semibold">Centering by grade (backtest)</div>
        <p className="text-[11px] text-muted mt-1 mb-3 max-w-3xl">
          How off-centre this card's graded copies are, by the grade they got: the worse side's split, front and back
          (10th · median · 90th percentile). Validated = a person checked the measurement; the rest are the engine's.
          The prediction below uses these copies plus the same set, rarity and era, weighted by how close they are.
        </p>
        {data.centering_by_grade.length === 0 ? <div className="text-xs text-muted">No measured graded copies of this card yet.</div> : (
          <table className="text-xs w-full max-w-3xl">
            <thead><tr className="text-muted text-left border-b border-border">
              <th className="py-1">grade</th><th>copies</th><th>validated</th><th>front (worse side)</th><th>back (worse side)</th>
            </tr></thead>
            <tbody>
              {data.centering_by_grade.map((b) => (
                <tr key={b.grader + b.grade} className="border-b border-[#1c2128]">
                  <td className="py-1 font-semibold">{b.grader} {b.grade}</td>
                  <td>{b.copies}</td><td>{b.validated}</td>
                  <td className="font-mono">{b.front_worse_side_q?.map(ratio).join(" · ")}</td>
                  <td className="font-mono">{b.back_worse_side_q?.map(ratio).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Predictor cardId={c.id} />
    </div>
  );
}

function Predictor({ cardId }: { cardId: number }) {
  const [params, setParams] = useSearchParams();
  const pid = Number(params.get("prediction")) || null;
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [pred, setPred] = useState<Prediction | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const poll = useCallback((id: number) => {
    api.getPrediction(id).then((p) => {
      setPred(p);
      if (p.status === "measuring") timer.current = window.setTimeout(() => poll(id), 15000);
    }).catch((e: unknown) => setErr(String(e)));
  }, []);
  useEffect(() => {
    if (pid) poll(pid);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [pid, poll]);

  const submit = async () => {
    if (!front || !back) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.predict(cardId, front, back);
      setParams({ prediction: String(r.copy_id) });
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-surface border border-border rounded-md p-4 space-y-3">
      <div className="text-sm font-semibold">Predict a raw copy</div>
      <p className="text-[11px] text-muted max-w-3xl">
        Front and back photos of a raw copy (straight-on, whole card, flat). Centering is measured in a few minutes, then the
        odds come from the backtest. The tracker app does the same with <code className="text-accent">POST /v1/predict</code>.
      </p>
      {!pid && (
        <div className="flex flex-wrap gap-3 items-end">
          <Drop label="front" file={front} onFile={setFront} />
          <Drop label="back" file={back} onFile={setBack} />
          <button disabled={!front || !back || busy} onClick={submit}
            className="bg-accent text-bg font-semibold px-4 py-1.5 rounded text-sm disabled:opacity-40">{busy ? "Uploading…" : "Predict"}</button>
        </div>
      )}
      {err && <div className="text-red-400 text-xs">{err}</div>}
      {pid && pred && <PredictionView p={pred} onNew={() => { setParams({}); setPred(null); setFront(null); setBack(null); }} />}
    </section>
  );
}

function Drop({ label, file, onFile }: { label: string; file: File | null; onFile: (f: File) => void }) {
  return (
    <label className="w-32 aspect-[5/7] border border-dashed border-border rounded flex items-center justify-center text-[10px] text-muted text-center cursor-pointer hover:border-accent/60 overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}>
      {file ? <img src={URL.createObjectURL(file)} alt={label} className="w-full h-full object-contain" /> : `drop or choose the ${label}`}
      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </label>
  );
}

function PredictionView({ p, onNew }: { p: Prediction; onNew: () => void }) {
  const side = (s: "front" | "back") => {
    const m = p.centering[s];
    if (!m || m.lr == null || m.tb == null) return <span className="text-muted">measuring…</span>;
    const lr = m.lr, tb = m.tb;
    return (
      <span className="font-mono">
        L/R {lr.toFixed(1)}/{(100 - lr).toFixed(1)} · T/B {tb.toFixed(1)}/{(100 - tb).toFixed(1)}
        <span className="text-muted"> ±{m.err_pp.toFixed(1)} · {m.validated ? "validated" : "auto"}</span>
        <Link to={`/copies/${p.copy_id}`} className="text-accent hover:underline ml-2">check / adjust</Link>
      </span>
    );
  };
  return (
    <div className="space-y-3">
      <div className="text-xs space-y-0.5">
        <div>Front: {side("front")}</div>
        <div>Back: {side("back")}</div>
      </div>
      {p.status === "measuring" && <div className="text-xs text-yellow">Measuring centering… (checks again every 15 s)</div>}
      {p.status === "unmeasurable" && <div className="text-xs text-red-400">The engine couldn't measure these photos. Retake them straight-on with the whole card visible, or adjust the measurement.</div>}
      {p.predictions?.map((g) => (
        <div key={g.grader} className="space-y-1">
          <div className="text-xs font-semibold">{g.grader}{g.centering_cap && g.centering_cap !== "10" && <span className="text-red-400 font-normal"> · centering caps it at {g.centering_cap}</span>}</div>
          {g.outcomes.map((o) => (
            <div key={o.grade} className="flex items-center gap-2 text-xs">
              <span className="w-24">{g.grader} {o.grade}</span>
              <div className="flex-1 max-w-md h-3 bg-bg rounded overflow-hidden">
                <div className="h-full bg-accent" style={{ width: `${Math.round(o.p * 100)}%` }} />
              </div>
              <span className="w-12 font-mono text-right">{Math.round(o.p * 100)}%</span>
              <span className="text-[10px] text-muted">start {Math.round(o.prior * 100)}% · {o.in_bucket ?? 0} of {o.copies} measured copies at this centering</span>
            </div>
          ))}
          <div className="text-[10px] text-muted">start: {g.prior_source}{g.note ? ` · ${g.note}` : ""}</div>
        </div>
      ))}
      {p.comparables && (
        <div className="text-[10px] text-muted">
          comparables: {Object.entries(p.comparables).map(([k, v]) => `${v} ${k.replace("_", " + ")}`).join(" · ")}
        </div>
      )}
      <ul className="text-[10px] text-muted list-disc pl-4">{p.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
      <button onClick={onNew} className="text-xs border border-border rounded px-2 py-1 text-muted hover:text-accent">predict another copy</button>
    </div>
  );
}
