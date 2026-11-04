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
  { id: "listing", n: "1", title: "Grade & grader match the slab?" },
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
      .then(([, s, m]) => {
        setSteps(s);
        setCentering(m.measurements);
        const done = new Set(s.steps.map((x) => x.step));
        setActive(REQUIRED.find((x) => !done.has(x)) ?? "back_inner");
      })
      .catch((e: unknown) => setError(String(e)));
  }, [copyId, loadCopy]);

  const decided = useMemo(() => new Map((steps?.steps ?? []).map((s) => [s.step, s])), [steps]);
  const rejectedEarly = decided.get("card")?.decision === "rejected" || decided.get("listing")?.decision === "rejected";
  const allDecided = rejectedEarly || REQUIRED.every((s) => decided.has(s));

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

  const goNext = useCallback(async () => {
    const p = new URLSearchParams(search);
    p.set("limit", "3");
    p.delete("offset");
    try {
      const list = await api.listCopies(p);
      const next = list.items.find((c) => c.id !== copyId);
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

  // Your own photo replaces the listing photo for that side (the worker never
  // overwrites an upload); for when the grader's cert-page photo is better.
  const upload = useCallback(
    async (side: "front" | "back", file: File) => {
      setUploading(side);
      setError(null);
      try {
        await api.uploadCertImage(copyId, side, file);
        await loadCopy();
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
      if (e.key === "n") goNext();
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
                  {s.soon ? <span className="text-[9px] text-muted">later</span> : st ? <span className={st.cls} title={`${st.label} by ${d!.decided_by}`}>{st.icon}</span> : <span className="text-muted">•</span>}
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
              <button onClick={goNext} className="w-full text-xs border border-border text-muted rounded px-2 py-1 hover:text-[#e6edf3]">
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
          <StepHeader step={STEPS.find((s) => s.id === active)!} decision={decided.get(active)?.decision} />

          {active === "card" && (
            <StepBody
              hint="Does the listing actually show this card (name, number, set, language)?"
              left={<Figure label="catalog image" src={copy.card.image_url} />}
              right={<Figure label="listing front" src={frontView.src} sub={frontView.sub} />}
              actions={[
                { label: "Yes, correct card", primary: true, onClick: () => record("card", "approved") },
                { label: "Wrong card", danger: true, onClick: () => record("card", "rejected", { tags: ["wrong_card"] }) },
              ]}
              busy={busy}
            />
          )}

          {active === "listing" && (
            <StepBody
              hint={`The listing says ${gradeText(copy)}. Does the slab's label agree (grader and grade)?`}
              left={<Figure label="slab label (front)" src={frontView.src} sub={copy.source_title ?? undefined} tall />}
              actions={[
                { label: `Yes, ${gradeText(copy)}`, primary: true, onClick: () => record("listing", "approved") },
                { label: "Grade or grader is wrong", danger: true, onClick: () => record("listing", "rejected", { tags: ["wrong_grade"] }) },
              ]}
              busy={busy}
            />
          )}

          {active === "cert" && (
            <StepBody
              hint="Is the cert number right? Compare it with the slab label (front) or the QR / barcode (back)."
              left={<Figure label="front label" src={frontView.src} tall />}
              right={<Figure label="back (QR)" src={backView.src} tall />}
              extra={
                <div className="max-w-sm">
                  <label className="text-muted text-xs block mb-1">
                    Cert # {copy.cert_source && copy.cert_number && <span className="opacity-70">(from {copy.cert_source})</span>}
                  </label>
                  <input value={cert} onChange={(e) => setCert(e.target.value.replace(/\D/g, ""))} placeholder="digits only"
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
                      if (t) await api.reviewCopy(copy.id, { verdict: "fixed", cert_number: cert.trim(), tags: ["cert_wrong"], note: "" });
                      await loadCopy();
                      await record("cert", "fixed", { tags: ["cert_wrong"], payload: { cert: cert.trim(), was: copy.cert_number } });
                    } },
                     { label: "Undo", onClick: () => setCert(copy.cert_number) }]
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Chosen side="front" view={frontView} onUpload={(f) => upload("front", f)} uploading={uploading === "front"} />
                <Chosen side="back" view={backView} onUpload={(f) => upload("back", f)} uploading={uploading === "back"} />
              </div>
              {copy.photos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-2">
                  {copy.photos.map((p) => (
                    <PhotoPick key={p.position} photo={p} isFront={front === p.position} isBack={back === p.position}
                      onFront={() => { setFront(front === p.position ? null : p.position); if (back === p.position) setBack(null); }}
                      onBack={() => { setBack(back === p.position ? null : p.position); if (front === p.position) setFront(null); }} />
                  ))}
                </div>
              )}
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
  "not_a_slab", "multiple_cards", "poor_quality", "cert_wrong", "other"]);

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

function StepHeader({ step, decision }: { step: Step; decision?: StepDecision }) {
  const st = decision ? DECISION_STYLE[decision] : null;
  return (
    <div className="flex items-baseline gap-2 mb-2">
      <span className="font-mono text-accent text-xs">{step.n}</span>
      <h2 className="text-sm font-semibold">{step.title}</h2>
      {st && <span className={`text-xs ${st.cls}`}>{st.icon} {st.label}</span>}
    </div>
  );
}

type Action = { label: string; onClick: () => void | Promise<void>; primary?: boolean; danger?: boolean };

function Actions({ actions, busy }: { actions: Action[]; busy: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a.label}
          disabled={busy}
          onClick={() => { void a.onClick(); }}
          className={
            a.primary
              ? "bg-accent text-bg font-semibold px-4 py-1.5 rounded text-sm hover:bg-accent/90 disabled:opacity-40"
              : a.danger
                ? "text-sm border border-red-400/40 text-red-400 rounded px-3 py-1.5 hover:bg-red-500/10 disabled:opacity-40"
                : "text-sm border border-border text-muted rounded px-3 py-1.5 hover:text-[#e6edf3] disabled:opacity-40"
          }
        >
          {a.label}
        </button>
      ))}
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
      if (e.key === "Enter") { e.preventDefault(); void primary!.onClick(); }
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

function Figure({ label, src, sub, tall }: { label: string; src: string | null; sub?: string; tall?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-md p-2">
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
    </div>
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
  const [over, setOver] = useState(false);
  // Paste works while the pointer is over this panel.
  useEffect(() => {
    if (!over) return;
    function onPaste(e: ClipboardEvent) {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (f) {
        e.preventDefault();
        onUpload(f);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [over, onUpload]);
  return (
    <div
      className={`bg-surface border rounded-md p-2 ${over ? "border-accent/60" : "border-border"}`}
      onMouseEnter={() => setOver(true)}
      onMouseLeave={() => setOver(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
        if (f) onUpload(f);
      }}
    >
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
      <label className="block text-center text-[10px] text-muted mt-1 cursor-pointer hover:text-accent">
        {uploading ? "uploading…" : `or drop, paste or choose your own ${side} photo`}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }} />
      </label>
    </div>
  );
}

function PhotoPick({ photo, isFront, isBack, onFront, onBack }: {
  photo: CopyPhoto; isFront: boolean; isBack: boolean; onFront: () => void; onBack: () => void;
}) {
  const ring = isFront ? "border-accent" : isBack ? "border-purple" : "border-border";
  return (
    <div className={`border-2 ${ring} rounded p-1 bg-bg`}>
      <a href={photo.url} target="_blank" rel="noreferrer">
        <img src={photo.thumb_url} alt={`photo ${photo.position}`} loading="lazy" className="w-full aspect-square object-contain" />
      </a>
      <div className="flex items-center justify-between mt-1 text-[9px] text-muted">
        <span>#{photo.position}</span>
        <span title="worker label / score">{photo.label ?? "unlabelled"}{photo.score ? ` ${photo.score.toFixed(2)}` : ""}</span>
      </div>
      <div className="grid grid-cols-2 gap-1 mt-1">
        <button onClick={onFront} className={`text-[10px] rounded py-0.5 border ${isFront ? "bg-accent text-bg border-accent" : "border-border text-muted hover:text-accent"}`}>F</button>
        <button onClick={onBack} className={`text-[10px] rounded py-0.5 border ${isBack ? "bg-purple text-bg border-purple" : "border-border text-muted hover:text-purple"}`}>B</button>
      </div>
    </div>
  );
}
