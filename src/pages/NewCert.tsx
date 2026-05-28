import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type {
  Card,
  CreateInspectionRequest,
  SurfaceGrade,
  CornerGrade,
  EdgeGrade,
  CertCategory,
  CertPurpose,
} from "../types";

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
  const [backFile, setBackFile] = useState<File | null>(null);

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

      // Upload images in parallel
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

          <div className="grid grid-cols-2 gap-3 mb-5">
            <ImageUpload label="Front scan" onChange={setFrontFile} />
            <ImageUpload label="Back scan" onChange={setBackFile} />
          </div>

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
        <InspectionForm onSave={handleInspectionStep} onSkip={skipInspection} saving={saving} />
      )}
    </div>
  );
}

// ── Inspection Form ───────────────────────────────────────────────────────────

function InspectionForm({
  onSave,
  onSkip,
  saving,
}: {
  onSave: (insp: CreateInspectionRequest) => void;
  onSkip: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<CreateInspectionRequest>({
    source: "manual",
  });

  function setField<K extends keyof CreateInspectionRequest>(key: K, value: CreateInspectionRequest[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function numField(key: keyof CreateInspectionRequest, label: string) {
    const val = form[key] as number | null | undefined;
    return (
      <div>
        <label className="text-muted text-xs block mb-1">{label}</label>
        <input
          type="number"
          min={0}
          max={100}
          value={val ?? ""}
          onChange={(e) => setField(key, e.target.value ? Number(e.target.value) as never : null as never)}
          placeholder="50"
          className="w-full bg-bg border border-border rounded px-3 py-1.5 text-sm text-[#e6edf3] outline-none focus:border-accent"
        />
      </div>
    );
  }

  const surfaceOpts: SurfaceGrade[] = ["clean", "light_scratch", "heavy_scratch", "print_line", "print_dot"];
  const cornerOpts: CornerGrade[] = ["sharp", "light_wear", "heavy_wear"];
  const edgeOpts: EdgeGrade[] = ["clean", "light_wear", "heavy_wear", "nick"];

  return (
    <div className="bg-surface border border-border rounded-md p-5">
      <h2 className="font-semibold mb-4">3. Defect Inspection</h2>

      <section className="mb-5">
        <div className="text-muted text-xs uppercase tracking-widest mb-3">Centering — Front (% of left / top border)</div>
        <div className="grid grid-cols-2 gap-3">
          {numField("centering_front_lr", "Left %")}
          {numField("centering_front_tb", "Top %")}
        </div>
      </section>

      <section className="mb-5">
        <div className="text-muted text-xs uppercase tracking-widest mb-3">Centering — Back</div>
        <div className="grid grid-cols-2 gap-3">
          {numField("centering_back_lr", "Left %")}
          {numField("centering_back_tb", "Top %")}
        </div>
      </section>

      <section className="mb-5">
        <div className="text-muted text-xs uppercase tracking-widest mb-3">Surface</div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Front" opts={surfaceOpts} value={form.surface_front ?? null} onChange={(v) => setField("surface_front", v as SurfaceGrade)} />
          <SelectField label="Back"  opts={surfaceOpts} value={form.surface_back ?? null}  onChange={(v) => setField("surface_back",  v as SurfaceGrade)} />
        </div>
      </section>

      <section className="mb-5">
        <div className="text-muted text-xs uppercase tracking-widest mb-3">Corners</div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Top-Left"     opts={cornerOpts} value={form.corner_tl ?? null} onChange={(v) => setField("corner_tl", v as CornerGrade)} />
          <SelectField label="Top-Right"    opts={cornerOpts} value={form.corner_tr ?? null} onChange={(v) => setField("corner_tr", v as CornerGrade)} />
          <SelectField label="Bottom-Left"  opts={cornerOpts} value={form.corner_bl ?? null} onChange={(v) => setField("corner_bl", v as CornerGrade)} />
          <SelectField label="Bottom-Right" opts={cornerOpts} value={form.corner_br ?? null} onChange={(v) => setField("corner_br", v as CornerGrade)} />
        </div>
      </section>

      <section className="mb-5">
        <div className="text-muted text-xs uppercase tracking-widest mb-3">Edges</div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Top"    opts={edgeOpts} value={form.edge_top    ?? null} onChange={(v) => setField("edge_top",    v as EdgeGrade)} />
          <SelectField label="Bottom" opts={edgeOpts} value={form.edge_bottom ?? null} onChange={(v) => setField("edge_bottom", v as EdgeGrade)} />
          <SelectField label="Left"   opts={edgeOpts} value={form.edge_left   ?? null} onChange={(v) => setField("edge_left",   v as EdgeGrade)} />
          <SelectField label="Right"  opts={edgeOpts} value={form.edge_right  ?? null} onChange={(v) => setField("edge_right",  v as EdgeGrade)} />
        </div>
      </section>

      <div className="mb-5">
        <label className="text-muted text-xs block mb-1">Notes</label>
        <textarea
          rows={2}
          value={form.notes ?? ""}
          onChange={(e) => setField("notes", e.target.value || undefined)}
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

function SelectField({
  label, opts, value, onChange,
}: {
  label: string;
  opts: string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-muted text-xs block mb-1">{label}</label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-accent"
      >
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
        ))}
      </select>
    </div>
  );
}

function ImageUpload({ label, onChange }: { label: string; onChange: (f: File | null) => void }) {
  const [name, setName] = useState<string | null>(null);
  return (
    <div>
      <label className="text-muted text-xs block mb-1">{label}</label>
      <label className="flex items-center gap-2 cursor-pointer bg-bg border border-border border-dashed rounded px-3 py-3 hover:border-accent transition-colors">
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onChange(f);
            setName(f?.name ?? null);
          }}
        />
        <span className="text-muted text-xs">{name ?? "Choose image…"}</span>
      </label>
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
