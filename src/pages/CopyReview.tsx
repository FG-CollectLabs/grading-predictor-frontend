import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, imageUrl } from "../api";
import type { CopyDetail, CopyPhoto, ReviewVerdict } from "../types";
import { FLAG_LABELS, StatusBadge, gradeText } from "./Copies";

// Review one feed copy's photo triage: every listing photo with the worker's
// label, the chosen front/back, the cert. Corrections are stored next to the
// worker's picks (never over them) and sent back to the worker, which
// downloads the chosen photos at full size.

const TAGS: { value: string; label: string }[] = [
  { value: "wrong_front", label: "wrong front" },
  { value: "wrong_back", label: "wrong back" },
  { value: "closeup_picked", label: "close-up picked" },
  { value: "better_photo_available", label: "better photo available" },
  { value: "wrong_card", label: "wrong card" },
  { value: "wrong_grade", label: "wrong grade" },
  { value: "not_a_slab", label: "not a slab" },
  { value: "multiple_cards", label: "multiple cards" },
  { value: "poor_quality", label: "poor photo quality" },
  { value: "cert_wrong", label: "cert wrong" },
  { value: "other", label: "other" },
];

export default function CopyReview() {
  const { id } = useParams<{ id: string }>();
  const copyId = Number(id);
  const { search } = useLocation();
  const navigate = useNavigate();

  const [copy, setCopy] = useState<CopyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [front, setFront] = useState<number | null>(null);
  const [back, setBack] = useState<number | null>(null);
  const [cert, setCert] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const [uploading, setUploading] = useState<"front" | "back" | null>(null);

  // Your own photo (e.g. saved from the grader's cert page) replaces the
  // listing photo for that side; the worker never overwrites an upload.
  const upload = useCallback(
    async (side: "front" | "back", file: File) => {
      setUploading(side);
      setError(null);
      try {
        await api.uploadCertImage(copyId, side, file);
        const c = await api.getCopy(copyId);
        setCopy(c);
        setTags((tg) => (tg.includes("better_photo_available") ? tg : [...tg, "better_photo_available"]));
        setSaved(`Uploaded your ${side} photo. Save to record the review.`);
      } catch (e) {
        setError(String(e));
      } finally {
        setUploading(null);
      }
    },
    [copyId],
  );

  const load = useCallback(() => {
    setError(null);
    setSaved(null);
    api
      .getCopy(copyId)
      .then((c) => {
        setCopy(c);
        setFront(c.triage?.front_pos ?? null);
        setBack(c.triage?.back_pos ?? null);
        setCert(c.cert_number);
        setTags(c.triage?.review_tags ?? []);
        setNote(c.triage?.review_note ?? "");
      })
      .catch((e: unknown) => setError(String(e)));
  }, [copyId]);

  useEffect(load, [load]);

  const t = copy?.triage ?? null;
  const frontChanged = t !== null && front !== (t.front_pos ?? null);
  const backChanged = t !== null && back !== (t.back_pos ?? null);
  const certChanged = copy !== null && cert.trim() !== copy.cert_number;
  const changed = frontChanged || backChanged || certChanged;

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

  const submit = useCallback(
    async (verdict: ReviewVerdict, thenNext: boolean) => {
      if (!copy || !t || saving) return;
      setSaving(true);
      setError(null);
      try {
        const updated = await api.reviewCopy(copy.id, {
          verdict,
          front_pos: frontChanged ? front ?? -1 : undefined,
          back_pos: backChanged ? back ?? -1 : undefined,
          cert_number: certChanged ? cert.trim() : undefined,
          tags,
          note,
        });
        setCopy(updated);
        setSaved(
          frontChanged || backChanged
            ? "Saved. The worker will download your picks shortly (corrections jump the queue)."
            : "Saved.",
        );
        if (thenNext) await goNext();
      } catch (e) {
        setError(String(e));
      } finally {
        setSaving(false);
      }
    },
    [copy, t, saving, frontChanged, backChanged, certChanged, front, back, cert, tags, note, goNext],
  );

  // Keyboard: Enter = save (ok, or fixed if anything changed) and next; n = skip.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(changed ? "fixed" : "ok", true);
        return;
      }
      if (e.key === "Enter") submit(changed ? "fixed" : "ok", true);
      else if (e.key === "n") goNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit, goNext, changed]);

  if (error && !copy) return <div className="text-red-400 py-12 text-center">{error}</div>;
  if (!copy) return <div className="text-muted py-12 text-center">Loading…</div>;

  const flags = t?.detail?.flags ?? copy.flags;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 text-xs text-muted">
        <Link to={`/copies${search}`} className="hover:text-accent transition-colors">← Copies</Link>
        <span className="text-border">/</span>
        <Link to={`/cards/${copy.card_id}`} className="hover:text-accent">{copy.card_name}</Link>
        <span className="text-border">/</span>
        <span className="text-[#e6edf3]">copy #{copy.id}</span>
      </div>

      <div className="bg-surface border border-border rounded-md p-4 mb-4 flex flex-wrap items-start gap-4">
        {copy.card.image_url && (
          <img src={copy.card.image_url} alt="catalog" className="w-16 rounded border border-border" title="catalog image (what the worker matches fronts against)" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{copy.card_name}</h1>
            <StatusBadge copy={copy} />
          </div>
          <div className="text-xs text-muted">
            {copy.set_name} · #{copy.card_number}{copy.language ? ` · ${copy.language}` : ""} · <span className="text-[#e6edf3] font-semibold">{gradeText(copy)}</span>
          </div>
          {copy.source_title && (
            <div className="text-xs text-muted mt-1 truncate" title={copy.source_title}>
              “{copy.source_title}”{" "}
              {copy.source_ref && (
                <a href={copy.source_ref} target="_blank" rel="noreferrer" className="text-accent hover:underline">listing ↗</a>
              )}
            </div>
          )}
          {flags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {flags.map((f) => (
                <span key={f} className="text-[10px] text-orange-300 border border-orange-300/30 rounded px-1.5">{FLAG_LABELS[f] ?? f}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {!t && (
        <div className="text-muted text-xs mb-4">This copy has no listing photos to triage (hand intake or no photos in the feed).</div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Chosen side="front" path={copy.front_image} pick={front} auto={t?.auto_front_pos ?? t?.front_pos ?? null} changed={frontChanged} onUpload={(f) => upload("front", f)} uploading={uploading === "front"} />
            <Chosen side="back" path={copy.back_image} pick={back} auto={t?.auto_back_pos ?? t?.back_pos ?? null} changed={backChanged} onUpload={(f) => upload("back", f)} uploading={uploading === "back"} />
          </div>

          {copy.photos.length > 0 && (
            <div>
              <div className="text-muted text-[10px] uppercase tracking-widest mb-2">
                Listing photos ({copy.photos.length}): click F / B to choose
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {copy.photos.map((p) => (
                  <PhotoPick
                    key={p.position}
                    photo={p}
                    isFront={front === p.position}
                    isBack={back === p.position}
                    onFront={() => { setFront(front === p.position ? null : p.position); if (back === p.position) setBack(null); }}
                    onBack={() => { setBack(back === p.position ? null : p.position); if (front === p.position) setFront(null); }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-surface border border-border rounded-md p-4 space-y-4 self-start">
          <div>
            <label className="text-muted text-xs block mb-1">
              Cert # {copy.cert_source && copy.cert_number && <span className="opacity-70">(from {copy.cert_source})</span>}
            </label>
            <input
              value={cert}
              onChange={(e) => setCert(e.target.value.replace(/\D/g, ""))}
              placeholder="digits only"
              className={`w-full bg-bg border rounded px-2 py-1.5 text-sm font-mono outline-none focus:border-accent ${certChanged ? "border-yellow" : "border-border"}`}
            />
            {certLookupUrl(copy.grader, cert.trim()) && (
              <a href={certLookupUrl(copy.grader, cert.trim())!} target="_blank" rel="noreferrer" className="text-[10px] text-accent hover:underline">
                open {copy.grader} cert page ↗ (grader's own photos)
              </a>
            )}
          </div>

          <div>
            <div className="text-muted text-xs mb-1">What was wrong? (feeds back into tuning)</div>
            <div className="flex flex-wrap gap-1">
              {TAGS.map((tg) => {
                const on = tags.includes(tg.value);
                return (
                  <button
                    key={tg.value}
                    onClick={() => setTags(on ? tags.filter((x) => x !== tg.value) : [...tags, tg.value])}
                    className={`text-[10px] rounded px-1.5 py-0.5 border ${on ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:text-[#e6edf3]"}`}
                  >
                    {tg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-muted text-xs block mb-1">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full bg-bg border border-border rounded px-2 py-1.5 text-xs outline-none focus:border-accent"
            />
          </div>

          {error && <div className="text-red-400 text-xs">{error}</div>}
          {saved && <div className="text-green text-xs">{saved}</div>}

          <div className="flex flex-col gap-2">
            <button
              disabled={!t || saving}
              onClick={() => submit(changed ? "fixed" : "ok", true)}
              className="bg-accent text-bg font-semibold px-3 py-1.5 rounded text-sm hover:bg-accent/90 disabled:opacity-40"
            >
              {changed ? "Save fix & next" : "Looks right & next"} <span className="opacity-60 text-[10px]">Enter</span>
            </button>
            <div className="flex gap-2">
              <button
                disabled={!t || saving}
                onClick={() => submit("unusable", true)}
                className="flex-1 text-xs border border-red-400/40 text-red-400 rounded px-2 py-1 hover:bg-red-500/10 disabled:opacity-40"
                title="No usable photos or wrong listing: keeps it out of the dataset"
              >
                Unusable
              </button>
              <button onClick={goNext} className="flex-1 text-xs border border-border text-muted rounded px-2 py-1 hover:text-[#e6edf3]">
                Skip <span className="opacity-60 text-[10px]">n</span>
              </button>
            </div>
          </div>

          {t?.reviewed_at && (
            <div className="text-[10px] text-muted">
              Reviewed by {t.reviewed_by} · {new Date(t.reviewed_at).toLocaleString()} · {t.verdict}
            </div>
          )}
          {t && (
            <div className="text-[10px] text-muted">
              Worker: {t.status}{t.attempts ? ` · ${t.attempts} attempt${t.attempts === 1 ? "" : "s"}` : ""}
              {t.detail?.codes && t.detail.codes.length > 0 && <> · codes read: {t.detail.codes.map((c) => c.fmt).join(", ")}</>}
              {t.detail?.error && <div className="text-red-400">{t.detail.error}</div>}
            </div>
          )}
        </div>
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

function Chosen({ side, path, pick, auto, changed, onUpload, uploading }: {
  side: string; path: string | null; pick: number | null; auto: number | null; changed: boolean;
  onUpload: (f: File) => void; uploading: boolean;
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
        <span>
          {changed ? (
            <span className="text-yellow">your pick: {pick === null ? "none" : `#${pick}`} (worker: {auto === null ? "none" : `#${auto}`})</span>
          ) : (
            <>photo {pick === null ? "none" : `#${pick}`}</>
          )}
        </span>
      </div>
      {path ? (
        <a href={imageUrl(path)} target="_blank" rel="noreferrer">
          <img src={imageUrl(path)} alt={side} className="w-full max-h-[60vh] object-contain bg-bg rounded" />
        </a>
      ) : (
        <div className="aspect-[5/7] max-h-[60vh] bg-bg border border-dashed border-border rounded flex items-center justify-center text-xs text-muted">
          no {side} stored
        </div>
      )}
      <label className="block text-center text-[10px] text-muted mt-1 cursor-pointer hover:text-accent">
        {uploading ? "uploading…" : `drop, paste or choose your own ${side} photo`}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
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
        <span title="worker label / score">
          {photo.label ?? "unlabelled"}
          {photo.score ? ` ${photo.score.toFixed(2)}` : ""}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1 mt-1">
        <button onClick={onFront} className={`text-[10px] rounded py-0.5 border ${isFront ? "bg-accent text-bg border-accent" : "border-border text-muted hover:text-accent"}`}>F</button>
        <button onClick={onBack} className={`text-[10px] rounded py-0.5 border ${isBack ? "bg-purple text-bg border-purple" : "border-border text-muted hover:text-purple"}`}>B</button>
      </div>
    </div>
  );
}
