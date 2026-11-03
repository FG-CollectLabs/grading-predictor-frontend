// Graded-copy intake: build the centering backtest set one copy at a time.
// Pick a card once, then for each copy: grader + grade, front + back photo,
// Save & next. Opened from the market tracker as
//   #/intake?display_key=…&name=…&set_name=…&set_code=…&number=…&image_url=…
// or from a predictor card as #/intake?card_id=….
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { Card, CardDetail, CopiesSummary, CopySource, GradeLabel } from "../types";

type Grader = "PSA" | "CGC" | "BGS" | "TAG" | "SGC" | "Raw";

interface GradeOption {
  key: string;
  label: string;
  grade: number;
  gradeLabel: GradeLabel | null;
}

const HALF_DOWN = [9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1];

function options(grader: Grader): GradeOption[] {
  const plain = (g: number): GradeOption => ({ key: `${g}`, label: `${g}`, grade: g, gradeLabel: null });
  switch (grader) {
    case "PSA": // PSA has half grades below 9 but no 9.5
      return [10, ...HALF_DOWN.filter((g) => g !== 9.5)].map(plain);
    case "BGS":
      return [
        { key: "10bl", label: "10 Black Label", grade: 10, gradeLabel: "black_label" },
        { key: "10p", label: "10 Pristine", grade: 10, gradeLabel: "pristine" },
        ...HALF_DOWN.map(plain),
      ];
    case "CGC":
    case "TAG":
    case "SGC":
      return [
        { key: "10p", label: "10 Pristine", grade: 10, gradeLabel: "pristine" },
        { key: "10", label: "10 Gem Mint", grade: 10, gradeLabel: null },
        ...HALF_DOWN.map(plain),
      ];
    case "Raw":
      return [];
  }
}

const SOURCES: Array<{ value: CopySource; label: string }> = [
  { value: "ebay", label: "eBay" },
  { value: "fanatics", label: "Fanatics" },
  { value: "owned", label: "Our slab" },
  { value: "consigner", label: "Consigner" },
  { value: "other", label: "Other" },
];

function gradeText(grader: string, grade: number | null, label: GradeLabel | null): string {
  if (grade === null) return "Raw";
  const suffix = label === "pristine" ? " Pristine" : label === "black_label" ? " Black Label" : "";
  return `${grader} ${grade}${suffix}`;
}

interface Saved {
  id: number;
  text: string;
  front: string | null; // object URLs for the session list
  back: string | null;
}

// Remount on a new query string so a different card (or none) starts clean.
export default function Intake() {
  const [params] = useSearchParams();
  return <IntakeForm key={params.toString()} />;
}

function IntakeForm() {
  const [params] = useSearchParams();
  const displayKey = params.get("display_key");
  const cardIdParam = params.get("card_id");

  // ── Card ───────────────────────────────────────────────────────────────────
  const [card, setCard] = useState<CardDetail | null>(null);
  const [pendingCard, setPendingCard] = useState<{
    set_code: string; set_name: string; card_name: string; card_number: string; image_url?: string;
  } | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [cardFilter, setCardFilter] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (cardIdParam) {
          const c = await api.getCard(Number(cardIdParam));
          if (!cancelled) setCard(c);
        } else if (displayKey) {
          const c = await api.getCardByMarketKey(displayKey);
          if (cancelled) return;
          if (c) {
            setCard(c);
          } else {
            const name = params.get("name") ?? "";
            const number = params.get("number") ?? "";
            const setName = params.get("set_name") ?? "";
            const setCode = params.get("set_code") ?? "";
            if (!name || !number || !(setName || setCode)) {
              setLoadError(`No predictor card is linked to ${displayKey}, and the link didn't include name, number and set to create one.`);
            } else {
              setPendingCard({
                set_code: setCode || setName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12),
                set_name: setName || setCode,
                card_name: name,
                card_number: number,
                image_url: params.get("image_url") ?? undefined,
              });
            }
          }
        } else {
          const list = await api.listCards();
          if (!cancelled) setCards(list ?? []);
        }
      } catch (e) {
        if (!cancelled) setLoadError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [cardIdParam, displayKey, params]);

  const [summary, setSummary] = useState<CopiesSummary | null>(null);
  const refreshSummary = useCallback((id: number) => {
    api.getCopies(id).then(setSummary).catch(() => null);
  }, []);
  useEffect(() => { if (card) refreshSummary(card.id); }, [card, refreshSummary]);

  // ── Copy form ──────────────────────────────────────────────────────────────
  const [grader, setGrader] = useState<Grader>("PSA");
  const [gradeKey, setGradeKey] = useState<string>("10");
  const [certNumber, setCertNumber] = useState("");
  const [source, setSource] = useState<CopySource>("ebay");
  const [sourceRef, setSourceRef] = useState("");
  const [notes, setNotes] = useState("");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [dupCert, setDupCert] = useState<string | null>(null);

  const gradeOpts = useMemo(() => options(grader), [grader]);
  const chosen = gradeOpts.find((o) => o.key === gradeKey) ?? null;

  function pickGrader(g: Grader) {
    setGrader(g);
    const opts = options(g);
    // keep the same number when the new grader has it (PSA 9 → CGC 9)
    setGradeKey(opts.find((o) => o.key === gradeKey)?.key ?? opts.find((o) => o.gradeLabel === null)?.key ?? "");
  }

  // Duplicate cert check, as on New Cert.
  useEffect(() => {
    setDupCert(null);
    const n = certNumber.trim();
    if (!n) return;
    const t = setTimeout(() => {
      api.checkCertNumber(n).then((r) => {
        if (r.exists) setDupCert(`Cert ${n} is already recorded (copy #${r.cert_id}).`);
      }).catch(() => null);
    }, 400);
    return () => clearTimeout(t);
  }, [certNumber]);

  // Paste (Ctrl/Cmd+V) fills the first empty side, so screenshots from a
  // listing go straight in.
  const frontRef = useRef(front); frontRef.current = front;
  const backRef = useRef(back); backRef.current = back;
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      if (!frontRef.current) setFront(file);
      else if (!backRef.current) setBack(file);
      else setFront(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const isRaw = grader === "Raw";
  const canSave = !!(card || pendingCard) && (isRaw || !!chosen) && !!front && !!back && !dupCert && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      let target = card;
      if (!target && pendingCard) {
        target = await api.createCard({ game: "pokemon", ...pendingCard, market_display_key: displayKey ?? undefined });
        setCard(target);
        setPendingCard(null);
      }
      if (!target) return;
      const cert = await api.createCert({
        card_id: target.id,
        cert_number: certNumber.trim() || undefined,
        grader: isRaw ? "N/A" : grader,
        grade: isRaw ? null : chosen!.grade,
        grade_label: isRaw ? null : chosen!.gradeLabel,
        source,
        source_ref: sourceRef.trim() || null,
        notes: notes.trim() || undefined,
        purpose: "backtest",
      });
      try {
        await Promise.all([
          api.uploadCertImage(cert.id, "front", front!),
          api.uploadCertImage(cert.id, "back", back!),
        ]);
      } catch (e) {
        // The copy exists; say so, so it can be fixed from its page instead of re-entered.
        setError(`Copy #${cert.id} was saved but a photo upload failed (${String(e)}). Add the photo from the copy's page.`);
      }
      setSaved((s) => [{
        id: cert.id,
        text: isRaw ? "Raw" : gradeText(grader, chosen!.grade, chosen!.gradeLabel),
        front: URL.createObjectURL(front!),
        back: URL.createObjectURL(back!),
      }, ...s]);
      // Next copy: keep card, grader, grade and source; clear the rest.
      setFront(null);
      setBack(null);
      setCertNumber("");
      setSourceRef("");
      setNotes("");
      refreshSummary(target.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  // Ctrl/Cmd+Enter saves.
  const saveRef = useRef(save); saveRef.current = save;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void saveRef.current(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loadError) {
    return <div className="text-red-400 text-xs border border-red-400/30 bg-red-400/10 rounded p-3">{loadError}</div>;
  }

  if (!card && !pendingCard) {
    if (cardIdParam || displayKey) return <div className="text-muted text-xs">Loading card…</div>;
    const f = cardFilter.trim().toLowerCase();
    const shown = cards.filter((c) =>
      !f || `${c.card_name} ${c.set_name} ${c.card_number}`.toLowerCase().includes(f)).slice(0, 50);
    return (
      <div className="max-w-2xl">
        <h1 className="text-lg font-semibold mb-1">Copy intake</h1>
        <p className="text-muted text-xs mb-4">Pick the card you're collecting graded copies of.</p>
        <input autoFocus value={cardFilter} onChange={(e) => setCardFilter(e.target.value)}
          placeholder="Filter by name, set or number"
          className="w-full bg-bg border border-border rounded px-3 py-2 text-sm outline-none focus:border-accent mb-3" />
        <div className="border border-border rounded divide-y divide-border">
          {shown.map((c) => (
            <Link key={c.id} to={`/intake?card_id=${c.id}`}
              className="flex justify-between px-3 py-2 hover:bg-surface text-xs">
              <span>{c.card_name} <span className="text-muted">#{c.card_number}</span></span>
              <span className="text-muted">{c.set_name}</span>
            </Link>
          ))}
          {shown.length === 0 && <div className="px-3 py-2 text-muted text-xs">No cards match.</div>}
        </div>
      </div>
    );
  }

  const head = card ?? { card_name: pendingCard!.card_name, set_name: pendingCard!.set_name, card_number: pendingCard!.card_number, image_url: pendingCard!.image_url ?? null };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
      <div>
        <div className="flex items-start gap-4 mb-5">
          {head.image_url && <img src={head.image_url} alt="" className="w-16 rounded border border-border" />}
          <div>
            <h1 className="text-lg font-semibold">{head.card_name} <span className="text-muted">#{head.card_number}</span></h1>
            <div className="text-muted text-xs">{head.set_name}{displayKey && <> · <code>{displayKey}</code></>}</div>
            {pendingCard && <div className="text-yellow text-[11px] mt-1">New to the predictor: the card is created with the first copy.</div>}
            {card && <Link to={`/cards/${card.id}`} className="text-accent text-[11px] hover:underline">card page →</Link>}
          </div>
        </div>

        <Section title="Grade">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(["PSA", "CGC", "BGS", "TAG", "SGC", "Raw"] as Grader[]).map((g) => (
              <Chip key={g} active={grader === g} onClick={() => pickGrader(g)}>{g}</Chip>
            ))}
          </div>
          {!isRaw && (
            <div className="flex flex-wrap gap-1.5">
              {gradeOpts.map((o) => (
                <Chip key={o.key} active={gradeKey === o.key} onClick={() => setGradeKey(o.key)}
                  small={o.grade < 8}>{o.label}</Chip>
              ))}
            </div>
          )}
        </Section>

        <Section title="Photos" hint="drop, click, or paste (Ctrl+V fills the next empty side)">
          <div className="grid grid-cols-2 gap-3">
            <PhotoSlot label="Front" file={front} onChange={setFront} />
            <PhotoSlot label="Back" file={back} onChange={setBack} />
          </div>
        </Section>

        <Section title="Details" hint="optional">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cert number">
              <input value={certNumber} onChange={(e) => setCertNumber(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Source">
              <select value={source} onChange={(e) => setSource(e.target.value as CopySource)} className={inputCls}>
                {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Listing URL / reference">
              <input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Notes">
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
            </Field>
          </div>
          {dupCert && <div className="text-yellow text-[11px] mt-2">{dupCert}</div>}
        </Section>

        {error && <div className="text-red-400 text-xs border border-red-400/30 bg-red-400/10 rounded p-2 mb-3">{error}</div>}

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={!canSave}
            className="bg-accent text-bg font-semibold px-4 py-2 rounded text-sm hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? "Saving…" : "Save & next"}
          </button>
          <span className="text-muted text-[11px]">
            {!front || !back ? "Front and back photos are both required." : "Ctrl+Enter saves."}
          </span>
        </div>
      </div>

      <aside className="space-y-4">
        {summary && (
          <div className="border border-border rounded p-3 bg-surface">
            <div className="text-xs font-semibold mb-2">
              Collected: {summary.copies} <span className="text-muted font-normal">({summary.both_photos} with both photos)</span>
            </div>
            <table className="w-full text-[11px]">
              <tbody>
                {summary.by_grade.map((r) => (
                  <tr key={`${r.grader}-${r.grade}-${r.grade_label}`}>
                    <td className="py-0.5">{gradeText(r.grader, r.grade, r.grade_label)}</td>
                    <td className="text-right">{r.copies}</td>
                    <td className="text-right text-muted w-14">{r.both_photos} ✓</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {saved.length > 0 && (
          <div>
            <div className="text-xs text-muted mb-2">This session</div>
            <div className="space-y-2">
              {saved.map((s) => (
                <Link key={s.id} to={`/certs/${s.id}`} className="flex items-center gap-2 border border-border rounded p-1.5 hover:border-accent">
                  {s.front && <img src={s.front} alt="" className="h-12 rounded" />}
                  {s.back && <img src={s.back} alt="" className="h-12 rounded" />}
                  <span className="text-[11px]">{s.text} <span className="text-muted">#{s.id}</span></span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

const inputCls = "w-full bg-bg border border-border rounded px-2 py-1.5 text-xs outline-none focus:border-accent";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-semibold mb-2">{title}{hint && <span className="text-muted font-normal"> · {hint}</span>}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-muted text-[11px] block mb-1">{label}</span>{children}</label>;
}

function Chip({ active, onClick, small, children }: { active: boolean; onClick: () => void; small?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`border rounded px-2.5 ${small ? "py-0.5 text-[11px]" : "py-1 text-xs"} transition-colors ${
        active ? "border-accent bg-accent/10 text-accent" : "border-border hover:border-[#8b949e]"}`}>
      {children}
    </button>
  );
}

function PhotoSlot({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File | null) => void }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <div
      onClick={() => input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const f = e.dataTransfer.files[0];
        if (f?.type.startsWith("image/")) onChange(f);
      }}
      className={`relative aspect-[63/88] max-h-80 border-2 border-dashed rounded flex items-center justify-center cursor-pointer overflow-hidden ${
        over ? "border-accent bg-accent/5" : file ? "border-border" : "border-border hover:border-[#8b949e]"}`}
    >
      {url ? <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
           : <span className="text-muted text-xs">{label}</span>}
      {file && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onChange(null); }}
          className="absolute top-1 right-1 bg-bg/80 border border-border rounded px-1.5 text-[11px] hover:border-red-400">✕</button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
        onChange={(e) => { onChange(e.target.files?.[0] ?? null); e.target.value = ""; }} />
    </div>
  );
}
