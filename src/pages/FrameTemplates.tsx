import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, imageUrl } from "../api";
import AuthImg from "../components/AuthImg";
import { warp } from "../components/CenteringEditor";
import { currentSession } from "../lib/auth";
import type { BorderlessCard, CardDetail, CardTemplate, CenteringMeasurement, CertRow, Quad, TemplateSides } from "../types";

// Frame templates: a card's frame of reference for designs without a printed
// border. Pick a reference copy and confirm its cut, place four lines on the
// straightened card, choose cherry-picked copies; the worker builds a draft and
// reads every copy with it (its cut found again from the design when the
// engine's missed); activate it once the readings look right.
//
// With the nominal from the copies' median the lines can sit anywhere on the
// design that's printed the same on every copy: the whole design is aligned,
// the lines only say what to measure from.

const CARD_W = 63, CARD_H = 88;
const PPMM = 7; // the straightened preview: 441 x 616 px
const SIDES = ["left", "right", "top", "bottom"] as const;
type Side = (typeof SIDES)[number];

interface CopyFront { copy: CertRow; imageId: number | null; quad: Quad | null; path: string | null; status: string | null }

function frontOf(ms: CenteringMeasurement[]): CenteringMeasurement | null {
  const f = ms.filter((m) => m.side === "front" && m.status !== "superseded" && m.outer_quad);
  f.sort((a, b) => (Number(b.status === "accepted") - Number(a.status === "accepted")) || b.id - a.id);
  return f[0] ?? null;
}

const fmt = (v: number | null | undefined, d = 2) => (v == null ? "–" : v.toFixed(d));

export default function FrameTemplates() {
  const [params, setParams] = useSearchParams();
  const cardId = Number(params.get("card")) || null;
  const [cands, setCands] = useState<BorderlessCard[] | null>(null);
  const [defined, setDefined] = useState<CardTemplate[]>([]);
  const [idInput, setIdInput] = useState("");
  useEffect(() => {
    api.borderlessCandidates().then(setCands).catch(() => setCands([]));
    api.listTemplates({ defined: "1" }).then((r) => setDefined(r.templates)).catch(() => {});
  }, []);
  const status = useMemo(() => new Map(defined.map((t) => [t.key, t.status])), [defined]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link to="/factory" className="hover:text-accent">← Pre-grading factory</Link><span className="text-border">/</span>
        <Link to="/factory/templates" className="hover:text-accent">Card templates</Link><span className="text-border">/</span>
        <span className="text-[#e6edf3]">Frame templates (borderless)</span>
      </div>
      <p className="text-xs text-muted max-w-4xl">
        For cards without a printed border (Riftbound's alt arts, overnumbered, signatures): pick a reference copy and confirm
        its cut, place a frame of reference on the design, and check it on cherry-picked copies. Nothing is measured with it
        until you activate the draft. Cards with no template use the game's layout (Riftbound's gold frame) where it applies.
      </p>
      {!cardId ? (
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div>
            <div className="text-xs font-semibold mb-1">Riftbound cards, most copies first</div>
            {!cands ? <div className="text-xs text-muted">loading…</div> : (
              <table className="text-xs w-full">
                <thead><tr className="text-muted text-left border-b border-border"><th></th><th>card</th><th>copies</th><th>template</th><th></th></tr></thead>
                <tbody>{cands.slice(0, 60).map((c) => (
                  <tr key={c.id} className="border-b border-[#1c2128]">
                    <td className="py-1">{c.image_url ? <img src={c.image_url} alt="" loading="lazy" className="w-8 h-11 object-contain" /> : null}</td>
                    <td>{c.card_name}<div className="text-[10px] text-muted">{c.set_name} · #{c.card_number}{c.rarity ? ` · ${c.rarity}` : ""}</div></td>
                    <td className="font-mono">{c.copies}</td>
                    <td className="text-[10px]">{status.get(String(c.id)) ?? <span className="text-muted">none</span>}</td>
                    <td><button onClick={() => setParams({ card: String(c.id) })} className="text-accent hover:underline">set up →</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold">Any card by id</div>
            <div className="flex gap-1">
              <input value={idInput} onChange={(e) => setIdInput(e.target.value)} placeholder="card id" className="bg-bg border border-border rounded px-2 py-1 text-xs w-28" />
              <button onClick={() => Number(idInput) && setParams({ card: idInput })} className="text-xs bg-accent text-bg rounded px-2">open</button>
            </div>
            <div className="text-xs font-semibold pt-2">Defined templates</div>
            {defined.length === 0 ? <div className="text-[11px] text-muted">none yet</div> : defined.map((t) => (
              <button key={t.key} onClick={() => setParams({ card: t.key })} className="block text-left text-[11px] hover:text-accent">
                {t.card_name ?? `card ${t.key}`} <span className="text-muted">#{t.card_number} · {t.status}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Editor cardId={cardId} onBack={() => setParams({})} />
      )}
    </div>
  );
}

function Editor({ cardId, onBack }: { cardId: number; onBack: () => void }) {
  const [card, setCard] = useState<CardDetail | null>(null);
  const [fronts, setFronts] = useState<CopyFront[] | null>(null);
  const [tpl, setTpl] = useState<CardTemplate | null>(null);
  const [refId, setRefId] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [quad, setQuad] = useState<Quad | null>(null);
  const [frame, setFrame] = useState<TemplateSides>({ left: 4, right: 4, top: 4, bottom: 4 });
  const [nominal, setNominal] = useState<"median" | "layout" | "manual">("median");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadTpl = useCallback(() => api.listTemplates({ card_id: String(cardId) })
    .then((r) => { const t = r.templates.find((x) => x.kind === "front") ?? null; setTpl(t); return t; }), [cardId]);

  useEffect(() => {
    setErr(null);
    api.getCard(cardId).then(setCard).catch((e) => setErr(String(e)));
    api.listCertsForCard(cardId).then(async (cs) => {
      const withPhoto = cs.filter((c) => c.front_image);
      const out = await Promise.all(withPhoto.map(async (c) => {
        const ms = await api.getCentering(c.id).then((r) => r.measurements).catch(() => [] as CenteringMeasurement[]);
        const m = frontOf(ms);
        return { copy: c, imageId: m?.image_id ?? null, quad: m?.outer_quad ?? null, path: c.front_image, status: m?.status ?? null };
      }));
      setFronts(out);
      setChecked(new Set(out.map((f) => f.copy.id)));
    }).catch((e) => setErr(String(e)));
    loadTpl().then((t) => {
      if (!t) return;
      if (t.frame_mm) setFrame(t.frame_mm);
      if (t.label) setLabel(t.label);
      if (t.nominal_source === "median" || t.nominal_source === "layout" || t.nominal_source === "manual") setNominal(t.nominal_source);
      if (t.validation_copy_ids.length) setChecked(new Set(t.validation_copy_ids));
    }).catch(() => {});
  }, [cardId, loadTpl]);

  // a reference: the template's, else the sharpest copy with an outline
  useEffect(() => {
    if (!fronts || refId != null) return;
    const fromTpl = tpl?.reference?.image_id ? fronts.find((f) => f.imageId === tpl.reference!.image_id) : null;
    const pick = fromTpl ?? fronts.find((f) => f.quad) ?? null;
    if (pick) { setRefId(pick.copy.id); setQuad((fromTpl && tpl?.reference?.quad) || pick.quad); }
  }, [fronts, tpl, refId]);

  // while the worker builds it, check back
  useEffect(() => {
    if (tpl?.status !== "pending") return;
    const t = setInterval(() => { loadTpl().catch(() => {}); }, 5000);
    return () => clearInterval(t);
  }, [tpl?.status, loadTpl]);

  const ref = fronts?.find((f) => f.copy.id === refId) ?? null;

  const save = async () => {
    if (!ref?.imageId || !quad) return;
    setBusy(true); setErr(null);
    try {
      const t = await api.putTemplate(cardId, {
        mode: "frame", reference: { image_id: ref.imageId, quad }, frame_mm: frame, nominal,
        validation_copy_ids: [...checked], label: label || undefined, by: currentSession()?.email,
      });
      setTpl(t);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };
  const act = async (f: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await f(); await loadTpl(); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <button onClick={onBack} className="text-xs text-muted hover:text-accent">← all cards</button>
        <span className="font-semibold">{card?.card_name ?? `card ${cardId}`}</span>
        <span className="text-xs text-muted">{card?.set_name} · #{card?.card_number}</span>
        {tpl && <span className="text-xs rounded border border-border px-2 py-0.5">template: {tpl.status}{tpl.mode === "border" ? " (border)" : ""}</span>}
      </div>
      {err && <div className="text-red-400 text-xs break-all">{err}</div>}

      <section className="space-y-1">
        <div className="text-xs font-semibold">1 · Copies: the reference (◉) and the cherry-picked copies to check it on (☑)</div>
        {!fronts ? <div className="text-xs text-muted">loading…</div> : fronts.length === 0 ? <div className="text-xs text-muted">no copies with a front photo</div> : (
          <div className="flex flex-wrap gap-2">
            {fronts.map((f) => (
              <div key={f.copy.id} className={`rounded border p-1 w-28 text-[10px] ${refId === f.copy.id ? "border-accent" : "border-border"}`}>
                {f.path && <AuthImg src={imageUrl(f.path)} alt="" className="w-full h-36 object-contain bg-black/30" />}
                <div className="flex items-center justify-between mt-1">
                  <label className="flex items-center gap-1" title="the reference">
                    <input type="radio" checked={refId === f.copy.id} disabled={!f.quad} onChange={() => { setRefId(f.copy.id); setQuad(f.quad); }} />ref
                  </label>
                  <label className="flex items-center gap-1" title="check the template on this copy">
                    <input type="checkbox" checked={checked.has(f.copy.id)} onChange={(e) => {
                      const n = new Set(checked); if (e.target.checked) n.add(f.copy.id); else n.delete(f.copy.id); setChecked(n);
                    }} />check
                  </label>
                </div>
                <Link to={`/copies/${f.copy.id}`} className="text-muted hover:text-accent">#{f.copy.id}</Link>
                <span className="text-muted"> · {f.copy.grader} {f.copy.grade ?? ""}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {ref && quad && ref.path && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-1">
            <div className="text-xs font-semibold">2 · The reference's cut: drag the corners onto the card's cut edge</div>
            <p className="text-[11px] text-muted">Everything is measured from the cut, so take care here: the corners on the card's edge, not the slab's well. Scroll to zoom.</p>
            <CutEditor path={ref.path} quad={quad} onChange={setQuad} />
            <button onClick={() => setQuad(ref.quad)} className="text-[11px] text-muted hover:text-accent">reset to the engine's outline</button>
          </section>
          <section className="space-y-1">
            <div className="text-xs font-semibold">3 · The frame: four lines on the straightened card</div>
            <p className="text-[11px] text-muted">
              Drag the lines (or type mm from the cut). Put them on something printed the same on every copy (a frame rule,
              the text box); with the median nominal they only need to be stable, not perfect.
            </p>
            <FrameEditor path={ref.path} quad={quad} frame={frame} onChange={setFrame} />
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {SIDES.map((s) => (
                <label key={s} className="flex items-center gap-1">{s}
                  <input value={frame[s]} onChange={(e) => setFrame({ ...frame, [s]: Number(e.target.value) || 0 })}
                    className="bg-bg border border-border rounded px-1 w-14 font-mono" />mm</label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <label className="flex items-center gap-1">what the lines are
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="gold frame, text box…" className="bg-bg border border-border rounded px-1 w-40" /></label>
              <label className="flex items-center gap-1">nominal (perfect cut)
                <select value={nominal} onChange={(e) => setNominal(e.target.value as typeof nominal)} className="bg-bg border border-border rounded px-1">
                  <option value="median">the checked copies' median</option>
                  <option value="layout">the game's layout (Riftbound gold frame)</option>
                </select></label>
            </div>
            <button disabled={busy || !ref.imageId || (nominal === "median" && checked.size < 3)} onClick={save}
              className="bg-accent text-bg font-semibold px-3 py-1 rounded text-xs disabled:opacity-40">
              {tpl ? "Save and rebuild the draft" : "Build the draft"}</button>
            {nominal === "median" && checked.size < 3 && <span className="text-[11px] text-amber-300 ml-2">check at least 3 copies for a median</span>}
          </section>
        </div>
      )}

      {tpl && <Status tpl={tpl} busy={busy} cardId={cardId} act={act} />}
    </div>
  );
}

function Status({ tpl, busy, cardId, act }: { tpl: CardTemplate; busy: boolean; cardId: number; act: (f: () => Promise<unknown>) => void }) {
  const v = tpl.validation;
  return (
    <section className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center gap-3 text-xs">
        <span className="font-semibold">4 · The draft on the checked copies</span>
        {tpl.status === "pending" && <span className="text-muted">the worker is building it (a minute or two)…</span>}
        {tpl.status === "failed" && <span className="text-red-400">{tpl.error}</span>}
        {tpl.status === "draft" && <button disabled={busy} onClick={() => act(() => api.activateTemplate(cardId))}
          className="bg-accent text-bg font-semibold px-3 py-1 rounded disabled:opacity-40">Activate: measure every copy with it</button>}
        {tpl.status === "active" && <button disabled={busy} onClick={() => act(() => api.deactivateTemplate(cardId))}
          className="border border-border px-3 py-1 rounded hover:text-accent">Deactivate</button>}
        <button disabled={busy} onClick={() => act(() => api.deleteTemplate(cardId))} className="text-muted hover:text-red-400 ml-auto">delete template</button>
      </div>
      {v && (
        <>
          <div className="text-[11px] text-muted">
            {v.matched} of {v.copies.length} copies read · nominal {tpl.nominal_source}
            {tpl.nominal_mm && <> ({SIDES.map((s) => `${s[0].toUpperCase()} ${fmt(tpl.nominal_mm![s])}`).join(" · ")} mm)</>}
            {v.spread_mm && <> · spread {SIDES.map((s) => `${s[0].toUpperCase()} ${fmt(v.spread_mm![s])}`).join(" · ")} mm</>}
            {!!v.cut_fixed && <> · {v.cut_fixed} cut{v.cut_fixed > 1 ? "s" : ""} found again from the design</>}
          </div>
          <table className="text-xs w-full max-w-5xl">
            <thead><tr className="text-muted text-left border-b border-border">
              <th className="py-1">copy</th><th>gaps L / R / T / B (mm)</th><th>shift x / y (mm)</th><th>L/R</th><th>T/B</th><th>match</th><th>cut</th><th></th>
            </tr></thead>
            <tbody>{v.copies.map((c) => (
              <tr key={c.copy_id} className="border-b border-[#1c2128]">
                <td className="py-1"><Link to={`/copies/${c.copy_id}`} className="hover:text-accent">#{c.copy_id}</Link></td>
                <td className="font-mono">{c.gaps_mm ? SIDES.map((s) => fmt(c.gaps_mm![s])).join(" / ") : "–"}</td>
                <td className="font-mono">{c.shift_x_mm != null ? `${fmt(c.shift_x_mm)} / ${fmt(c.shift_y_mm)}` : "–"}</td>
                <td className="font-mono">{c.lr_left_pct != null ? `${fmt(c.lr_left_pct, 1)}/${fmt(100 - c.lr_left_pct, 1)}` : "–"}</td>
                <td className="font-mono">{c.tb_top_pct != null ? `${fmt(c.tb_top_pct, 1)}/${fmt(100 - c.tb_top_pct, 1)}` : "–"}</td>
                <td className="text-[10px] text-muted">{c.inliers ?? "–"} pts · {fmt(c.residual_px)} px</td>
                <td className="text-[10px]">{c.cut_fixed ? <span className="text-sky-300">found from the design</span> : c.cut_miss_mm ? <span className="text-muted">as found</span> : ""}
                  {c.cut_miss_mm && <span className="text-muted"> · miss {fmt(c.cut_miss_mm.lr)}/{fmt(c.cut_miss_mm.tb)}</span>}</td>
                <td className="text-[10px]">{c.error ? <span className="text-amber-300">{c.error.replace(/_/g, " ")}</span> : ""}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="text-[11px] text-muted max-w-4xl">
            Shift: how far the frame sits from where a perfect cut leaves it (+x right, +y down). L/R and T/B: the same as a
            ratio, 50/50 for a perfect cut whatever the design's gaps. Copies marked "cut doesn't fit" are left out of the
            median: open them and fix the outline.
          </p>
        </>
      )}
    </section>
  );
}

// ── the photo loaded for pixel access (CORS-safe via the auth fetch) ────────
function usePhoto(path: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let live = true;
    setImg(null);
    api.authImage(`${imageUrl(path)}?px=1`).then((u) => {
      const im = new Image();
      im.onload = () => { if (live) setImg(im); };
      im.src = u;
    }).catch(() => {});
    return () => { live = false; };
  }, [path]);
  return img;
}

function CutEditor({ path, quad, onChange }: { path: string; quad: Quad; onChange: (q: Quad) => void }) {
  const img = usePhoto(path);
  const cv = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ z: 1, cx: 0, cy: 0 });
  const drag = useRef<number | null>(null);
  const W = 520;
  const fit = img ? Math.min(W / img.width, 680 / img.height) : 1;
  const H = img ? Math.round(img.height * fit) : 400;
  useEffect(() => { if (img) setView({ z: 1, cx: img.width / 2, cy: img.height / 2 }); }, [img]);
  // zoom on the wheel without scrolling the page (React's onWheel is passive)
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      setView((v) => {
        const kk = fit * v.z;
        const cx = (sx - W / 2) / kk + v.cx, cy = (sy - H / 2) / kk + v.cy;
        const z = Math.min(16, Math.max(1, v.z * (e.deltaY < 0 ? 1.25 : 0.8)));
        return { z, cx: cx - (sx - W / 2) / (fit * z), cy: cy - (sy - H / 2) / (fit * z) };
      });
    };
    c.addEventListener("wheel", h, { passive: false });
    return () => c.removeEventListener("wheel", h);
  }, [fit, H]);
  const k = fit * view.z;
  const toS = useCallback((x: number, y: number) => [(x - view.cx) * k + W / 2, (y - view.cy) * k + H / 2], [view, k, H]);
  const toC = useCallback((sx: number, sy: number) => [(sx - W / 2) / k + view.cx, (sy - H / 2) / k + view.cy], [view, k, H]);
  useEffect(() => {
    const c = cv.current; if (!c || !img) return;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0d1117"; g.fillRect(0, 0, W, H);
    const [x0, y0] = toS(0, 0);
    g.drawImage(img, x0, y0, img.width * k, img.height * k);
    g.strokeStyle = "#ff40ff"; g.lineWidth = 1.5; g.beginPath();
    quad.forEach(([x, y], i) => { const [sx, sy] = toS(x, y); if (i) g.lineTo(sx, sy); else g.moveTo(sx, sy); });
    g.closePath(); g.stroke();
    quad.forEach(([x, y]) => { const [sx, sy] = toS(x, y); g.fillStyle = "#ff40ff"; g.beginPath(); g.arc(sx, sy, 5, 0, 7); g.fill(); });
  }, [img, quad, toS, k, H]);
  const pos = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  return (
    <canvas ref={cv} width={W} height={H} className="rounded border border-border touch-none cursor-crosshair"
      onPointerDown={(e) => {
        const [sx, sy] = pos(e);
        let best = -1, bd = 14;
        quad.forEach(([x, y], i) => { const [qx, qy] = toS(x, y); const d = Math.hypot(qx - sx, qy - sy); if (d < bd) { bd = d; best = i; } });
        if (best >= 0) { drag.current = best; (e.target as HTMLElement).setPointerCapture(e.pointerId); }
      }}
      onPointerMove={(e) => {
        if (drag.current == null) return;
        const [x, y] = toC(...(pos(e) as [number, number]));
        const q = quad.map((p) => [...p]) as Quad;
        q[drag.current] = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
        onChange(q);
      }}
      onPointerUp={() => { drag.current = null; }} />
  );
}

function FrameEditor({ path, quad, frame, onChange }: { path: string; quad: Quad; frame: TemplateSides; onChange: (f: TemplateSides) => void }) {
  const img = usePhoto(path);
  const cv = useRef<HTMLCanvasElement>(null);
  const [rect, setRect] = useState<ImageData | null>(null);
  const drag = useRef<Side | null>(null);
  const W = Math.round(CARD_W * PPMM), H = Math.round(CARD_H * PPMM);
  // straighten the reference by its cut (re-done when the cut moves)
  useEffect(() => {
    if (!img) return;
    const t = setTimeout(() => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0);
      setRect(warp(g.getImageData(0, 0, img.width, img.height), quad, PPMM));
    }, 150);
    return () => clearTimeout(t);
  }, [img, quad]);
  const linePx = (s: Side) => (s === "left" ? frame.left * PPMM : s === "right" ? W - frame.right * PPMM : s === "top" ? frame.top * PPMM : H - frame.bottom * PPMM);
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0d1117"; g.fillRect(0, 0, W, H);
    if (rect) g.putImageData(rect, 0, 0);
    g.strokeStyle = "#39d0ff"; g.lineWidth = 1.5;
    for (const s of SIDES) {
      const p = linePx(s);
      g.beginPath();
      if (s === "left" || s === "right") { g.moveTo(p, 0); g.lineTo(p, H); } else { g.moveTo(0, p); g.lineTo(W, p); }
      g.stroke();
    }
  });
  const pos = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)]; };
  return (
    <canvas ref={cv} width={W} height={H} className="rounded border border-border touch-none cursor-move w-full max-w-[441px]"
      onPointerDown={(e) => {
        const [x, y] = pos(e);
        let best: Side | null = null, bd = 10;
        for (const s of SIDES) {
          const d = s === "left" || s === "right" ? Math.abs(x - linePx(s)) : Math.abs(y - linePx(s));
          if (d < bd) { bd = d; best = s; }
        }
        if (best) { drag.current = best; (e.target as HTMLElement).setPointerCapture(e.pointerId); }
      }}
      onPointerMove={(e) => {
        const s = drag.current; if (!s) return;
        const [x, y] = pos(e);
        const mm = s === "left" ? x / PPMM : s === "right" ? (W - x) / PPMM : s === "top" ? y / PPMM : (H - y) / PPMM;
        onChange({ ...frame, [s]: Math.round(Math.min(30, Math.max(0.2, mm)) * 100) / 100 });
      }}
      onPointerUp={() => { drag.current = null; }} />
  );
}
