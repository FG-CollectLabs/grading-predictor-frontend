import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, imageUrl } from "../api";
import AuthImg from "../components/AuthImg";
import CenteringEditor, { warp } from "../components/CenteringEditor";
import { currentSession } from "../lib/auth";
import type { LayoutProfile, BorderlessCard, CardDetail, CardTemplate, CenteringMeasurement, CertRow, Quad, TemplateAnnotation, TemplateSides } from "../types";

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
  const [game, setGame] = useState<"riftbound" | "pokemon">((params.get("game") as "pokemon") || "riftbound");
  useEffect(() => {
    setCands(null);
    api.borderlessCandidates(game).then(setCands).catch(() => setCands([]));
  }, [game]);
  useEffect(() => {
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
            <div className="flex items-center gap-1 mb-2">
              {([["riftbound", "Riftbound"], ["pokemon", "Pokémon"]] as const).map(([g, l]) => (
                <button key={g} onClick={() => setGame(g)}
                  className={`rounded px-3 py-1 text-xs ${game === g ? "bg-accent text-bg font-semibold" : "border border-border hover:text-accent"}`}>{l}</button>
              ))}
            </div>
            <div className="text-xs font-semibold mb-1">{game === "riftbound" ? "Riftbound" : "Pokémon"} cards, most copies first</div>
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
  const [nominal, setNominal] = useState<"annotations" | "median" | "layout" | "manual" | "profile">("annotations");
  const [profileId, setProfileId] = useState<number | null>(null);
  const [ties, setTies] = useState<Set<string>>(new Set());
  const [marks, setMarks] = useState<Map<number, TemplateAnnotation>>(new Map());
  const [marking, setMarking] = useState<number | null>(null);
  const [manual, setManual] = useState<TemplateSides | null>(null);
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
      if (t.nominal_source && t.nominal_source !== "reference") setNominal(t.nominal_source);
      setProfileId(t.profile_id ?? null);
      setTies(new Set(t.ties ?? []));
      if (t.nominal_source === "manual" && t.nominal_mm) setManual(t.nominal_mm);
      if (t.validation_copy_ids.length) setChecked(new Set(t.validation_copy_ids));
    }).catch(() => {});
    loadMarks();
  }, [cardId, loadTpl]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMarks = () => api.listAnnotations(cardId)
    .then((r) => {
      setMarks(new Map(r.annotations.map((a) => [a.copy_id, a])));
      // once there are marks, build from them unless you pick otherwise
      if (r.annotations.length) setNominal((n) => (n === "median" ? "annotations" : n));
    }).catch(() => {});

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

  const refMark = ref ? marks.get(ref.copy.id) : undefined;
  const build = () => {
    if (!ref) return;
    const q = refMark?.outer_quad ?? quad;
    if (!q) { setErr("the reference copy has no outline: mark it first"); return; }
    save(q, refMark?.gaps_mm ?? frame);
  };
  const save = async (q: Quad, f: TemplateSides) => {
    if (!ref?.imageId) return;
    if (nominal === "median" && checked.size < 3) { setErr("check at least 3 copies for a median nominal"); return; }
    if (nominal === "annotations" && marks.size < 3 && !(ties.has("left=right") && ties.size >= 2)) {
      setErr("a nominal from your marks needs 3 marked copies, or 1 when the symmetry pins both axes"); return;
    }
    if (nominal === "profile" && !profileId) { setErr("pick a layout profile first"); return; }
    setBusy(true); setErr(null);
    try {
      const t = await api.putTemplate(cardId, {
        mode: "frame", reference: { image_id: ref.imageId, quad: q }, frame_mm: f, nominal,
        nominal_mm: nominal === "manual" && manual ? manual : undefined,
        ties: nominal === "layout" ? [] : [...ties],
        profile_id: profileId,
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
        <div className="text-xs font-semibold">1 · Copies: mark the same reference points on each (mark), the reference for alignment (◉), and the copies to check (☑)</div>
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
                <button disabled={!f.imageId} onClick={() => setMarking(marking === f.copy.id ? null : f.copy.id)}
                  className={`block mt-1 w-full rounded px-1 py-0.5 ${marking === f.copy.id ? "bg-accent text-bg" : marks.has(f.copy.id) ? "border border-emerald-600 text-emerald-300" : "border border-border hover:text-accent"}`}>
                  {marks.has(f.copy.id) ? "marked ✓ · edit" : "mark"}</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {marking != null && (() => {
        const f = fronts?.find((x) => x.copy.id === marking);
        if (!f?.path || !f.imageId) return null;
        const mk = marks.get(f.copy.id);
        const read = tpl?.validation?.copies.find((c) => c.copy_id === f.copy.id);
        const q0 = mk?.outer_quad ?? (read?.quad as Quad | undefined) ?? f.quad;
        const g0 = mk?.gaps_mm ?? read?.gaps_mm ?? refMark?.gaps_mm ?? frame;
        if (!q0) return <div className="text-xs text-amber-300">#{f.copy.id} has no outline yet: open the copy and set its outline first.</div>;
        const order = (fronts ?? []).filter((x) => x.imageId && checked.has(x.copy.id)).map((x) => x.copy.id);
        return (
          <section className="space-y-2">
            <div className="text-xs font-semibold">2 · Marking #{f.copy.id}: the cut (outline) and the frame lines, in the regular centering editor</div>
            <p className="text-[11px] text-muted max-w-4xl">
              Put the outline on the card's cut (not the slab's well) and the lines on the same printed feature on every copy
              (the gold frame rule). Save keeps this copy's marks and moves to the next copy. The template is built from all of
              your marks: its lines are their consensus.
            </p>
            <CenteringEditor key={`mark-${f.copy.id}-${mk?.updated_at ?? ""}`} copyId={0} side="front" imagePath={f.path}
              measurements={[refMeasurement(f.imageId, q0, g0)]} onSaved={() => {}}
              saveTo={async (q, inner) => {
                await api.putAnnotation(cardId, f.copy.id, { image_id: f.imageId!, outer_quad: q, gaps_mm: inner, by: currentSession()?.email });
                await loadMarks();
                const i = order.indexOf(f.copy.id);
                const next = order.slice(i + 1).find((id) => !marks.has(id)) ?? null;
                setMarking(next);
              }} />
            {mk && <button onClick={() => api.deleteAnnotation(cardId, f.copy.id).then(loadMarks).then(() => setMarking(null))}
              className="text-[11px] text-muted hover:text-red-400">remove this copy's marks</button>}
          </section>
        );
      })()}

      {ref && (
        <section className="space-y-2 border-t border-border pt-3">
          <div className="text-xs font-semibold">3 · Build the template from your marks</div>
          {marks.size >= 2 && <MarksCheck marks={[...marks.values()]} onEdit={setMarking} />}
          <div className="text-[11px] text-muted">{marks.size} cop{marks.size === 1 ? "y" : "ies"} marked
            {refMark ? ` · reference #${ref.copy.id} marked` : ` · mark the reference (#${ref.copy.id}) so its cut and lines are yours`}</div>
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <label className="flex items-center gap-1">what the lines are
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="gold frame, text box…" className="bg-bg border border-border rounded px-1 w-40" /></label>
            <label className="flex items-center gap-1">perfect cut (nominal)
              <select value={nominal} onChange={(e) => setNominal(e.target.value as typeof nominal)} className="bg-bg border border-border rounded px-1">
                <option value="annotations">from your marked copies</option>
                <option value="median">the checked copies' median (template readings)</option>
                <option value="manual">set by you (mm)</option>
                <option value="layout">the game's layout (Riftbound gold frame)</option>
                {profileId && <option value="profile">the layout profile's pooled perfect cut</option>}
              </select></label>
          </div>
          {card && <ProfilePanel card={card} cardId={cardId} ties={ties} label={label} profileId={profileId}
            onUse={(p) => { setProfileId(p.id); setTies(new Set(p.ties)); if (p.label) setLabel(p.label); if (!marks.size) setNominal("profile"); }}
            onClear={() => setProfileId(null)} />}
          {nominal !== "layout" && <SymmetryPicker ties={ties} onChange={setTies} marks={[...marks.values()]} />}
          {nominal === "manual" && (
            <NominalEditor value={manual ?? tpl?.nominal_mm ?? tpl?.validation?.median_mm ?? frame}
              median={tpl?.validation?.median_mm ?? null} onChange={setManual} />
          )}
          <button disabled={busy || !ref.imageId} onClick={build}
            className="bg-accent text-bg font-semibold px-3 py-1 rounded text-xs disabled:opacity-40">
            {tpl ? "Rebuild the draft" : "Build the draft"}</button>
        </section>
      )}

      {tpl && <Status tpl={tpl} busy={busy} cardId={cardId} act={act}
        paths={new Map((fronts ?? []).map((f) => [f.copy.id, f.path]))}
        onNominal={(n) => { setNominal("manual"); setManual(n); }} />}
    </div>
  );
}

function Status({ tpl, busy, cardId, act, paths, onNominal }: {
  tpl: CardTemplate; busy: boolean; cardId: number; act: (f: () => Promise<unknown>) => void;
  paths: Map<number, string | null>; onNominal: (n: TemplateSides) => void;
}) {
  const v = tpl.validation;
  const [open, setOpen] = useState<number | null>(null);
  const nom = tpl.nominal_mm;
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
            {v.matched} of {v.copies.length} copies read{v.marked ? ` · ${v.marked} marked by you` : ""} · nominal {tpl.nominal_source}{tpl.ties?.length ? ` (${tpl.ties.join(", ")})` : ""}
            {tpl.nominal_mm && <> ({SIDES.map((s) => `${s[0].toUpperCase()} ${fmt(tpl.nominal_mm![s])}`).join(" · ")} mm)</>}
            {v.spread_mm && <> · spread {SIDES.map((s) => `${s[0].toUpperCase()} ${fmt(v.spread_mm![s])}`).join(" · ")} mm</>}
            {!!v.cut_fixed && <> · {v.cut_fixed} cut{v.cut_fixed > 1 ? "s" : ""} found again from the design</>}
          </div>
          {nom && (
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-muted">The lines should be the same distance from both edges?</span>
              <button onClick={() => onNominal({ ...nom, left: avg(nom.left, nom.right), right: avg(nom.left, nom.right) })}
                className="border border-border rounded px-2 py-0.5 hover:text-accent">left = right ({fmt(avg(nom.left, nom.right))} mm)</button>
              <button onClick={() => onNominal({ ...nom, top: avg(nom.top, nom.bottom), bottom: avg(nom.top, nom.bottom) })}
                className="border border-border rounded px-2 py-0.5 hover:text-accent">top = bottom ({fmt(avg(nom.top, nom.bottom))} mm)</button>
              <button onClick={() => onNominal({ ...nom })} className="border border-border rounded px-2 py-0.5 hover:text-accent">edit the numbers</button>
              <span className="text-muted">then "Save and rebuild the draft" above</span>
            </div>
          )}
          <table className="text-xs w-full max-w-5xl">
            <thead><tr className="text-muted text-left border-b border-border">
              <th className="py-1">copy</th><th>gaps L / R / T / B (mm)</th><th title="the template's reading minus your marks on that copy">vs your marks</th><th>shift x / y (mm)</th><th>L/R</th><th>T/B</th><th>match</th><th>cut</th><th></th>
            </tr></thead>
            <tbody>{v.copies.map((c) => (
              <tr key={c.copy_id} className="border-b border-[#1c2128]">
                <td className="py-1"><Link to={`/copies/${c.copy_id}`} className="hover:text-accent">#{c.copy_id}</Link>
                  {c.quad && c.gaps_mm && paths.get(c.copy_id) && (
                    <button onClick={() => setOpen(open === c.copy_id ? null : c.copy_id)} className="ml-2 text-[10px] text-accent hover:underline">
                      {open === c.copy_id ? "hide" : "view"}</button>)}</td>
                <td className="font-mono">{c.gaps_mm ? SIDES.map((s) => fmt(c.gaps_mm![s])).join(" / ") : "–"}</td>
                <td className="font-mono text-[10px]">{c.vs_person_mm ? SIDES.map((s) => {
                  const d = c.vs_person_mm![s];
                  return <span key={s} className={Math.abs(d) > 0.15 ? "text-amber-300" : "text-muted"}>{d >= 0 ? "+" : ""}{fmt(d)} </span>;
                }) : <span className="text-muted">not marked</span>}</td>
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
          {open != null && (() => {
            const c = v.copies.find((x) => x.copy_id === open);
            const path = paths.get(open);
            return c?.quad && c.gaps_mm && path ? <AuditView path={path} quad={c.quad} gaps={c.gaps_mm} nominal={nom} copyId={open} /> : null;
          })()}
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

const avg = (a: number, b: number) => Math.round(((a + b) / 2) * 1000) / 1000;

function NominalEditor({ value, median, onChange }: { value: TemplateSides; median: TemplateSides | null; onChange: (n: TemplateSides) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] rounded border border-border p-2">
      <span className="text-muted">Perfect cut leaves the lines at</span>
      {SIDES.map((s) => (
        <label key={s} className="flex items-center gap-1">{s}
          <input value={value[s]} onChange={(e) => onChange({ ...value, [s]: Number(e.target.value) || 0 })}
            className="bg-bg border border-border rounded px-1 w-14 font-mono" />mm</label>
      ))}
      {median && <span className="text-muted">copies' median: {SIDES.map((s) => `${s[0].toUpperCase()} ${fmt(median[s])}`).join(" · ")}</span>}
    </div>
  );
}

// One copy straightened by the cut the template used, with the frame lines
// where the template found them (cyan) and where a perfect cut would put
// them (dashed): are the lines on the design's frame on this copy?
function AuditView({ path, quad, gaps, nominal, copyId }: { path: string; quad: Quad; gaps: TemplateSides; nominal: TemplateSides | null; copyId: number }) {
  const img = usePhoto(path);
  const cv = useRef<HTMLCanvasElement>(null);
  const W = Math.round(CARD_W * PPMM), H = Math.round(CARD_H * PPMM);
  const [zoom, setZoom] = useState<Side | null>(null);
  useEffect(() => {
    const c = cv.current; if (!c || !img) return;
    const t = document.createElement("canvas"); t.width = img.width; t.height = img.height;
    const tg = t.getContext("2d")!; tg.drawImage(img, 0, 0);
    const r = warp(tg.getImageData(0, 0, img.width, img.height), quad, PPMM);
    const g = c.getContext("2d")!;
    const line = (s: Side, mm: number, dash: boolean, color: string) => {
      g.strokeStyle = color; g.lineWidth = 1; g.setLineDash(dash ? [5, 4] : []);
      const p = s === "left" ? mm * PPMM : s === "right" ? W - mm * PPMM : s === "top" ? mm * PPMM : H - mm * PPMM;
      g.beginPath();
      if (s === "left" || s === "right") { g.moveTo(p, 0); g.lineTo(p, H); } else { g.moveTo(0, p); g.lineTo(W, p); }
      g.stroke();
    };
    c.width = W; c.height = H;
    g.putImageData(r, 0, 0);
    if (zoom) {
      // 4x on the middle of one side, to see the line against the frame rule
      const cx = zoom === "left" ? gaps.left * PPMM : zoom === "right" ? W - gaps.right * PPMM : W / 2;
      const cy = zoom === "top" ? gaps.top * PPMM : zoom === "bottom" ? H - gaps.bottom * PPMM : H / 2;
      const sw = W / 4, sh = H / 4;
      const t2 = document.createElement("canvas"); t2.width = W; t2.height = H; t2.getContext("2d")!.putImageData(r, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(t2, cx - sw / 2, cy - sh / 2, sw, sh, 0, 0, W, H);
      g.strokeStyle = "#39d0ff"; g.setLineDash([]); g.beginPath();
      if (zoom === "left" || zoom === "right") { g.moveTo(W / 2, 0); g.lineTo(W / 2, H); } else { g.moveTo(0, H / 2); g.lineTo(W, H / 2); }
      g.stroke();
      return;
    }
    for (const s of SIDES) {
      line(s, gaps[s], false, "#39d0ff");
      if (nominal) line(s, nominal[s], true, "#ffb340");
    }
  }, [img, quad, gaps, nominal, zoom, W, H]);
  return (
    <div className="flex flex-wrap gap-3 items-start">
      <canvas ref={cv} className="rounded border border-border w-full max-w-[441px]" />
      <div className="text-[11px] space-y-1 max-w-xs">
        <div className="font-semibold">#{copyId}, straightened by its cut</div>
        <div><span className="text-[#39d0ff]">cyan</span>: the frame as the template found it on this copy</div>
        {nominal && <div><span className="text-[#ffb340]">dashed orange</span>: where a perfect cut would put it</div>}
        <div className="text-muted">Gaps: {SIDES.map((s) => `${s[0].toUpperCase()} ${fmt(gaps[s])}`).join(" · ")} mm</div>
        <div className="flex flex-wrap gap-1 pt-1">
          <span className="text-muted">zoom 4×:</span>
          {SIDES.map((s) => (
            <button key={s} onClick={() => setZoom(zoom === s ? null : s)}
              className={`border rounded px-1.5 ${zoom === s ? "border-accent text-accent" : "border-border"}`}>{s}</button>
          ))}
        </div>
        <p className="text-muted">If the cyan line isn't on the frame rule, tell Claude which copy and side. If this copy's cut is
          wrong, untick it and rebuild so the median ignores it.</p>
      </div>
    </div>
  );
}

// the reference as a measurement for the regular centering editor: its cut
// as the outline, the frame as the inner border (mm from the cut)
function refMeasurement(imageId: number, quad: Quad, frame: TemplateSides): CenteringMeasurement {
  return {
    id: -1, image_id: imageId, side: "front", image_sha256: null, supersedes: null, outer_quad: quad, px_per_mm: null,
    inner_mm: { ...frame }, lr_left_pct: null, tb_top_pct: null, lr_err_pp: null, tb_err_pp: null, rotation_deg: null,
    placed_by: "template", detector_version: "", status: "proposed", flags: [], tags: [], note: null, created_at: "",
  };
}

// The frame is the same size on every copy, so left + right (and top +
// bottom) of a person's marks should match across copies; a copy far off
// the others has its outline or its lines off.
function MarksCheck({ marks, onEdit }: { marks: TemplateAnnotation[]; onEdit: (copyId: number) => void }) {
  const lr = marks.map((m) => m.gaps_mm.left + m.gaps_mm.right);
  const tb = marks.map((m) => m.gaps_mm.top + m.gaps_mm.bottom);
  const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const mlr = med(lr), mtb = med(tb);
  const off = (d: number) => (Math.abs(d) > 0.2 ? "text-amber-300" : "text-muted");
  return (
    <div className="text-[11px] space-y-1">
      <div className="text-muted">
        Your marks' frame size (should match on every copy: the frame is printed the same size): left + right {fmt(mlr)} mm,
        top + bottom {fmt(mtb)} mm on the median copy. Over 0.2 mm off (amber): that copy's outline or lines are off.
      </div>
      <table className="text-[11px]">
        <thead><tr className="text-muted text-left"><th className="pr-3">copy</th><th className="pr-3">L + R</th><th className="pr-3">T + B</th><th></th></tr></thead>
        <tbody>{marks.map((m, i) => (
          <tr key={m.copy_id}>
            <td className="pr-3">#{m.copy_id}</td>
            <td className={`pr-3 font-mono ${off(lr[i] - mlr)}`}>{fmt(lr[i])} ({lr[i] - mlr >= 0 ? "+" : ""}{fmt(lr[i] - mlr)})</td>
            <td className={`pr-3 font-mono ${off(tb[i] - mtb)}`}>{fmt(tb[i])} ({tb[i] - mtb >= 0 ? "+" : ""}{fmt(tb[i] - mtb)})</td>
            <td><button onClick={() => onEdit(m.copy_id)} className="text-accent hover:underline">edit</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ── the design's symmetry: which frame lines sit the same distance from
// their edges. The frame is printed the same size on every copy, so each
// axis's two gaps add up to a fixed total, and a tie pins the perfect cut.
const TB_TIES = [
  ["", "no top/bottom tie (from the marks)"],
  ["top=bottom", "top = bottom"],
  ["top=sides", "top matches the sides (the bottom is the design's)"],
  ["bottom=sides", "bottom matches the sides (the top is the design's)"],
] as const;

function applyTies(n: TemplateSides, tot: { lr: number; tb: number }, ties: Set<string>): TemplateSides {
  const o = { ...n };
  if (ties.has("left=right")) o.left = o.right = tot.lr / 2;
  if (ties.has("top=bottom")) o.top = o.bottom = tot.tb / 2;
  const side = (o.left + o.right) / 2;
  if (ties.has("top=sides")) { o.top = side; o.bottom = tot.tb - side; } else if (ties.has("bottom=sides")) { o.bottom = side; o.top = tot.tb - side; }
  return o;
}

function SymmetryPicker({ ties, onChange, marks }: { ties: Set<string>; onChange: (t: Set<string>) => void; marks: TemplateAnnotation[] }) {
  const med = (v: number[]) => { const a = [...v].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const stats = useMemo(() => {
    if (!marks.length) return null;
    const g = marks.map((m) => m.gaps_mm);
    const m = { left: med(g.map((x) => x.left)), right: med(g.map((x) => x.right)), top: med(g.map((x) => x.top)), bottom: med(g.map((x) => x.bottom)) };
    const tot = { lr: g.reduce((a, x) => a + x.left + x.right, 0) / g.length, tb: g.reduce((a, x) => a + x.top + x.bottom, 0) / g.length };
    // a suggestion from the marks: sides within 0.15 mm of each other look tied
    const lrTied = Math.abs(m.left - m.right) < 0.15;
    const side = lrTied ? tot.lr / 2 : (m.left + m.right) / 2;
    const opts = [["top=bottom", Math.abs(m.top - m.bottom)], ["top=sides", Math.abs(m.top - side)], ["bottom=sides", Math.abs(m.bottom - side)]] as const;
    const best = [...opts].sort((a, b) => a[1] - b[1])[0];
    const sug = new Set<string>([...(lrTied ? ["left=right"] : []), ...(best[1] < 0.2 ? [best[0]] : [])]);
    return { m, tot, sug, diffs: { lr: Math.abs(m.left - m.right), opts } };
  }, [marks]);
  const tb = TB_TIES.find(([k]) => k && ties.has(k))?.[0] ?? "";
  const setTb = (k: string) => { const n = new Set<string>([...ties].filter((t) => t === "left=right")); if (k) n.add(k); onChange(n); };
  const preview = stats ? applyTies(stats.m, stats.tot, ties) : null;
  const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto] text-[11px] rounded border border-border p-2">
      <div className="space-y-1">
        <div className="text-muted">Which frame lines are the same distance from their edges (the design's symmetry)?</div>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={ties.has("left=right")} onChange={(e) => {
            const n = new Set(ties); if (e.target.checked) n.add("left=right"); else n.delete("left=right"); onChange(n);
          }} />left = right</label>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {TB_TIES.map(([k, l]) => (
            <label key={k || "none"} className="flex items-center gap-1">
              <input type="radio" name="tbtie" checked={tb === k} onChange={() => setTb(k)} />{l}</label>
          ))}
        </div>
        {stats && (
          <div className="pt-1 space-y-0.5">
            <div className="text-muted">
              From your {marks.length} marked cop{marks.length === 1 ? "y" : "ies"} (medians): L {fmt(stats.m.left)} · R {fmt(stats.m.right)} ·
              T {fmt(stats.m.top)} · B {fmt(stats.m.bottom)} mm. Left vs right differ by {fmt(stats.diffs.lr)};
              {" "}{stats.diffs.opts.map(([k, d]) => `${k} ${fmt(d)}`).join(" · ")} mm.
            </div>
            <div>
              Suggested: <span className="text-accent">{stats.sug.size ? [...stats.sug].join(" + ") : "no ties (the marks don't line up)"}</span>
              {!same(stats.sug, ties) && <button onClick={() => onChange(new Set(stats.sug))} className="ml-2 text-accent hover:underline">use it</button>}
              <span className="text-muted"> · a guess from your marks; you decide.</span>
            </div>
          </div>
        )}
      </div>
      {preview && <SymmetryDiagram n={preview} ties={ties} />}
    </div>
  );
}

function SymmetryDiagram({ n, ties }: { n: TemplateSides; ties: Set<string> }) {
  // the perfect cut's gaps on a card outline; tied sides share a colour
  const W = 126, H = 176, k = 4.5;
  const side = ties.has("top=sides") ? ["left", "right", "top"] : ties.has("bottom=sides") ? ["left", "right", "bottom"] : ties.has("left=right") ? ["left", "right"] : [];
  const tbPair = ties.has("top=bottom") ? ["top", "bottom"] : [];
  const col = (s: string) => (side.includes(s) ? "#39d0ff" : tbPair.includes(s) ? "#ffb340" : "#8b949e");
  const x0 = n.left * k, x1 = W - n.right * k, y0 = n.top * k, y1 = H - n.bottom * k;
  return (
    <svg width={W + 60} height={H + 20} viewBox={`-30 -10 ${W + 60} ${H + 20}`} className="text-[9px]">
      <rect x={0} y={0} width={W} height={H} rx={6} fill="none" stroke="#30363d" />
      <line x1={x0} y1={0} x2={x0} y2={H} stroke={col("left")} />
      <line x1={x1} y1={0} x2={x1} y2={H} stroke={col("right")} />
      <line x1={0} y1={y0} x2={W} y2={y0} stroke={col("top")} />
      <line x1={0} y1={y1} x2={W} y2={y1} stroke={col("bottom")} />
      <text x={-28} y={H / 2} fill={col("left")}>{fmt(n.left)}</text>
      <text x={W + 2} y={H / 2} fill={col("right")}>{fmt(n.right)}</text>
      <text x={W / 2 - 10} y={-2} fill={col("top")}>{fmt(n.top)}</text>
      <text x={W / 2 - 10} y={H + 9} fill={col("bottom")}>{fmt(n.bottom)}</text>
    </svg>
  );
}

// ── layout profiles: one frame geometry for every card printed with the
// same layout. Each card keeps its own reference (its art), but the symmetry
// and the perfect cut are shared; the members table shows whether the cards
// really agree (the bottom offset, the frame's size).
function ProfilePanel({ card, cardId, ties, label, profileId, onUse, onClear }: {
  card: CardDetail; cardId: number; ties: Set<string>; label: string; profileId: number | null;
  onUse: (p: LayoutProfile) => void; onClear: () => void;
}) {
  const [mine, setMine] = useState<LayoutProfile[]>([]);
  const [all, setAll] = useState<LayoutProfile[]>([]);
  const [name, setName] = useState("");
  const [rar, setRar] = useState("");
  const [sets, setSets] = useState(card.set_code);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    api.listProfiles({ card_id: String(cardId) }).then((r) => setMine(r.profiles)).catch(() => {});
    api.listProfiles({ game: card.game }).then((r) => setAll(r.profiles)).catch(() => {});
  }, [cardId, card.game]);
  useEffect(() => { load(); }, [load]);
  const current = all.find((p) => p.id === profileId) ?? mine.find((p) => p.relation === "member") ?? null;
  const by = currentSession()?.email;
  const join = async (p: LayoutProfile) => {
    setErr(null);
    try {
      const np = await api.putProfile({ id: p.id, game: p.game, name: p.name, label: p.label ?? undefined, ties: p.ties,
        card_ids: [...new Set([...p.card_ids, cardId])], rarities: p.rarities, set_codes: p.set_codes, by });
      onUse(np); load();
    } catch (e) { setErr(String(e)); }
  };
  const create = async () => {
    setErr(null);
    try {
      const np = await api.putProfile({ game: card.game, name: name.trim(), label: label || undefined, ties: [...ties], card_ids: [cardId],
        rarities: rar.split(",").map((x) => x.trim()).filter(Boolean), set_codes: sets.split(",").map((x) => x.trim()).filter(Boolean), by });
      onUse(np); load(); setName("");
    } catch (e) { setErr(String(e)); }
  };
  const P = (st: { nominal_mm: TemplateSides } | null | undefined) => st ? SIDES.map((s) => `${s[0].toUpperCase()} ${fmt(st.nominal_mm[s])}`).join(" · ") : "–";
  return (
    <div className="rounded border border-border p-2 space-y-2 text-[11px]">
      <div className="font-semibold text-xs">Layout profile <span className="font-normal text-muted">(shared by cards printed with the same layout)</span></div>
      {err && <div className="text-red-400 break-all">{err}</div>}
      {current ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span>This card follows <span className="text-accent">{current.name}</span></span>
            <span className="text-muted">ties: {current.ties.join(", ") || "none"}{current.label ? ` · lines: ${current.label}` : ""}</span>
            <button onClick={() => onUse(current)} className="text-accent hover:underline">use its symmetry</button>
            <button onClick={onClear} className="text-muted hover:text-red-400">stop following</button>
          </div>
          {current.pooled && (
            <div className="text-muted">Pooled over {current.pooled.marks} marks: perfect cut {P(current.pooled)} mm · bottom − top {fmt(current.pooled.bottom_minus_top_mm)} ·
              L+R {fmt(current.pooled.lr_total_mm)} · T+B {fmt(current.pooled.tb_total_mm)}</div>
          )}
          <table className="text-[11px]">
            <thead><tr className="text-muted text-left"><th className="pr-3">member card</th><th className="pr-3">marks</th><th className="pr-3">L+R</th><th className="pr-3">T+B</th><th className="pr-3">bottom − top</th><th>template</th></tr></thead>
            <tbody>{current.members.map((m) => {
              const st = m.marks_stats, pl = current.pooled;
              const off = (a?: number, b?: number) => (a != null && b != null && Math.abs(a - b) > 0.2 ? "text-amber-300" : "");
              return (
                <tr key={m.card_id}>
                  <td className="pr-3"><Link to={`?card=${m.card_id}`} className="hover:text-accent">{m.card_name}</Link> <span className="text-muted">#{m.card_number}</span></td>
                  <td className="pr-3">{st?.marks ?? 0}</td>
                  <td className={`pr-3 font-mono ${off(st?.lr_total_mm, pl?.lr_total_mm)}`}>{fmt(st?.lr_total_mm)}</td>
                  <td className={`pr-3 font-mono ${off(st?.tb_total_mm, pl?.tb_total_mm)}`}>{fmt(st?.tb_total_mm)}</td>
                  <td className={`pr-3 font-mono ${off(st?.bottom_minus_top_mm, pl?.bottom_minus_top_mm)}`}>{fmt(st?.bottom_minus_top_mm)}</td>
                  <td className="text-muted">{m.template_status ?? "none"}</td>
                </tr>
              );
            })}</tbody>
          </table>
          <div className="text-muted">Amber: more than 0.2 mm from the pool. A card that's off on bottom − top probably isn't the same layout.</div>
        </>
      ) : (
        <div className="space-y-2">
          {mine.filter((p) => p.relation === "suggested").map((p) => (
            <div key={p.id}>Suggested: <span className="text-accent">{p.name}</span> <span className="text-muted">({p.ties.join(", ") || "no ties"})</span>
              <button onClick={() => join(p)} className="ml-2 text-accent hover:underline">add this card</button></div>
          ))}
          {all.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">add to
              <select onChange={(e) => { const p = all.find((x) => x.id === Number(e.target.value)); if (p) join(p); }} defaultValue=""
                className="bg-bg border border-border rounded px-1">
                <option value="" disabled>a profile…</option>
                {all.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
          )}
          <div className="flex flex-wrap items-center gap-1">or save this card's symmetry as a new profile:
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gold frame, L=R=T, deep bottom" className="bg-bg border border-border rounded px-1 w-56" />
            <span className="text-muted">suggest for rarities</span>
            <input value={rar} onChange={(e) => setRar(e.target.value)} placeholder="Overnumbered, Promo" className="bg-bg border border-border rounded px-1 w-36" />
            <span className="text-muted">sets</span>
            <input value={sets} onChange={(e) => setSets(e.target.value)} className="bg-bg border border-border rounded px-1 w-24" />
            <button disabled={!name.trim()} onClick={create} className="text-accent hover:underline disabled:opacity-40">save profile</button>
          </div>
        </div>
      )}
    </div>
  );
}
