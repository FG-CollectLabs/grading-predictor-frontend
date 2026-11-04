import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, imageUrl } from "../api";
import type { CenteringMeasurement, CopyDetail, CopyPhoto, ReviewSteps, StepDecision, StepId } from "../types";
import CenteringEditor from "../components/CenteringEditor";
import { FLAG_LABELS, StatusBadge, gradeText } from "./Copies";

// Pre-grading review of one copy, step by step, in the factory's order:
//   0 correct card · 1 grade/grader · 2 cert · 3 front/back photos ·
//   4 front centering (outer edge, then inner border) · 5 back centering ·
//   6 corners · 7 edges (later) · then "Looks right & next".
// Every decision is recorded (step state + an append-only history), so a step
// approved too quickly can be reopened and redone. Data changes go through the
// existing endpoints: picks and cert -> /review, measurements -> /centering.

type Step = { id: StepId; n: string; title: string; soon?: boolean };

const STEPS: Step[] = [
  { id: "card", n: "0", title: "Correct card?" },
  { id: "listing", n: "1", title: "Genuine slab, right grade?" },
  { id: "cert", n: "2", title: "Cert number" },
  { id: "photos", n: "3", title: "Front & back photos" },
  { id: "front_outer", n: "4a", title: "Front · outer edge" },
  { id: "front_inner", n: "4b", title: "Front · inner border" },
  { id: "back_outer", n: "5a", title: "Back · outer edge" },
  { id: "back_inner", n: "5b", title: "Back · inner border" },
  { id: "corners", n: "6", title: "Corners", soon: true },
  { id: "edges", n: "7", title: "Edges", soon: true },
];
const REQUIRED: StepId[] = ["card", "listing", "cert", "photos", "front_outer", "front_inner", "back_outer", "back_inner"];

const DECISION_STYLE: Record<StepDecision, { icon: string; cls: string; label: string }> = {
  approved: { icon: "✓", cls: "text-green", label: "approved" },
  fixed: { icon: "✎", cls: "text-yellow", label: "fixed" },
  rejected: { icon: "✕", cls: "text-red-400", label: "rejected" },
  skipped: { icon: "–", cls: "text-muted", label: "skipped" },
};

export default function CopyReview() {
  const { id } = useParams<{ id: string }>();
  const copyId = Number(id);
  const { search } = useLocation();
  const navigate = useNavigate();

  const [copy, setCopy] = useState<CopyDetail | null>(null);
  const [steps, setSteps] = useState<ReviewSteps | null>(null);
  const [centering, setCentering] = useState<CenteringMeasurement[]>([]);
  const [active, setActive] = useState<StepId>("card");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // photos step state
  const [front, setFront] = useState<number | null>(null);
  const [back, setBack] = useState<number | null>(null);
  const [uploading, setUploading] = useState<"front" | "back" | null>(null);
  // cert step state
  const [cert, setCert] = useState("");
  // the copy that already has the cert being saved, loaded to compare
  const [dupOf, setDupOf] = useState<CopyDetail | null>(null);
  const [note, setNote] = useState("");

  const loadCopy = useCallback(async () => {
    const c = await api.getCopy(copyId);
    setCopy(c);
    setFront(c.triage?.front_pos ?? null);
    setBack(c.triage?.back_pos ?? null);
    setCert(c.cert_number);
    return c;
  }, [copyId]);

  useEffect(() => {
    setError(null);
    setCopy(null);
    setSteps(null);
    Promise.all([loadCopy(), api.getSteps(copyId), api.getCentering(copyId)])
      .then(([c, s, m]) => {
        setSteps(s);
        setCentering(m.measurements);
        const done = new Set(s.steps.map((x) => x.step));
        // open at the first step that needs a person (not decided, machine not sure)
        const open = REQUIRED.find((x) => !done.has(x) && c.stations?.[STEP_STATION[x]] !== "high");
        setActive(open ?? REQUIRED.find((x) => !done.has(x)) ?? "back_inner");
      })
      .catch((e: unknown) => setError(String(e)));
  }, [copyId, loadCopy]);

  const decided = useMemo(() => new Map((steps?.steps ?? []).map((s) => [s.step, s])), [steps]);
  const rejectedEarly = (["card", "listing", "cert"] as StepId[]).some((s) => decided.get(s)?.decision === "rejected");
  // a step is settled when a person decided it, or the machine is sure (high)
  const machine = (s: StepId) => copy?.stations?.[STEP_STATION[s]];
  const allDecided = rejectedEarly || REQUIRED.every((s) => decided.has(s) || machine(s) === "high");

  const nextOf = (s: StepId): StepId => {
    const i = REQUIRED.indexOf(s);
    return REQUIRED.slice(i + 1).find((x) => !decided.has(x)) ?? REQUIRED[Math.min(i + 1, REQUIRED.length - 1)];
  };

  const record = useCallback(
    async (step: StepId, decision: StepDecision, extra: { note?: string; tags?: string[]; payload?: Record<string, unknown> } = {}, advance = true) => {
      setBusy(true);
      setError(null);
      try {
        const s = await api.postStep(copyId, { step, decision, ...extra });
        setSteps(s);
        if (advance) {
          const done = new Set(s.steps.map((x) => x.step));
          const i = REQUIRED.indexOf(step);
          setActive(REQUIRED.slice(i + 1).find((x) => !done.has(x)) ?? REQUIRED[Math.min(i + 1, REQUIRED.length - 1)]);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [copyId],
  );

  const goNext = useCallback(async (skipThis = false) => {
    const p = new URLSearchParams(search);
    p.set("limit", "60");
    p.delete("offset");
    // copies skipped this session aren't offered again (otherwise two skipped
    // copies at the top of a queue bounce back and forth)
    const skipped = new Set<number>(JSON.parse(sessionStorage.getItem("skippedCopies") ?? "[]"));
    if (skipThis) {
      skipped.add(copyId);
      sessionStorage.setItem("skippedCopies", JSON.stringify([...skipped].slice(-500)));
    }
    try {
      const list = await api.listCopies(p);
      const next = list.items.find((c) => c.id !== copyId && !skipped.has(c.id));
      navigate(next ? `/copies/${next.id}${search}` : `/copies${search}`);
    } catch {
      navigate(`/copies${search}`);
    }
  }, [search, copyId, navigate]);

  const complete = useCallback(async () => {
    if (!copy) return;
    setBusy(true);
    setError(null);
    try {
      const ds = (steps?.steps ?? []).filter((s) => s.step !== "complete");
      const verdict = rejectedEarly ? "unusable" : ds.some((s) => s.decision === "fixed") ? "fixed" : "ok";
      const tags = [...new Set(ds.flatMap((s) => s.tags))].filter((t) => TRIAGE_TAGS.has(t));
      if (copy.triage) await api.reviewCopy(copy.id, { verdict, tags, note: note.trim() });
      await api.postStep(copy.id, { step: "complete", decision: verdict === "ok" ? "approved" : verdict === "fixed" ? "fixed" : "rejected" });
      await goNext();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [copy, steps, rejectedEarly, note, goNext]);

  // Remove from the dataset: wrong card, card cut off, no usable photos ...
  // Kept as a 'removed' marker (verdict unusable) rather than deleted, so the
  // scraper doesn't add the same listing back; excluded from every queue, the
  // centering worker and the backtest.
  const removeCopy = useCallback(async (reason: string, note: string) => {
    if (!copy) return;
    setBusy(true);
    setError(null);
    try {
      const tag = REMOVE_REASONS.find((r) => r.value === reason)?.tag ?? "other";
      const text = [REMOVE_REASONS.find((r) => r.value === reason)?.label, note.trim()].filter(Boolean).join(": ");
      if (copy.triage) await api.reviewCopy(copy.id, { verdict: "unusable", tags: [tag], note: text });
      await api.postStep(copy.id, { step: "complete", decision: "rejected", tags: [tag], note: `removed from dataset · ${text}` });
      await goNext();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [copy, goNext]);

  // Re-run the checks on this copy (after replacing its photos): reopens the
  // steps (history keeps them) and clears the AI label / photo checks.
  const [reevalMsg, setReevalMsg] = useState<string | null>(null);
  const reevaluate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.reevaluate(copyId, "re-evaluate after photo change");
      const [s] = await Promise.all([api.getSteps(copyId), loadCopy()]);
      setSteps(s);
      setActive("card");
      setReevalMsg(`Reopened ${r.cleared_steps} step${r.cleared_steps === 1 ? "" : "s"}. The AI label check re-reads card, grade and cert from the current photos within the hour; centering re-measures new photos within minutes.`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [copyId, loadCopy]);

  // Your own photo replaces the listing photo for that side (the worker never
  // overwrites an upload); for when the grader's cert-page photo is better.
  const upload = useCallback(
    async (side: "front" | "back", file: File) => {
      setUploading(side);
      setError(null);
      try {
        await api.uploadCertImage(copyId, side, file);
        await loadCopy();
        // a new photo is re-measured by the centering worker within a few minutes
        await api.postStep(copyId, { step: "photos", decision: "fixed", tags: ["better_photo_available"], payload: { uploaded: side } })
          .then(setSteps).catch(() => undefined);
        setReevalMsg(`Your ${side} photo is stored. When both sides are replaced, press "Re-evaluate this copy" to run the card, grade and cert checks on them.`);
      } catch (e) {
        setError(String(e));
      } finally {
        setUploading(null);
      }
    },
    [copyId, loadCopy],
  );

  // keyboard: n = next copy (Enter is per step, on its main button)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "CANVAS") return;
      if (e.key === "n") goNext(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext]);

  if (error && !copy) return <div className="text-red-400 py-12 text-center">{error}</div>;
  if (!copy || !steps) return <div className="text-muted py-12 text-center">Loading…</div>;

  const t = copy.triage;
  const flags = t?.detail?.flags ?? copy.flags;
  const photoAt = (pos: number | null) => copy.photos.find((p) => p.position === pos) ?? null;
  const frontChanged = t !== null && front !== (t.front_pos ?? null);
  const backChanged = t !== null && back !== (t.back_pos ?? null);
  const certChanged = cert.trim() !== copy.cert_number;
  // what the photos step currently shows: the stored photo, or (for a pick
  // the worker hasn't stored yet) the listing photo itself
  const frontView = viewFor("front", copy.front_image, photoAt(front), frontChanged || (!copy.front_image && front !== null));
  const backView = viewFor("back", copy.back_image, photoAt(back), backChanged || (!copy.back_image && back !== null));
  const photosPending = t?.status === "pending" || t?.status === "working";

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-xs text-muted">
        <Link to={`/copies${search}`} className="hover:text-accent">← Copies</Link>
        <span className="text-border">/</span>
        <Link to={`/cards/${copy.card_id}`} className="hover:text-accent">{copy.card_name}</Link>
        <span className="text-border">/</span>
        <span className="text-[#e6edf3]">copy #{copy.id}</span>
        <Link to="/factory/history" className="ml-auto hover:text-accent">my review history →</Link>
      </div>

      <div className="bg-surface border border-border rounded-md p-3 mb-4 flex flex-wrap items-center gap-4">
        {copy.card.image_url && <img src={copy.card.image_url} alt="catalog" className="w-12 rounded border border-border" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{copy.card_name}</h1>
            <StatusBadge copy={copy} />
            <span className="text-xs text-muted">{copy.set_name} · #{copy.card_number}{copy.language ? ` · ${copy.language}` : ""}</span>
            <span className="text-sm font-semibold">{gradeText(copy)}</span>
          </div>
          {copy.source_title && (
            <div className="text-xs text-muted truncate" title={copy.source_title}>
              “{copy.source_title}” {copy.source_ref && <a href={copy.source_ref} target="_blank" rel="noreferrer" className="text-accent hover:underline">listing ↗</a>}
            </div>
          )}
        </div>
        {flags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {flags.map((f) => <span key={f} className="text-[10px] text-orange-300 border border-orange-300/30 rounded px-1.5">{FLAG_LABELS[f] ?? f}</span>)}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-4">
        {/* ── the line ──────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="bg-surface border border-border rounded-md p-2">
            {STEPS.map((s) => {
              const d = decided.get(s.id);
              const st = d ? DECISION_STYLE[d.decision] : null;
              const disabled = s.soon || (rejectedEarly && !["card", "listing"].includes(s.id));
              return (
                <button
                  key={s.id}
                  disabled={disabled}
                  onClick={() => setActive(s.id)}
                  className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded text-xs ${
                    active === s.id ? "bg-accent/10 text-accent" : "text-[#e6edf3] hover:bg-bg"
                  } disabled:opacity-40 disabled:cursor-default`}
                >
                  <span className="font-mono text-[10px] w-5 text-muted">{s.n}</span>
                  <span className="flex-1">{s.title}</span>
                  {s.soon ? <span className="text-[9px] text-muted">later</span>
                    : st ? <span className={st.cls} title={`${st.label} by ${d!.decided_by}`}>{st.icon}</span>
                    : <MachineMark state={machine(s.id)} />}
                </button>
              );
            })}
            <div className="border-t border-border mt-2 pt-2 space-y-1.5">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="note for this copy (optional)"
                className="w-full bg-bg border border-border rounded px-2 py-1 text-xs outline-none focus:border-accent" />
              <button
                disabled={!allDecided || busy}
                onClick={complete}
                className="w-full bg-accent text-bg font-semibold px-3 py-1.5 rounded text-sm hover:bg-accent/90 disabled:opacity-40"
                title={allDecided ? "" : "decide every step first"}
              >
                {rejectedEarly ? "Mark unusable & next" : "Looks right & next"}
              </button>
              <button disabled={busy} onClick={reevaluate}
                title="run every check again on the current photos (e.g. after uploading the grader's scans)"
                className="w-full text-xs border border-accent/40 text-accent rounded px-2 py-1 hover:bg-accent/10 disabled:opacity-40">
                Re-evaluate this copy
              </button>
              {reevalMsg && <div className="text-[10px] text-green">{reevalMsg}</div>}
              <RemoveCopy busy={busy} onRemove={removeCopy} />
              <button onClick={() => goNext(true)} className="w-full text-xs border border-border text-muted rounded px-2 py-1 hover:text-[#e6edf3]"
                title="leave this copy for later (not offered again this session)">
                Skip copy <span className="opacity-60 text-[10px]">n</span>
              </button>
              {decided.get("complete") && (
                <div className="text-[10px] text-muted">
                  Completed {new Date(decided.get("complete")!.decided_at).toLocaleString()} by {decided.get("complete")!.decided_by}. You can reopen any step and complete again.
                </div>
              )}
            </div>
          </div>
          <History steps={steps} />
        </div>

        {/* ── the active step ───────────────────────────────────────────── */}
        <div className="min-w-0">
          {error && <div className="text-red-400 text-xs mb-2">{error}</div>}
          <StepHeader step={STEPS.find((s) => s.id === active)!} decision={decided.get(active)?.decision} machine={machine(active)} />

          {active === "card" && (
            <StepBody
              hint="Does the listing actually show this card (name, number, set, language)?"
              left={<Figure label="catalog image" src={copy.card.image_url} />}
              right={<Figure label="listing front" src={frontView.src} sub={frontView.sub} onUpload={(f) => upload("front", f)} uploading={uploading === "front"} />}
              actions={[
                { label: "Yes, correct card", primary: true, onClick: () => record("card", "approved") },
                { label: "Wrong card", danger: true, onClick: () => record("card", "rejected", { tags: ["wrong_card"] }) },
              ]}
              busy={busy}
            />
          )}

          {active === "listing" && (
            <StepBody
              hint={`The listing says ${gradeText(copy)}. Is it a genuine ${copy.grader} slab (their label, logo and holder, not a lookalike), and does the label show that grade?`}
              left={<Figure label="slab label (front)" src={frontView.src} sub={copy.source_title ?? undefined} tall onUpload={(f) => upload("front", f)} uploading={uploading === "front"} />}
              actions={[
                { label: `Yes, genuine ${gradeText(copy)}`, primary: true, onClick: () => record("listing", "approved") },
                { label: `Not a ${copy.grader} slab (other or fake grader)`, danger: true,
                  onClick: () => record("listing", "rejected", { tags: ["wrong_grader"], note: `not a genuine ${copy.grader} slab` }) },
                { label: "Different grade", danger: true, onClick: () => record("listing", "rejected", { tags: ["wrong_grade"] }) },
              ]}
              busy={busy}
            />
          )}

          {active === "cert" && (
            <StepBody
              hint="Is the cert number right? Compare it with the slab label (front) or the QR / barcode (back)."
              left={<Figure label="front" src={frontView.src} tall onUpload={(f) => upload("front", f)} uploading={uploading === "front"} />}
              right={<Figure label="back" src={backView.src} tall onUpload={(f) => upload("back", f)} uploading={uploading === "back"} />}
              extra={
                <div className="max-w-xl space-y-2">
                  {dupOf && (() => {
                    // Only the same card at the same grade can be the same slab listed twice;
                    // anything else means one of the two numbers is wrong (usually a typo here).
                    const same = dupOf.card_id === copy.card_id && dupOf.grader === copy.grader && dupOf.grade === copy.grade
                      && (dupOf.grade_label ?? null) === (copy.grade_label ?? null);
                    const other = (
                      <Link to={`/copies/${dupOf.id}`} className="text-accent hover:underline">
                        copy #{dupOf.id} ({dupOf.card_name} · {dupOf.set_name} #{dupOf.card_number} · {gradeText(dupOf)})
                      </Link>
                    );
                    return same ? (
                      <div className="text-xs border border-yellow/40 bg-yellow/5 rounded p-2 space-y-2">
                        <div>
                          Cert {cert.trim()} is already on {other}: the same card and grade, so most likely the same slab listed twice
                          (often once on eBay and once on Fanatics). Keep one: mark this listing a duplicate so the slab isn't counted twice.
                        </div>
                        <Actions busy={busy} actions={[
                          { label: "Mark this listing a duplicate", danger: true, onClick: () =>
                            record("cert", "rejected", { tags: ["duplicate_listing"], note: `same slab as copy #${dupOf.id}`, payload: { duplicate_of: dupOf.id, cert: cert.trim() } }) },
                        ]} />
                      </div>
                    ) : (
                      <div className="text-xs border border-red-400/40 bg-red-500/5 rounded p-2 space-y-1">
                        <div>
                          Cert {cert.trim()} belongs to a different slab: {other}. It can't be this copy's cert, so it wasn't saved.
                          Check the digits against the label{copy.cert_number ? ` (the stored number is ${copy.cert_number})` : ""}.
                          If you're sure this number is right, the other copy's cert is the wrong one: open it and fix it there first.
                        </div>
                      </div>
                    );
                  })()}
                  <label className="text-muted text-xs block mb-1">
                    Cert # {copy.cert_source && copy.cert_number && <span className="opacity-70">(from {copy.cert_source})</span>}
                  </label>
                  <input value={cert} onChange={(e) => { setCert(e.target.value.replace(/\D/g, "")); setDupOf(null); }} placeholder="digits only"
                    className={`w-full bg-bg border rounded px-2 py-1.5 text-sm font-mono outline-none focus:border-accent ${certChanged ? "border-yellow" : "border-border"}`} />
                  {certLookupUrl(copy.grader, cert.trim()) && (
                    <a href={certLookupUrl(copy.grader, cert.trim())!} target="_blank" rel="noreferrer" className="text-[10px] text-accent hover:underline">
                      open {copy.grader} cert page ↗ (grader's own photos)
                    </a>
                  )}
                </div>
              }
              actions={
                certChanged
                  ? [{ label: "Save corrected cert", primary: true, onClick: async () => {
                      setDupOf(null);
                      try {
                        if (t) await api.reviewCopy(copy.id, { verdict: "fixed", cert_number: cert.trim(), tags: ["cert_wrong"], note: "" });
                      } catch (e) {
                        const m = /copy (\d+)/.exec(String(e));
                        if (m) {   // another copy already has this cert: load it to compare
                          setDupOf(await api.getCopy(Number(m[1])));
                          return;
                        }
                        throw e;
                      }
                      await loadCopy();
                      await record("cert", "fixed", { tags: ["cert_wrong"], payload: { cert: cert.trim(), was: copy.cert_number } });
                    } },
                     { label: "Undo", onClick: () => { setCert(copy.cert_number); setDupOf(null); } }]
                  : [{ label: copy.cert_number ? "Cert is right" : "No cert visible", primary: true,
                       onClick: () => record("cert", copy.cert_number ? "approved" : "skipped") }]
              }
              busy={busy}
            />
          )}

          {active === "photos" && (
            <div className="space-y-3">
              <div className="text-xs text-muted">
                Pick the best full front and back from the listing photos (F / B). The picked listing photo is used right away;
                the stored full-size copy downloads in the background. You can also drop your own photo (e.g. from the grader's cert page).
              </div>
              {t?.detail?.ai_photos && (() => {
                const ai = t.detail!.ai_photos!;
                const same = (ai.front ?? null) === front && (ai.back ?? null) === back;
                return (
                  <div className="text-xs border border-accent/30 bg-accent/5 rounded p-2 flex flex-wrap items-center gap-2">
                    <span>
                      <span className="text-accent">AI pick</span>: front {ai.front ?? "none"}, back {ai.back ?? "none"}
                      <span className="text-muted"> · {Math.round((ai.confidence ?? 0) * 100)}% sure · {ai.reason}</span>
                    </span>
                    {!same && (
                      <button onClick={() => { setFront(ai.front ?? null); setBack(ai.back ?? null); }}
                        className="ml-auto text-xs border border-accent/50 text-accent rounded px-2 py-0.5 hover:bg-accent/10">
                        Use AI's picks
                      </button>
                    )}
                  </div>
                );
              })()}
              <Actions busy={busy} actions={
                frontChanged || backChanged
                  ? [{ label: "Save picks → front centering", primary: true, onClick: async () => {
                      await api.reviewCopy(copy.id, { verdict: "fixed", front_pos: frontChanged ? front ?? -1 : undefined,
                        back_pos: backChanged ? back ?? -1 : undefined, tags: [frontChanged ? "wrong_front" : "", backChanged ? "wrong_back" : ""].filter(Boolean), note: "" });
                      await loadCopy();
                      await record("photos", "fixed", { tags: [frontChanged ? "wrong_front" : "", backChanged ? "wrong_back" : ""].filter(Boolean), payload: { front, back } });
                    } },
                     { label: "Undo", onClick: () => { setFront(t?.front_pos ?? null); setBack(t?.back_pos ?? null); } }]
                  : [{ label: "Photos are right → front centering", primary: true, onClick: () => record("photos", "approved") }]
              } />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Chosen side="front" view={frontView} onUpload={(f) => upload("front", f)} uploading={uploading === "front"} />
                <Chosen side="back" view={backView} onUpload={(f) => upload("back", f)} uploading={uploading === "back"} />
              </div>
              {copy.photos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-2">
                  {copy.photos.map((p) => (
                    <PhotoPick key={p.position} photo={p} isFront={front === p.position} isBack={back === p.position}
                      ai={t?.detail?.ai_photos?.front === p.position ? "front" : t?.detail?.ai_photos?.back === p.position ? "back" : undefined}
                      onFront={() => { setFront(front === p.position ? null : p.position); if (back === p.position) setBack(null); }}
                      onBack={() => { setBack(back === p.position ? null : p.position); if (front === p.position) setFront(null); }} />
                  ))}
                </div>
              )}
            </div>
          )}

          {(["front", "back"] as const).map((side) => {
            const outer = `${side}_outer` as StepId;
            const inner = `${side}_inner` as StepId;
            if (active !== outer && active !== inner) return null;
            const path = side === "front" ? copy.front_image : copy.back_image;
            const pickPending = photosPending && decided.get("photos")?.decision === "fixed";
            return (
              <div key={side} className="space-y-2">
                <div className="text-xs text-muted">
                  {active === outer
                    ? "Put the four corners on the card's cut edge (not the slab). Zoom with TL / TR / BR / BL and nudge 1 pixel with the arrow keys."
                    : "Put the four lines on the inner border (where the border meets the print). Zoom with left / right / top / bottom."}
                  {pickPending && <span className="text-yellow"> The worker is still storing your new photo pick; this shows the previous one until it's done.</span>}
                </div>
                <CenteringEditor
                  key={`${side}-${path}`}
                  copyId={copy.id}
                  side={side}
                  imagePath={path}
                  measurements={centering.filter((m) => m.side === side)}
                  onSaved={setCentering}
                  stage={active === outer ? "outer" : "inner"}
                  onStageDone={(stage, decision, info) => {
                    if (stage === "outer") {
                      record(outer, decision, { tags: decision === "fixed" ? ["outer_edge_wrong"] : [], payload: info });
                    } else if (decision === "rejected") {
                      record(outer, "rejected", { payload: info }, false).then(() => record(inner, "rejected", { payload: info }));
                    } else {
                      record(inner, decision, { tags: decision === "fixed" ? ["inner_border_wrong"] : [], payload: info });
                    }
                  }}
                />
              </div>
            );
          })}

          {(active === "corners" || active === "edges") && (
            <div className="text-xs text-muted bg-surface border border-dashed border-border rounded-md p-6">
              {active === "corners"
                ? "Coming later: each corner front and back. Is it a clean quarter circle? Any whitening from a dull blade on the back?"
                : "Coming later: each edge. Fraying, silvering and other cutting imperfections."}
            </div>
          )}

          {active !== "corners" && active !== "edges" && decided.get(active) && (
            <div className="text-[10px] text-muted mt-3">
              Decided {decided.get(active)!.decision} by {decided.get(active)!.decided_by} · {new Date(decided.get(active)!.decided_at).toLocaleString()}.
              Redo it above to change it (the earlier decision stays in the history).
              <button className="ml-2 text-accent hover:underline" onClick={() => setActive(nextOf(active))}>next step →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const TRIAGE_TAGS = new Set(["wrong_front", "wrong_back", "closeup_picked", "better_photo_available", "wrong_card", "wrong_grade",
  "not_a_slab", "multiple_cards", "poor_quality", "cert_wrong", "other", "wrong_grader", "duplicate_listing"]);

type View = { src: string | null; sub?: string; pending: boolean; stored: boolean };

function viewFor(side: string, stored: string | null, pick: CopyPhoto | null, usePick: boolean): View {
  if (usePick && pick) {
    return { src: pick.url, sub: `listing photo #${pick.position} (stored copy downloading)`, pending: true, stored: false };
  }
  if (stored) return { src: imageUrl(stored), stored: true, pending: false };
  if (pick) return { src: pick.url, sub: `listing photo #${pick.position}`, pending: true, stored: false };
  return { src: null, sub: `no ${side} yet`, pending: false, stored: false };
}

// ── pieces ───────────────────────────────────────────────────────────────────

const REMOVE_REASONS = [
  { value: "wrong_card", label: "wrong card", tag: "wrong_card" },
  { value: "fake_slab", label: "not a genuine slab", tag: "wrong_grader" },
  { value: "cut_off", label: "card cut off / no full photo", tag: "poor_quality" },
  { value: "bad_photos", label: "photos unusable (blur, glare, angle)", tag: "poor_quality" },
  { value: "not_slab", label: "not a graded slab", tag: "not_a_slab" },
  { value: "duplicate", label: "duplicate listing", tag: "duplicate_listing" },
  { value: "other", label: "other", tag: "other" },
];

function RemoveCopy({ busy, onRemove }: { busy: boolean; onRemove: (reason: string, note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("cut_off");
  const [note, setNote] = useState("");
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="drop this copy from the dataset (any step)"
        className="w-full text-xs border border-red-400/40 text-red-400 rounded px-2 py-1 hover:bg-red-500/10">
        Remove from dataset…
      </button>
    );
  }
  return (
    <div className="border border-red-400/40 rounded p-2 space-y-1.5">
      <div className="text-[10px] text-muted">Removed copies leave every queue, the centering worker and the backtest (kept as a marker so the scraper doesn't add it back).</div>
      <select value={reason} onChange={(e) => setReason(e.target.value)}
        className="w-full bg-bg border border-border rounded px-2 py-1 text-xs outline-none focus:border-accent">
        {REMOVE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (optional)"
        className="w-full bg-bg border border-border rounded px-2 py-1 text-xs outline-none focus:border-accent" />
      <div className="flex gap-1">
        <button disabled={busy} onClick={() => onRemove(reason, note)}
          className="flex-1 text-xs bg-red-500/20 text-red-400 border border-red-400/40 rounded px-2 py-1 hover:bg-red-500/30 disabled:opacity-40">
          Remove & next
        </button>
        <button onClick={() => setOpen(false)} className="text-xs border border-border text-muted rounded px-2 py-1">Cancel</button>
      </div>
    </div>
  );
}

// which factory station a review step belongs to
const STEP_STATION: Record<string, string> = {
  card: "card", listing: "grade", cert: "cert", photos: "photos",
  front_outer: "front", front_inner: "front", back_outer: "back", back_inner: "back",
};

const MACHINE: Record<string, { icon: string; cls: string; text: string }> = {
  high: { icon: "auto ✓", cls: "text-green", text: "machine is sure: auto-passed, no review needed" },
  medium: { icon: "~", cls: "text-yellow", text: "machine thinks so but couldn't prove it: worth a quick look" },
  low: { icon: "!", cls: "text-red-400", text: "machine is unsure or something disagrees: needs you" },
  queued: { icon: "…", cls: "text-muted", text: "still in the machine's queue" },
  upstream: { icon: "…", cls: "text-muted", text: "waiting for an earlier machine" },
  "n/a": { icon: "–", cls: "text-muted", text: "doesn't apply to this copy" },
};

function MachineMark({ state }: { state?: string }) {
  const m = state ? MACHINE[state] : undefined;
  if (!m) return <span className="text-muted">•</span>;
  return <span className={`text-[10px] ${m.cls}`} title={m.text}>{m.icon}</span>;
}

function StepHeader({ step, decision, machine }: { step: Step; decision?: StepDecision; machine?: string }) {
  const st = decision ? DECISION_STYLE[decision] : null;
  const m = machine ? MACHINE[machine] : undefined;
  return (
    <div className="flex flex-wrap items-baseline gap-2 mb-2">
      <span className="font-mono text-accent text-xs">{step.n}</span>
      <h2 className="text-sm font-semibold">{step.title}</h2>
      {st && <span className={`text-xs ${st.cls}`}>{st.icon} {st.label}</span>}
      {m && !st && <span className={`text-xs ${m.cls}`}>{m.icon} · {m.text}</span>}
    </div>
  );
}

type Action = { label: string; onClick: () => void | Promise<void>; primary?: boolean; danger?: boolean };

function Actions({ actions, busy }: { actions: Action[]; busy: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const run = async (a: Action) => {
    setErr(null);
    setRunning(true);
    try {
      await a.onClick();
    } catch (e) {
      setErr(String(e).replace(/^Error: /, ""));
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="space-y-1">
    {err && <div className="text-xs text-red-400">Couldn't save: {err}</div>}
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a.label}
          disabled={busy || running}
          onClick={() => { void run(a); }}
          data-primary-action={a.primary ? "" : undefined}
          className={
            a.primary
              ? "bg-accent text-bg font-semibold px-4 py-1.5 rounded text-sm hover:bg-accent/90 disabled:opacity-40"
              : a.danger
                ? "text-sm border border-red-400/40 text-red-400 rounded px-3 py-1.5 hover:bg-red-500/10 disabled:opacity-40"
                : "text-sm border border-border text-muted rounded px-3 py-1.5 hover:text-[#e6edf3] disabled:opacity-40"
          }
        >
          {running ? "…" : a.label}
        </button>
      ))}
    </div>
    </div>
  );
}

function StepBody({ hint, left, right, extra, actions, busy }: {
  hint: string; left: React.ReactNode; right?: React.ReactNode; extra?: React.ReactNode; actions: Action[]; busy: boolean;
}) {
  // Enter = the primary action (when not typing)
  useEffect(() => {
    const primary = actions.find((a) => a.primary);
    if (!primary) return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "CANVAS" || busy) return;
      if (e.key === "Enter") {
        e.preventDefault();
        (document.querySelector("[data-primary-action]") as HTMLButtonElement | null)?.click();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, busy]);
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">{hint} <span className="opacity-60">(Enter = {actions.find((a) => a.primary)?.label})</span></div>
      {extra}
      <Actions actions={actions} busy={busy} />
      <div className={`grid gap-3 ${right ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
        {left}
        {right}
      </div>
    </div>
  );
}

function Figure({ label, src, sub, tall, onUpload, uploading }: {
  label: string; src: string | null; sub?: string; tall?: boolean;
  /** drop / paste / choose a replacement (e.g. the grader's cert-page scan) */
  onUpload?: (f: File) => void; uploading?: boolean;
}) {
  const drop = useDrop(onUpload);
  return (
    <div className={`bg-surface border rounded-md p-2 ${drop.over ? "border-accent/60" : "border-border"}`} {...drop.props}>
      <div className="flex justify-between text-[10px] text-muted mb-1">
        <span className="uppercase tracking-widest">{label}</span>
        {sub && <span className="truncate ml-2">{sub}</span>}
      </div>
      {src ? (
        <a href={src} target="_blank" rel="noreferrer">
          <img src={src} alt={label} className={`w-full object-contain bg-bg rounded ${tall ? "max-h-[75vh]" : "max-h-[65vh]"}`} />
        </a>
      ) : (
        <div className="aspect-[5/7] max-h-[60vh] bg-bg border border-dashed border-border rounded flex items-center justify-center text-xs text-muted">no image</div>
      )}
      {onUpload && <UploadLabel text={`drop, paste or choose the grader's scan / your own photo (${label})`} uploading={!!uploading} onUpload={onUpload} />}
    </div>
  );
}

/** Drag-and-drop + paste (while the pointer is over the element) of one image. */
function useDrop(onUpload?: (f: File) => void) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!over || !onUpload) return;
    function onPaste(e: ClipboardEvent) {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (f) {
        e.preventDefault();
        onUpload!(f);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [over, onUpload]);
  if (!onUpload) return { over: false, props: {} };
  return {
    over,
    props: {
      onMouseEnter: () => setOver(true),
      onMouseLeave: () => setOver(false),
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setOver(false);
        const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
        if (f) onUpload(f);
      },
    },
  };
}

function UploadLabel({ text, uploading, onUpload }: { text: string; uploading: boolean; onUpload: (f: File) => void }) {
  return (
    <label className="block text-center text-[10px] text-muted mt-1 cursor-pointer hover:text-accent">
      {uploading ? "uploading…" : text}
      <input type="file" accept="image/*" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onUpload(f);
        e.target.value = "";
      }} />
    </label>
  );
}

function History({ steps }: { steps: ReviewSteps }) {
  const label = (s: string) => STEPS.find((x) => x.id === s)?.title ?? s;
  if (steps.events.length === 0) return null;
  return (
    <div className="bg-surface border border-border rounded-md p-2">
      <div className="text-[10px] uppercase tracking-widest text-muted mb-1">History for this copy</div>
      <div className="space-y-1 max-h-72 overflow-auto">
        {steps.events.map((e) => {
          const st = DECISION_STYLE[e.decision as StepDecision];
          return (
            <div key={e.id} className="text-[10px] flex gap-1.5">
              <span className={st?.cls ?? "text-muted"}>{st?.icon ?? "•"}</span>
              <span className="flex-1">
                <span className="text-[#e6edf3]">{e.step === "complete" ? "Completed" : label(e.step)}</span>{" "}
                <span className="text-muted">{e.decision}{e.note ? ` · ${e.note}` : ""}{e.tags.length ? ` · ${e.tags.join(", ")}` : ""}</span>
              </span>
              <span className="text-muted whitespace-nowrap">{new Date(e.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The grader's public cert page, which shows their own photos of the slab. */
export function certLookupUrl(grader: string, cert: string): string | null {
  if (!/^\d{6,15}$/.test(cert)) return null;
  switch (grader.toUpperCase()) {
    case "PSA":
      return `https://www.psacard.com/cert/${cert}/psa`;
    case "CGC":
      return `https://www.cgccards.com/certlookup/${cert}/`;
    default:
      return null;
  }
}

function Chosen({ side, view, onUpload, uploading }: {
  side: string; view: View; onUpload: (f: File) => void; uploading: boolean;
}) {
  const drop = useDrop(onUpload);
  return (
    <div className={`bg-surface border rounded-md p-2 ${drop.over ? "border-accent/60" : "border-border"}`} {...drop.props}>
      <div className="flex justify-between text-[10px] text-muted mb-1">
        <span className="uppercase tracking-widest">{side}</span>
        <span className={view.pending ? "text-yellow" : ""}>{view.sub ?? (view.stored ? "stored photo" : "")}</span>
      </div>
      {view.src ? (
        <a href={view.src} target="_blank" rel="noreferrer">
          <img src={view.src} alt={side} className="w-full max-h-[60vh] object-contain bg-bg rounded" />
        </a>
      ) : (
        <div className="aspect-[5/7] max-h-[60vh] bg-bg border border-dashed border-border rounded flex items-center justify-center text-xs text-muted">
          pick a listing photo below, or drop your own
        </div>
      )}
      <UploadLabel text={`or drop, paste or choose your own ${side} photo`} uploading={uploading} onUpload={onUpload} />
    </div>
  );
}

function PhotoPick({ photo, isFront, isBack, onFront, onBack, ai }: {
  photo: CopyPhoto; isFront: boolean; isBack: boolean; onFront: () => void; onBack: () => void; ai?: "front" | "back";
}) {
  const ring = isFront ? "border-accent" : isBack ? "border-purple" : "border-border";
  return (
    <div className={`border-2 ${ring} rounded p-1 bg-bg`}>
      <a href={photo.url} target="_blank" rel="noreferrer">
        <img src={photo.thumb_url} alt={`photo ${photo.position}`} loading="lazy" className="w-full aspect-square object-contain" />
      </a>
      <div className="flex items-center justify-between mt-1 text-[9px] text-muted">
        <span>#{photo.position}</span>
        <span title="worker label / score">
          {ai && <span className="text-accent mr-1" title="the AI photo picker's choice">AI: {ai}</span>}
          {photo.label ?? "unlabelled"}{photo.score ? ` ${photo.score.toFixed(2)}` : ""}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1 mt-1">
        <button onClick={onFront} className={`text-[10px] rounded py-0.5 border ${isFront ? "bg-accent text-bg border-accent" : "border-border text-muted hover:text-accent"}`}>F</button>
        <button onClick={onBack} className={`text-[10px] rounded py-0.5 border ${isBack ? "bg-purple text-bg border-purple" : "border-border text-muted hover:text-purple"}`}>B</button>
      </div>
    </div>
  );
}
