import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, imageUrl } from "../api";
import BatchLayoutEditor from "../components/BatchLayoutEditor";
import CenteringEditor from "../components/CenteringEditor";
import type { BatchCard, BatchDetail, BatchSheet, BatchSide, BatchSummary, BatchVerdict, CardHit, CenteringMeasurement, InnerMM, Pt, Quad } from "../types";

// Batch scans: many loose cards on one flatbed scan (a sheet of fronts, then
// the same cards flipped over in place), to pick out the well-centred ones
// fast. The worker finds each card, pairs its back by place and measures both
// sides with the in-hand scan engine. Nothing is a copy until "Pre-grade" (the
// card is chosen and an in-hand scan copy is made from the crops).

const VERDICT: Record<BatchVerdict, { label: string; cls: string; hint: string }> = {
  centered: { label: "PSA 10 centering", cls: "text-green border-green", hint: "front 60/40 and back 75/25 or better, even at the far end of the measuring error" },
  borderline: { label: "borderline", cls: "text-yellow border-yellow", hint: "within PSA 10 centering only at the near end of the measuring error" },
  off_center: { label: "off-center", cls: "text-muted border-border", hint: "outside PSA 10 centering even at the near end of the measuring error" },
  front_only: { label: "front only", cls: "text-muted border-border", hint: "no back found in its place on the backs sheet" },
  back_only: { label: "back only", cls: "text-muted border-border", hint: "no front found in its place on the fronts sheet" },
  unmeasured: { label: "not measured", cls: "text-muted border-border", hint: "the engine couldn't find this card's borders" },
};

const pct = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const split = (v: number | null) => (v == null ? "–" : `${v.toFixed(1)}/${(100 - v).toFixed(1)}`);
const place = (c: BatchCard) => `sheet ${c.sheet_no} · #${c.pos}${c.row ? ` · row ${c.row}, col ${c.col}` : ""}`;

export function BatchScans() {
  const [items, setItems] = useState<BatchSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    api.listBatches().then((r) => setItems(r.batches)).catch((e) => setErr(String(e.message ?? e)));
  }, []);
  useEffect(load, [load]);
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="text-xs text-muted"><Link to="/factory" className="hover:text-accent">factory</Link> / batch scans</div>
        <h1 className="text-lg font-semibold mt-1">Batch scans</h1>
        <p className="text-muted text-xs mt-1 max-w-3xl">
          Scan a handful of loose cards at once to find the well-centred ones. Lay them face up on the scanner with a gap
          between cards (a few mm is enough) and scan; then flip each card over <em>where it lies</em> and scan again.
          Upload the scanner's PDF (fronts and backs pages, in any order: each page's side is recognised) or the images.
          Every card gets its front and back centering, a PSA 10 centering verdict and the odds of a 10 for an average card.
          Nothing is tracked until you pre-grade a card: then you pick which card it is and it becomes an in-hand scan copy
          with its own odds.
        </p>
      </div>
      <NewBatch />
      <div>
        <h2 className="text-sm font-semibold mb-2">Batches</h2>
        {err && <div className="text-red-400 text-xs">{err}</div>}
        {items === null ? <div className="text-muted text-xs">loading…</div> : items.length === 0 ? (
          <div className="text-muted text-xs">None yet.</div>
        ) : (
          <table className="text-xs w-full">
            <thead className="text-muted text-left">
              <tr><th className="py-1">batch</th><th>status</th><th>files</th><th>cards</th><th>pre-graded</th><th>uploaded</th><th /></tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="py-1"><Link to={`/factory/batch/${b.id}`} className="text-accent hover:underline">{b.name}</Link></td>
                  <td><Status b={b} /></td>
                  <td className="text-muted">{b.files.length}</td>
                  <td>{b.cards || "–"}</td>
                  <td>{b.promoted || "–"}</td>
                  <td className="text-muted">{new Date(b.created_at).toLocaleString()}</td>
                  <td className="text-right">
                    <button className="text-muted hover:text-red-400" onClick={() => {
                      if (!window.confirm(`Delete "${b.name}" and its scans? Pre-graded copies stay.`)) return;
                      api.deleteBatch(b.id).then(load).catch((e) => setErr(String(e.message ?? e)));
                    }}>delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Status({ b }: { b: BatchSummary }) {
  const cls = b.status === "ready" ? "text-green" : b.status === "failed" ? "text-red-400" : "text-yellow";
  const p = b.progress;
  return (
    <span className={cls} title={b.error ?? undefined}>
      {b.status === "processing" ? "measuring" : b.status === "pending" ? "queued" : b.status}
      {b.status === "processing" && p?.pages ? <span className="text-muted"> · page {p.pages}, {p.cards_measured} card sides</span> : null}
    </span>
  );
}

function NewBatch() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [setCode, setSetCode] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const tooBig = files.filter((f) => f.size > 95 * 1024 * 1024);
  const go = async () => {
    setErr(null);
    try {
      setBusy("creating");
      const { id } = await api.createBatch(name, setCode);
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        await api.uploadBatchFile(id, f, "auto", (p) => setBusy(`uploading ${f.name} (${i + 1}/${files.length}) ${Math.round(p * 100)}%`));
      }
      setBusy("starting");
      await api.startBatch(id);
      nav(`/factory/batch/${id}`);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
      setBusy(null);
    }
  };
  return (
    <div className="border border-border rounded p-3 space-y-2 text-xs">
      <div className="font-semibold">New batch</div>
      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1">
          <span className="text-muted">name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PAL booster box 2"
            className="w-56 bg-surface border border-border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1" title="optional: odds then use this set's graded copies (else all)">
          <span className="text-muted">set code (optional)</span>
          <input value={setCode} onChange={(e) => setSetCode(e.target.value)} placeholder="e.g. sv2"
            className="w-28 bg-surface border border-border rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">scans: PDF, JPEG, PNG or TIFF (95 MB each)</span>
          <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,image/tiff"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="text-xs" />
        </label>
        <button disabled={!files.length || !!busy || tooBig.length > 0} onClick={go}
          className="px-3 py-1 rounded border border-accent text-accent disabled:opacity-40 hover:bg-accent/10">
          Upload and measure
        </button>
      </div>
      {files.length > 1 && <div className="text-muted">Files are read in the order chosen: {files.map((f) => f.name).join(", ")}.</div>}
      {tooBig.length > 0 && <div className="text-red-400">{tooBig.map((f) => f.name).join(", ")}: over 95 MB. Split the PDF or scan as 600 dpi JPEG.</div>}
      {busy && <div className="text-yellow">{busy}…</div>}
      {err && <div className="text-red-400">{err}</div>}
      <div className="text-muted">Scan at 600 dpi if you can (300 works; centering is less precise). A white or light lid behind the cards works best.</div>
    </div>
  );
}

type Show = "good" | "all" | "hidden";
type Sort = "odds" | "place" | "worst";

export function BatchView() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const [d, setD] = useState<BatchDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [show, setShow] = useState<Show>("good");
  const [sort, setSort] = useState<Sort>("odds");
  const [focus, setFocus] = useState<number | null>(null);
  const [marking, setMarking] = useState(false);
  const load = useCallback(() => {
    api.getBatch(id).then(setD).catch((e) => setErr(String(e.message ?? e)));
  }, [id]);
  useEffect(load, [load]);
  const busy = d && (d.batch.status === "pending" || d.batch.status === "processing");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [busy, load]);

  const cards = useMemo(() => {
    if (!d) return [];
    let cs = d.cards.filter((c) => (show === "hidden" ? c.hidden : !c.hidden));
    if (show === "good") cs = cs.filter((c) => c.verdict === "centered" || c.verdict === "borderline" || c.copy_id);
    const worst = (c: BatchCard) => Math.max(c.worse_side?.front ?? 99, (c.worse_side?.back ?? 99) / 2.5);
    return [...cs].sort((a, b) =>
      sort === "place" ? a.sheet_no - b.sheet_no || a.pos - b.pos
        : sort === "worst" ? worst(a) - worst(b)
          : (b.p10?.PSA ?? -1) - (a.p10?.PSA ?? -1) || worst(a) - worst(b));
  }, [d, show, sort]);

  if (err) return <div className="text-red-400 text-xs">{err}</div>;
  if (!d) return <div className="text-muted text-xs">loading…</div>;
  const b = d.batch;
  const counts = d.cards.filter((c) => !c.hidden).reduce((m, c) => ({ ...m, [c.verdict]: (m[c.verdict] ?? 0) + 1 }), {} as Record<string, number>);
  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-muted">
          <Link to="/factory" className="hover:text-accent">factory</Link> / <Link to="/factory/batch" className="hover:text-accent">batch scans</Link> / {b.name}
        </div>
        <h1 className="text-lg font-semibold mt-1">{b.name}</h1>
        <div className="text-xs mt-1 flex flex-wrap gap-3 items-center">
          <Status b={b} />
          {b.status === "ready" && (
            <span>
              {b.cards} cards: <span className="text-green">{counts.centered ?? 0} PSA 10 centering</span>
              {" · "}<span className="text-yellow">{counts.borderline ?? 0} borderline</span>
              {" · "}{counts.off_center ?? 0} off-center
              {(counts.front_only || counts.back_only || counts.unmeasured) ? ` · ${(counts.front_only ?? 0) + (counts.back_only ?? 0) + (counts.unmeasured ?? 0)} incomplete` : ""}
              {b.promoted ? ` · ${b.promoted} pre-graded` : ""}
            </span>
          )}
          {b.set_code && <span className="text-muted">set {b.set_code}</span>}
          {(b.status === "failed" || b.status === "ready") && (
            <button className="text-muted hover:text-accent" title="measure the uploads again (after an engine update)"
              onClick={() => api.startBatch(id).then(load).catch((e) => setErr(String(e.message ?? e)))}>re-measure</button>
          )}
          {(b.status === "failed" || b.status === "ready") && !marking && (
            <button className="text-muted hover:text-accent" title="draw a box around each card yourself and number fronts and backs (for cards in toploaders or sleeves)"
              onClick={() => setMarking(true)}>mark cards by hand</button>
          )}
          {b.layout && <span className="text-accent" title="the cards were marked by hand; front N is paired with back N">marked by hand</span>}
        </div>
        {b.error && <div className="text-red-400 text-xs mt-1">{b.error}</div>}
        {busy && <div className="text-yellow text-xs mt-1">Measuring: a 9-card sheet takes about a minute per side. This page updates by itself.</div>}
        {b.status === "ready" && !b.layout && !marking && (b.warnings ?? []).some((w) => /no cards found|touching|no backs page/.test(w)) && (
          <div className="text-xs mt-1">
            Some cards weren't found or paired (holders, sleeves or a sheet protector hide their edges).{" "}
            <button className="text-accent hover:underline" onClick={() => setMarking(true)}>Mark them by hand →</button>
          </div>
        )}
        {marking && <div className="mt-3"><BatchLayoutEditor d={d} onClose={() => setMarking(false)} onSaved={load} /></div>}
        {(b.warnings ?? []).length > 0 && (
          <ul className="text-yellow text-xs mt-2 list-disc ml-4">{b.warnings!.map((w, i) => <li key={i}>{w}</li>)}</ul>
        )}
      </div>

      {d.sheets.length > 0 && (
        <details className="text-xs" open={d.sheets.length <= 2}>
          <summary className="cursor-pointer text-muted">sheets: find a card by its number</summary>
          <div className="flex flex-wrap gap-4 mt-2">
            {d.sheets.map((s) => <SheetView key={s.id} s={s} cards={d.cards} focus={focus} onPick={setFocus} />)}
          </div>
        </details>
      )}

      {d.cards.length > 0 && (
        <div className="flex flex-wrap gap-4 items-center text-xs">
          <span className="flex gap-1">
            {(["good", "all", "hidden"] as Show[]).map((v) => (
              <button key={v} onClick={() => setShow(v)}
                className={`px-2 py-0.5 rounded border ${show === v ? "border-accent text-accent" : "border-border text-muted"}`}>
                {v === "good" ? "PSA 10 centering + borderline" : v}
              </button>
            ))}
          </span>
          <label className="text-muted">sort{" "}
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-surface border border-border rounded px-1">
              <option value="odds">PSA 10 odds</option>
              <option value="worst">best centering</option>
              <option value="place">place on the sheet</option>
            </select>
          </label>
          <span className="text-muted">{cards.length} shown</span>
        </div>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))" }}>
        {cards.map((c) => (
          <CardTile key={c.id} c={c} batchId={id} all={d.cards} focused={focus === c.id} onChange={load} onFocus={() => setFocus(c.id)} />
        ))}
      </div>
      {b.status === "ready" && cards.length === 0 && d.cards.length > 0 && (
        <div className="text-muted text-xs">No cards here: try "all".</div>
      )}
      <ul className="text-muted text-[11px] list-disc ml-4 max-w-3xl">
        {d.notes.map((n, i) => <li key={i}>{n}</li>)}
      </ul>
    </div>
  );
}

function SheetView({ s, cards, focus, onPick }: { s: BatchSheet; cards: BatchCard[]; focus: number | null; onPick: (id: number) => void }) {
  const mine = cards.filter((c) => c.sheet_no === s.sheet_no);
  const side = (which: "front" | "back") => {
    const prev = which === "front" ? s.front_preview : s.back_preview;
    const size = which === "front" ? s.front_size : s.back_size;
    if (!prev || !size) return null;
    const W = 300;
    const k = W / size[0];
    return (
      <div style={{ width: W }}>
        <div className="text-muted mb-1">sheet {s.sheet_no} · {which}s{which === "back" && s.pairing?.layout && s.pairing.layout !== "in_place"
          ? ` (flipped as a block: ${s.pairing.layout === "mirror_lr" ? "left ↔ right" : "top ↔ bottom"})` : ""}</div>
        <div className="relative">
        <img src={imageUrl(prev)} alt="" className="block w-full rounded" />
        <svg className="absolute left-0 top-0" width={W} height={size[1] * k} viewBox={`0 0 ${W} ${size[1] * k}`}>
          {mine.map((c) => {
            const q = c[which]?.quad;
            if (!q) return null;
            const cx = (q[0][0] + q[2][0]) / 2 * k, cy = (q[0][1] + q[2][1]) / 2 * k;
            const hot = focus === c.id;
            const col = c.verdict === "centered" ? "#3fb950" : c.verdict === "borderline" ? "#d29922" : "#8b949e";
            return (
              <g key={c.id} className="cursor-pointer" onClick={() => onPick(c.id)}>
                <polygon points={q.map((p) => `${p[0] * k},${p[1] * k}`).join(" ")} fill={hot ? "rgba(88,166,255,0.25)" : "none"}
                  stroke={hot ? "#58a6ff" : col} strokeWidth={hot ? 2.5 : 1.5} />
                <circle cx={cx} cy={cy} r={11} fill="#0d1117" stroke={col} />
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fill="#e6edf3">{c.pos}</text>
              </g>
            );
          })}
        </svg>
        </div>
      </div>
    );
  };
  return (
    <div className="flex gap-3">
      {side("front")}
      {side("back")}
      {(s.warnings ?? []).length > 0 && <div className="text-yellow max-w-[200px]">{s.warnings!.join("; ")}</div>}
    </div>
  );
}

function SideThumb({ s, label, onOpen }: { s: BatchSide | null; label: string; onOpen: () => void }) {
  if (!s) return <div className="w-[150px] h-[205px] border border-dashed border-border rounded flex items-center justify-center text-muted">no {label}</div>;
  const k = 150 / s.crop_size[0];
  const h = s.crop_size[1] * k;
  const poly = (q: Pt[] | null) => q?.map((p) => `${p[0] * k},${p[1] * k}`).join(" ");
  return (
    <button type="button" onClick={onOpen} className="relative block" style={{ width: 150, height: h }} title={`examine the ${label}: zoom, corners, move the centering lines`}>
      <img src={imageUrl(s.thumb)} alt={label} className="block w-full h-full rounded" loading="lazy" />
      <svg className="absolute inset-0" width={150} height={h}>
        {s.outer && <polygon points={poly(s.outer)} fill="none" stroke="#58a6ff" strokeWidth={1} />}
        {s.inner && <polygon points={poly(s.inner)} fill="none" stroke="#bc8cff" strokeWidth={1} />}
      </svg>
      {s.adjusted_by && <span className="absolute top-1 left-1 text-[9px] bg-bg/80 text-accent rounded px-1">adjusted</span>}
    </button>
  );
}

function CardTile({ c, batchId, all, focused, onChange, onFocus }: {
  c: BatchCard; batchId: number; all: BatchCard[]; focused: boolean; onChange: () => void; onFocus: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focused) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [focused]);
  const [picking, setPicking] = useState<false | "promote" | "name">(false);
  const [examine, setExamine] = useState<"front" | "back" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const v = VERDICT[c.verdict];
  const flags = [...(c.front?.flags ?? []), ...(c.back?.flags ?? [])].filter((f) =>
    ["low_resolution", "card_cut_off", "corners_not_found", "low_edge_contrast", "engine_error"].includes(f));
  const sameSheet = all.filter((o) => o.sheet_no === c.sheet_no && o.id !== c.id && !o.copy_id);
  return (
    <div ref={ref} className={`border rounded p-2 text-xs space-y-2 ${focused ? "border-accent" : "border-border"}`} onClick={onFocus}>
      <div className="flex items-center gap-2">
        <span className={`px-1.5 py-0.5 rounded border ${v.cls}`} title={v.hint}>{v.label}</span>
        <span className="text-muted">{place(c)}</span>
        {c.p10?.PSA != null && <span className="ml-auto" title="odds of a PSA 10 for an average card with this centering">PSA 10 <b>{pct(c.p10.PSA)}</b></span>}
      </div>
      <div className="flex gap-2">
        <SideThumb s={c.front} label="front" onOpen={() => setExamine("front")} />
        <SideThumb s={c.back} label="back" onOpen={() => setExamine("back")} />
      </div>
      {examine && <Examine c={c} batchId={batchId} initial={examine} onClose={() => setExamine(null)} onChange={onChange} />}
      <table className="w-full">
        <tbody>
          <tr><td className="text-muted w-14">front</td><td>L/R {split(c.front?.lr ?? null)}</td><td>T/B {split(c.front?.tb ?? null)}</td></tr>
          <tr><td className="text-muted">back</td><td>L/R {split(c.back?.lr ?? null)}</td><td>T/B {split(c.back?.tb ?? null)}</td></tr>
        </tbody>
      </table>
      <div className="text-muted flex flex-wrap gap-x-3">
        {c.err_pp > 0 && <span title="measuring error, percentage points">± {c.err_pp}</span>}
        {c.psa_cap && <span title="best PSA grade the centering allows">PSA centering cap {c.psa_cap}</span>}
        {c.p10 && Object.entries(c.p10).filter(([g]) => g !== "PSA").map(([g, p]) => <span key={g}>{g} 10 {pct(p)}</span>)}
        {flags.length > 0 && <span className="text-yellow" title={flags.join(", ")}>check outline</span>}
      </div>
      <RankLine c={c} />
      {err && <div className="text-red-400">{err}</div>}
      <div className="flex flex-wrap gap-2 items-center" onClick={(e) => e.stopPropagation()}>
        {c.copy_id ? (
          <Link to={`/copies/${c.copy_id}`} className="text-accent hover:underline">pre-graded: {c.card_name ?? `copy ${c.copy_id}`} →</Link>
        ) : picking ? (
          <CardPicker onCancel={() => setPicking(false)} onPick={(card) => {
            (picking === "name" ? api.nameBatchCard(batchId, c.id, card.id) : api.promoteBatchCard(batchId, c.id, card.id))
              .then(() => { setPicking(false); onChange(); })
              .catch((e) => setErr(String(e.message ?? e)));
          }} />
        ) : (
          <>
            {c.card_name ? (
              <span className="w-full flex items-center gap-2">
                <span title="named: odds use this card's own levels and PSA gem rate">{c.card_name}</span>
                <button className="text-muted hover:text-accent" onClick={() => setPicking("name")}>change</button>
                <button className="text-muted hover:text-accent" onClick={() => api.nameBatchCard(batchId, c.id, 0).then(onChange).catch((x) => setErr(String(x.message ?? x)))}>clear</button>
              </span>
            ) : (
              <button className="text-muted hover:text-accent" onClick={() => setPicking("name")}
                title="say which card this is (no copy is made): the odds and rank use its own PSA gem rate and graded copies">name card</button>
            )}
            <button disabled={!c.front || !c.back} onClick={() => setPicking("promote")}
              title={c.front && c.back ? "choose the card; it becomes an in-hand scan copy with its own odds" : "needs a front and a back"}
              className="px-2 py-0.5 rounded border border-accent text-accent disabled:opacity-40 hover:bg-accent/10">Pre-grade</button>
            {c.back && sameSheet.length > 0 && (
              <select value="" className="bg-surface border border-border rounded px-1 text-muted"
                title="wrong back? swap it with another card's"
                onChange={(e) => api.swapBatchBack(batchId, c.id, Number(e.target.value)).then(onChange).catch((x) => setErr(String(x.message ?? x)))}>
                <option value="">swap back with…</option>
                {sameSheet.map((o) => <option key={o.id} value={o.id}>#{o.pos}</option>)}
              </select>
            )}
            <button className="text-muted hover:text-[#e6edf3] ml-auto"
              onClick={() => api.hideBatchCard(batchId, c.id, !c.hidden).then(onChange).catch((x) => setErr(String(x.message ?? x)))}>
              {c.hidden ? "unhide" : "hide"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CardPicker({ onPick, onCancel }: { onPick: (c: CardHit) => void; onCancel: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CardHit[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => { api.searchCards(q).then((r) => setHits(r.cards)).catch(() => setHits([])); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <span className="relative flex items-center gap-1 w-full">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="which card? e.g. sudowoodo 219"
        className="flex-1 bg-surface border border-border rounded px-1 py-0.5" />
      <button onClick={onCancel} className="text-muted hover:text-[#e6edf3]" aria-label="cancel">×</button>
      {hits.length > 0 && (
        <div className="absolute z-20 top-full mt-1 w-full max-h-72 overflow-auto bg-surface border border-border rounded shadow-lg">
          {hits.map((c) => (
            <button key={c.id} onClick={() => onPick(c)} className="w-full flex items-center gap-2 px-2 py-1 text-left hover:bg-bg">
              {c.image_url ? <img src={c.image_url} alt="" className="w-6 h-8 object-contain" /> : <span className="w-6" />}
              <span className="flex-1">{c.card_name} <span className="text-muted">{c.card_number} · {c.set_name} ({c.language})</span></span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** where the centering ranks among graded copies, and the card's PSA gem rate */
function RankLine({ c }: { c: BatchCard }) {
  if (!c.rank?.length && !c.psa_gem_rate) return null;
  return (
    <div className="space-y-0.5">
      {c.rank?.map((r) => (
        <div key={r.grade} title={`better centered than this share of ${r.n} measured ${r.grade} copies of ${r.of}. Overall weighs front and back as the PSA model does; front / back use each side's worse axis.`}>
          better centered than <b className={r.overall >= 50 ? "text-green" : r.overall >= 25 ? "text-yellow" : ""}>{r.overall}%</b> of {r.grade}s
          <span className="text-muted"> · front {r.front}% · back {r.back}% · {r.n} of {r.of}</span>
        </div>
      ))}
      {c.psa_gem_rate && (
        <div className="text-muted" title="PSA population gem rate (GemRate): the odds above start from it">
          PSA gem rate {c.psa_gem_rate.pct}% of {c.psa_gem_rate.pop_total.toLocaleString()} graded
        </div>
      )}
    </div>
  );
}

/** a batch side as a centering measurement, for the editor */
function asMeasurement(s: BatchSide, side: "front" | "back"): CenteringMeasurement {
  const mm = s.inner_mm;
  const inner: InnerMM | null = mm && mm.left != null && mm.right != null && mm.top != null && mm.bottom != null
    ? { left: mm.left, right: mm.right, top: mm.top, bottom: mm.bottom } : null;
  return {
    id: s.adjusted_by ? 2 : 1, image_id: 0, side, image_sha256: null, supersedes: null,
    outer_quad: s.outer && s.outer.length === 4 ? (s.outer.map((p) => [p[0], p[1]]) as Quad) : null,
    px_per_mm: null, inner_mm: inner, lr_left_pct: s.lr, tb_top_pct: s.tb, lr_err_pp: s.lr_err, tb_err_pp: s.tb_err,
    rotation_deg: null, placed_by: s.adjusted_by ?? "auto", detector_version: s.engine ?? "batch",
    status: s.adjusted_by ? "accepted" : "proposed", flags: s.flags ?? [], tags: [], note: null, created_at: "",
  };
}

/** full-size look at one card: zoom, corners, and the centering lines to move */
function Examine({ c, batchId, initial, onClose, onChange }: {
  c: BatchCard; batchId: number; initial: "front" | "back"; onClose: () => void; onChange: () => void;
}) {
  const [side, setSide] = useState<"front" | "back">(initial);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const s = c[side];
  const ms = useMemo(() => (s ? [asMeasurement(s, side)] : []), [s, side]);
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-start justify-center overflow-auto p-4" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="bg-bg border border-border rounded-md p-3 space-y-2 max-w-[1100px] w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 text-xs">
          <span className="font-semibold">{place(c)}{c.card_name ? ` · ${c.card_name}` : ""}</span>
          {(["front", "back"] as const).map((v) => (
            <button key={v} disabled={!c[v]} onClick={() => setSide(v)}
              className={`px-2 py-0.5 rounded border disabled:opacity-40 ${side === v ? "border-accent text-accent" : "border-border text-muted"}`}>{v}</button>
          ))}
          {s?.adjusted_by && (
            <button className="text-muted hover:text-accent" title={`engine: L/R ${split(s.auto?.lr ?? null)} · T/B ${split(s.auto?.tb ?? null)}`}
              onClick={() => api.resetBatchCentering(batchId, c.id, side).then(onChange).catch((x) => setErr(String(x.message ?? x)))}>
              reset to the engine's lines
            </button>
          )}
          <a href={s ? imageUrl(s.crop) : undefined} target="_blank" rel="noreferrer" className="text-muted hover:text-accent">open the scan</a>
          <button onClick={onClose} className="ml-auto text-muted hover:text-[#e6edf3]" aria-label="close">close ×</button>
        </div>
        {err && <div className="text-red-400 text-xs">{err}</div>}
        <RankLine c={c} />
        {s ? (
          <CenteringEditor key={`${c.id}-${side}-${s.adjusted_by ?? "auto"}-${s.lr}-${s.tb}`} copyId={0} side={side} imagePath={s.crop}
            measurements={ms} onSaved={() => {}}
            saveTo={(q, inner) => api.adjustBatchCentering(batchId, c.id, side, q, inner).then(() => { setErr(null); onChange(); })} />
        ) : <div className="text-muted text-xs">No {side} scan for this card.</div>}
        <div className="text-[11px] text-muted">
          Saving moves this card's lines in the batch only; corner looks aren't saved here. Pre-grading still measures the copy afresh.
        </div>
      </div>
    </div>
  );
}
