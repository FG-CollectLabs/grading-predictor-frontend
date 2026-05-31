import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type {
  Card,
  CreateInspectionRequest,
  CertCategory,
  CertPurpose,
} from "../types";
import { CenteringTool } from "../components/CenteringTool";
import type { CenteringResult } from "../components/CenteringTool";

type Step = "card" | "cert" | "inspection";

export default function NewCert() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCardId = searchParams.get("card_id") ? Number(searchParams.get("card_id")) : null;

  const [step, setStep] = useState<Step>(preselectedCardId ? "cert" : "card");
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<number | null>(preselectedCardId);
  const [certId, setCertId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Card creation form
  const [newCard, setNewCard] = useState({
    game: "", set_code: "", set_name: "", card_name: "", card_number: "",
    image_url: "", market_display_key: "",
  });
  const [cardMode, setCardMode] = useState<"existing" | "new">("existing");

  // Cert form
  const [certNumber, setCertNumber] = useState("");
  const [grader, setGrader] = useState("PSA");
  const [certNotes, setCertNotes] = useState("");
  const [category, setCategory] = useState<CertCategory>("raw");
  const [purpose, setPurpose] = useState<CertPurpose>("analytics");
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [frontCentering, setFrontCentering] = useState<CenteringResult>({ lr: 50, tb: 50 });
  const [backCentering, setBackCentering] = useState<CenteringResult>({ lr: 50, tb: 50 });
  const [centeringSide, setCenteringSide] = useState<"front" | "back">("front");

  useEffect(() => {
    api.listCards().then((data) => setCards(data ?? [])).catch(() => null);
  }, []);

  // ── Step 1: Card ──────────────────────────────────────────────────────────

  async function handleCardStep() {
    setSaving(true);
    setError(null);
    try {
      if (cardMode === "new") {
        const card = await api.createCard({
          ...newCard,
          image_url: newCard.image_url || undefined,
          market_display_key: newCard.market_display_key || undefined,
        });
        setSelectedCardId(card.id);
      }
      setStep("cert");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Step 2: Cert + Images ─────────────────────────────────────────────────

  async function handleCertStep() {
    if (!selectedCardId) return;
    setSaving(true);
    setError(null);
    try {
      const cert = await api.createCert({
        card_id: selectedCardId,
        cert_number: certNumber.trim(),
        grader,
        notes: certNotes || undefined,
        category,
        purpose,
      });
      setCertId(cert.id);

      await Promise.all([
        frontFile ? api.uploadCertImage(cert.id, "front", frontFile) : Promise.resolve(),
        backFile ? api.uploadCertImage(cert.id, "back", backFile) : Promise.resolve(),
      ]);

      setStep("inspection");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Step 3: Inspection ────────────────────────────────────────────────────

  async function handleInspectionStep(insp: CreateInspectionRequest) {
    if (!certId) return;
    setSaving(true);
    setError(null);
    try {
      await api.createInspection(certId, insp);
      navigate(selectedCardId ? `/cards/${selectedCardId}` : "/");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function skipInspection() {
    navigate(selectedCardId ? `/cards/${selectedCardId}` : "/");
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-muted hover:text-accent text-xs transition-colors">
          ← Back
        </button>
        <h1 className="text-lg font-semibold">New Cert</h1>
      </div>

      <StepIndicator current={step} />

      {error && (
        <div className="bg-red-900/20 border border-red-500/30 text-red-400 rounded px-4 py-2 text-sm mb-4">
          {error}
        </div>
      )}

      {step === "card" && (
        <div className="bg-surface border border-border rounded-md p-5">
          <h2 className="font-semibold mb-4">1. Select or Create Card</h2>

          <div className="flex gap-2 mb-4">
            {(["existing", "new"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setCardMode(m)}
                className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                  cardMode === m
                    ? "border-accent text-accent bg-accent/10"
                    : "border-border text-muted hover:border-[#8b949e]"
                }`}
              >
                {m === "existing" ? "Existing card" : "New card"}
              </button>
            ))}
          </div>

          {cardMode === "existing" ? (
            <div>
              <select
                value={selectedCardId ?? ""}
                onChange={(e) => setSelectedCardId(Number(e.target.value))}
                className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-accent"
              >
                <option value="">Select a card…</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.game} · {c.set_name} · {c.card_name} #{c.card_number}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Game" value={newCard.game} onChange={(v) => setNewCard((p) => ({ ...p, game: v }))} placeholder="pokemon" />
              <Field label="Set Code" value={newCard.set_code} onChange={(v) => setNewCard((p) => ({ ...p, set_code: v }))} placeholder="sv4pt5" />
              <Field label="Set Name" value={newCard.set_name} onChange={(v) => setNewCard((p) => ({ ...p, set_name: v }))} placeholder="Paldean Fates" className="col-span-2" />
              <Field label="Card Name" value={newCard.card_name} onChange={(v) => setNewCard((p) => ({ ...p, card_name: v }))} placeholder="Charizard ex" />
              <Field label="Card Number" value={newCard.card_number} onChange={(v) => setNewCard((p) => ({ ...p, card_number: v }))} placeholder="54" />
              <Field label="Image URL (optional)" value={newCard.image_url} onChange={(v) => setNewCard((p) => ({ ...p, image_url: v }))} placeholder="https://…" className="col-span-2" />
              <Field label="Market Display Key (optional)" value={newCard.market_display_key} onChange={(v) => setNewCard((p) => ({ ...p, market_display_key: v }))} placeholder="pokemon_sv4pt5_054" className="col-span-2" />
            </div>
          )}

          <button
            onClick={handleCardStep}
            disabled={saving || (cardMode === "existing" && !selectedCardId)}
            className="mt-5 bg-accent text-bg font-semibold px-4 py-2 rounded text-sm hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving…" : "Continue →"}
          </button>
        </div>
      )}

      {step === "cert" && (
        <div className="bg-surface border border-border rounded-md p-5">
          <h2 className="font-semibold mb-4">2. Cert Details &amp; Images</h2>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Cert Number" value={certNumber} onChange={setCertNumber} placeholder="12345678" className="col-span-2" />
            <div>
              <label className="text-muted text-xs block mb-1">Grader</label>
              <select
                value={grader}
                onChange={(e) => setGrader(e.target.value)}
                className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-accent"
              >
                <option>PSA</option>
                <option>CGC</option>
                <option>BGS</option>
              </select>
            </div>
            <Field label="Notes (optional)" value={certNotes} onChange={setCertNotes} placeholder="raw from binder" />
            <div>
              <label className="text-muted text-xs block mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CertCategory)}
                className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-accent"
              >
                <option value="raw">Raw</option>
                <option value="psa9">PSA 9</option>
                <option value="psa10">PSA 10</option>
                <option value="cgc9">CGC 9</option>
                <option value="cgc10">CGC 10</option>
              </select>
            </div>
            <div>
              <label className="text-muted text-xs block mb-1">Purpose</label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as CertPurpose)}
                className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-accent"
              >
                <option value="analytics">Analytics</option>
                <option value="buy_and_grade">Buy &amp; Grade</option>
                <option value="crack_and_regrade">Crack &amp; Regrade</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <ImageDropZone label="Front scan" onChange={(f) => {
              setFrontFile(f);
              setFrontPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null; });
              if (f) setCenteringSide("front");
            }} />
            <ImageDropZone label="Back scan" onChange={(f) => {
              setBackFile(f);
              setBackPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null; });
              if (f && !frontFile) setCenteringSide("back");
            }} />
          </div>

          {(frontPreview || backPreview) && (
            <div className="mb-5 border-t border-border pt-4 space-y-3">
              {frontPreview && backPreview && (
                <div className="flex gap-2">
                  {(["front", "back"] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => setCenteringSide(side)}
                      className={`px-3 py-1 text-xs rounded border transition-colors ${
                        centeringSide === side
                          ? "border-accent text-accent bg-accent/10"
                          : "border-border text-muted hover:border-[#8b949e]"
                      }`}
                    >
                      {side === "front" ? "Front" : "Back"}
                    </button>
                  ))}
                </div>
              )}
              <div className="max-w-xs mx-auto">
                {centeringSide === "front" && frontPreview && (
                  <CenteringTool
                    key={`front-${frontFile?.name}`}
                    imageUrl={frontPreview}
                    onChange={setFrontCentering}
                  />
                )}
                {centeringSide === "back" && backPreview && (
                  <CenteringTool
                    key={`back-${backFile?.name}`}
                    imageUrl={backPreview}
                    onChange={setBackCentering}
                  />
                )}
              </div>
            </div>
          )}

          <button
            onClick={handleCertStep}
            disabled={saving || !certNumber.trim()}
            className="bg-accent text-bg font-semibold px-4 py-2 rounded text-sm hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving…" : "Continue →"}
          </button>
        </div>
      )}

      {step === "inspection" && certId && (
        <InspectionForm
          onSave={handleInspectionStep}
          onSkip={skipInspection}
          saving={saving}
          frontCentering={frontPreview ? frontCentering : undefined}
          backCentering={backPreview ? backCentering : undefined}
        />
      )}
    </div>
  );
}

// ── Inspection Form ───────────────────────────────────────────────────────────

function InspectionForm({
  onSave,
  onSkip,
  saving,
  frontCentering,
  backCentering,
}: {
  onSave: (insp: CreateInspectionRequest) => void;
  onSkip: () => void;
  saving: boolean;
  frontCentering?: CenteringResult;
  backCentering?: CenteringResult;
}) {
  const [form, setForm] = useState<CreateInspectionRequest>({
    source: "manual",
    centering_front_lr: frontCentering?.lr ?? 50,
    centering_front_tb: frontCentering?.tb ?? 50,
    centering_back_lr: backCentering?.lr ?? 50,
    centering_back_tb: backCentering?.tb ?? 50,
    corners_defective_cut: 0,
    corners_major_whitening: 0,
    corners_minor_whitening: 0,
    corners_micro_whitening: 0,
    edges_whitening: 0,
    surface_dead_pixels: 0,
    surface_dimples: 0,
    surface_print_lines: 0,
  });

  function setNum(key: keyof CreateInspectionRequest, value: number) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  return (
    <div className="bg-surface border border-border rounded-md p-5 space-y-6">
      <h2 className="font-semibold">3. Defect Inspection</h2>

      {/* Centering */}
      <section>
        <SectionHeader>Centering</SectionHeader>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div className="space-y-3">
            <div className="text-xs text-muted mb-2 uppercase tracking-widest">Front</div>
            <CenteringSlider
              label="L / R"
              value={form.centering_front_lr ?? 50}
              onChange={(v) => setNum("centering_front_lr", v)}
            />
            <CenteringSlider
              label="T / B"
              value={form.centering_front_tb ?? 50}
              onChange={(v) => setNum("centering_front_tb", v)}
            />
          </div>
          <div className="space-y-3">
            <div className="text-xs text-muted mb-2 uppercase tracking-widest">Back</div>
            <CenteringSlider
              label="L / R"
              value={form.centering_back_lr ?? 50}
              onChange={(v) => setNum("centering_back_lr", v)}
            />
            <CenteringSlider
              label="T / B"
              value={form.centering_back_tb ?? 50}
              onChange={(v) => setNum("centering_back_tb", v)}
            />
          </div>
        </div>
      </section>

      {/* Corners */}
      <section>
        <SectionHeader>Corners</SectionHeader>
        <div className="space-y-3">
          <CountSlider
            label="Defective cuts"
            description="imperfect corner geometry"
            value={form.corners_defective_cut ?? 0}
            max={4}
            onChange={(v) => setNum("corners_defective_cut", v)}
          />
          <CountSlider
            label="Major whitening"
            description="immediately noticeable, stands out"
            value={form.corners_major_whitening ?? 0}
            max={4}
            onChange={(v) => setNum("corners_major_whitening", v)}
          />
          <CountSlider
            label="Minor whitening"
            description="noticeable on close inspection"
            value={form.corners_minor_whitening ?? 0}
            max={4}
            onChange={(v) => setNum("corners_minor_whitening", v)}
          />
          <CountSlider
            label="Micro whitening"
            description="requires loupe, not obvious at a glance"
            value={form.corners_micro_whitening ?? 0}
            max={4}
            onChange={(v) => setNum("corners_micro_whitening", v)}
          />
        </div>
      </section>

      {/* Edges */}
      <section>
        <SectionHeader>Edges</SectionHeader>
        <div className="space-y-3">
          <CountSlider
            label="Whitening"
            value={form.edges_whitening ?? 0}
            max={10}
            onChange={(v) => setNum("edges_whitening", v)}
          />
        </div>
      </section>

      {/* Surface */}
      <section>
        <SectionHeader>Surface</SectionHeader>
        <div className="space-y-3">
          <CountSlider
            label="Dead pixels"
            value={form.surface_dead_pixels ?? 0}
            max={20}
            onChange={(v) => setNum("surface_dead_pixels", v)}
          />
          <CountSlider
            label="Dimples"
            value={form.surface_dimples ?? 0}
            max={10}
            onChange={(v) => setNum("surface_dimples", v)}
          />
          <CountSlider
            label="Print lines"
            value={form.surface_print_lines ?? 0}
            max={10}
            onChange={(v) => setNum("surface_print_lines", v)}
          />
        </div>
      </section>

      {/* Notes */}
      <div>
        <label className="text-muted text-xs block mb-1">Notes</label>
        <textarea
          rows={2}
          value={form.notes ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value || undefined }))}
          placeholder="any additional observations…"
          className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-[#e6edf3] placeholder-muted outline-none focus:border-accent resize-none"
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => onSave(form)}
          disabled={saving}
          className="bg-accent text-bg font-semibold px-4 py-2 rounded text-sm hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving…" : "Save Inspection"}
        </button>
        <button
          onClick={onSkip}
          disabled={saving}
          className="border border-border text-muted px-4 py-2 rounded text-sm hover:text-[#e6edf3] hover:border-[#8b949e] transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ── Shared form components ────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted text-xs uppercase tracking-widest mb-3">{children}</div>
  );
}

function CenteringSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const a = value;
  const b = 100 - value;
  const offCenter = Math.abs(50 - value);
  const color = offCenter >= 10 ? "text-yellow-400" : "text-[#e6edf3]";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted">{label}</span>
        <span className={`font-mono font-semibold ${color}`}>{a} / {b}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#58a6ff]"
      />
    </div>
  );
}

function CountSlider({
  label,
  description,
  value,
  max,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[#e6edf3]">{label}</span>
          {description && <span className="text-muted text-[11px]">{description}</span>}
        </div>
        <span className={`font-mono font-semibold tabular-nums ${value > 0 ? "text-accent" : "text-muted"}`}>
          {value}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#58a6ff]"
      />
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-muted text-xs block mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-[#e6edf3] placeholder-muted outline-none focus:border-accent"
      />
    </div>
  );
}

function ImageDropZone({ label, onChange }: { label: string; onChange: (f: File | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null) {
    onChange(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
    } else {
      setPreview(null);
    }
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current++;
    setDragging(true);
  }

  function onDragLeave() {
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragging(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    const f = e.dataTransfer.files[0] ?? null;
    if (f?.type.startsWith("image/")) handleFile(f);
  }

  return (
    <div>
      <label className="text-muted text-xs block mb-1">{label}</label>
      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer bg-bg border border-dashed rounded flex flex-col items-center justify-center min-h-[130px] p-2 transition-colors ${
          dragging ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        {preview ? (
          <img src={preview} alt={label} className="max-h-[120px] object-contain rounded pointer-events-none" />
        ) : (
          <span className="text-muted text-xs text-center pointer-events-none">Drop image here<br />or click to browse</span>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "card", label: "Card" },
    { key: "cert", label: "Cert" },
    { key: "inspection", label: "Inspection" },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-2 mb-6 text-xs">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              i < currentIdx
                ? "bg-green text-bg"
                : i === currentIdx
                ? "bg-accent text-bg"
                : "bg-border text-muted"
            }`}
          >
            {i < currentIdx ? "✓" : i + 1}
          </span>
          <span className={i === currentIdx ? "text-[#e6edf3]" : "text-muted"}>{s.label}</span>
          {i < steps.length - 1 && <span className="text-border">→</span>}
        </div>
      ))}
    </div>
  );
}
