import { useEffect, useRef, useState, useCallback } from "react";
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
import { POKEMON_SETS } from "../data/sets";

const DEFAULT_CENTERING: CenteringResult = { lr: 50, tb: 50, rotationDeg: 0 };

const GRADER_CATEGORIES: Record<string, Array<{ value: CertCategory; label: string }>> = {
  PSA: [
    { value: "raw",   label: "Raw / Pre-grade" },
    { value: "psa9",  label: "PSA 9"            },
    { value: "psa10", label: "PSA 10"           },
  ],
  CGC: [
    { value: "raw",   label: "Raw / Pre-grade" },
    { value: "cgc9",  label: "CGC 9"            },
    { value: "cgc10", label: "CGC 10"           },
  ],
  BGS: [
    { value: "raw",     label: "Raw / Pre-grade" },
    { value: "bgs9",    label: "BGS 9"            },
    { value: "bgs9pt5", label: "BGS 9.5"          },
    { value: "bgs10",   label: "BGS 10"           },
  ],
  "N/A": [
    { value: "raw", label: "Raw" },
  ],
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 12);
}

type Step = "card" | "cert" | "centering" | "inspection";

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
  const [cardMode, setCardMode] = useState<"existing" | "new">("existing");
  const [cardGame, setCardGame] = useState("pokemon");
  const [cardSetName, setCardSetName] = useState("");
  const [cardSetCode, setCardSetCode] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardImageFile, setCardImageFile] = useState<File | null>(null);
  const [cardImagePreview, setCardImagePreview] = useState<string | null>(null);

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
  const [frontCentering, setFrontCentering] = useState<CenteringResult>(DEFAULT_CENTERING);
  const [backCentering, setBackCentering] = useState<CenteringResult>(DEFAULT_CENTERING);

  const [certDuplicate, setCertDuplicate] = useState<{ cert_id: number; card_id: number; grader: string; category: string } | null>(null);
  const [certCheckPending, setCertCheckPending] = useState(false);

  useEffect(() => {
    api.listCards().then((data) => setCards(data ?? [])).catch(() => null);
  }, []);

  const checkDuplicate = useCallback((num: string) => {
    const trimmed = num.trim();
    if (!trimmed) { setCertDuplicate(null); return; }
    setCertCheckPending(true);
    api.checkCertNumber(trimmed)
      .then((r) => {
        if (r.exists && r.cert_id && r.card_id) {
          setCertDuplicate({ cert_id: r.cert_id, card_id: r.card_id, grader: r.grader ?? "", category: r.category ?? "" });
        } else {
          setCertDuplicate(null);
        }
      })
      .catch(() => setCertDuplicate(null))
      .finally(() => setCertCheckPending(false));
  }, []);

  useEffect(() => {
    setCertDuplicate(null);
    if (!certNumber.trim()) return;
    const t = setTimeout(() => checkDuplicate(certNumber), 500);
    return () => clearTimeout(t);
  }, [certNumber, checkDuplicate]);

  // ── Step 1: Card ──────────────────────────────────────────────────────────

  async function handleCardStep() {
    setSaving(true);
    setError(null);
    try {
      if (cardMode === "new") {
        const card = await api.createCard({
          game: cardGame,
          set_code: cardSetCode || slugify(cardSetName),
          set_name: cardSetName,
          card_name: cardName,
          card_number: cardNumber,
        });
        setSelectedCardId(card.id);
        if (cardImageFile) {
          await api.uploadCardImage(card.id, cardImageFile).catch(() => null);
        }
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

      setStep(frontFile || backFile ? "centering" : "inspection");
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
          ) : (
            <div className="space-y-3">
              {/* Game */}
              <div>
                <label className="text-muted text-xs block mb-1">Game</label>
                <select
                  value={cardGame}
                  onChange={(e) => { setCardGame(e.target.value); setCardSetName(""); setCardSetCode(""); }}
                  className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-accent"
                >
                  <option value="pokemon">Pokémon</option>
                  <option value="magic">Magic: The Gathering</option>
                  <option value="weiss">Weiss Schwarz</option>
                </select>
              </div>

              {/* Set */}
              <div>
                <label className="text-muted text-xs block mb-1">Set</label>
                {cardGame === "pokemon" ? (
                  <select
                    value={cardSetCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      const found = POKEMON_SETS.flatMap((g) => g.sets).find((s) => s.code === code);
                      setCardSetCode(code);
                      setCardSetName(found?.name ?? "");
                    }}
                    className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-accent"
                  >
                    <option value="">Select a set…</option>
                    {POKEMON_SETS.map((era) => (
                      <optgroup key={era.era} label={era.era}>
                        {era.sets.map((s) => (
                          <option key={s.code} value={s.code}>{s.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={cardSetName}
                    onChange={(e) => setCardSetName(e.target.value)}
                    placeholder={cardGame === "magic" ? "e.g. Bloomburrow" : "e.g. Hololive Production Vol.2"}
                    className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-[#e6edf3] placeholder-muted outline-none focus:border-accent"
                  />
                )}
              </div>

              {/* Card name + number */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Card Name" value={cardName} onChange={setCardName} placeholder="Charizard ex" />
                <Field label="Card Number" value={cardNumber} onChange={setCardNumber} placeholder="54" />
              </div>

              {/* Card image */}
              <ImageDropZone
                label="Card image (optional)"
                onChange={(f) => {
                  setCardImageFile(f);
                  setCardImagePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null; });
                }}
              />
              {cardImagePreview && (
                <img src={cardImagePreview} alt="card preview" className="h-24 object-contain rounded border border-border" />
              )}
            </div>
          )}

          <button
            onClick={handleCardStep}
            disabled={saving || (cardMode === "existing" && !selectedCardId) || (cardMode === "new" && (!cardSetName || !cardName || !cardNumber))}
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

            {certCheckPending && (
              <div className="col-span-2 text-xs text-muted">Checking cert number…</div>
            )}

            {certDuplicate && (
              <div className="col-span-2 bg-red-900/70 border border-red-500 rounded-md p-4">
                <div className="text-red-300 font-bold text-sm mb-1">⚠ Duplicate cert number</div>
                <div className="text-red-200 text-xs mb-2">
                  Cert <span className="font-mono font-semibold">{certNumber.trim()}</span> already exists in the database.
                </div>
                <div className="text-red-200 text-xs space-y-0.5">
                  <div>Grader: <span className="font-semibold">{certDuplicate.grader}</span></div>
                  <div>Category: <span className="font-semibold">{certDuplicate.category}</span></div>
                </div>
                <a
                  href={`/certs/${certDuplicate.cert_id}`}
                  className="mt-3 inline-block text-xs text-red-200 underline hover:text-white"
                >
                  View existing cert →
                </a>
              </div>
            )}

            <div>
              <label className="text-muted text-xs block mb-1">Grader</label>
              <select
                value={grader}
                onChange={(e) => {
                  const g = e.target.value;
                  setGrader(g);
                  setCategory(GRADER_CATEGORIES[g]?.[0]?.value ?? "raw");
                }}
                className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-accent"
              >
                <option>PSA</option>
                <option>CGC</option>
                <option>BGS</option>
                <option>N/A</option>
              </select>
            </div>
            <div>
              <label className="text-muted text-xs block mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CertCategory)}
                className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-accent"
              >
                {(GRADER_CATEGORIES[grader] ?? GRADER_CATEGORIES["N/A"]).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <Field label="Notes (optional)" value={certNotes} onChange={setCertNotes} placeholder="raw from binder" className="col-span-2" />
            <div className="col-span-2">
              <label className="text-muted text-xs block mb-2">Purpose</label>
              <div className="grid grid-cols-2 gap-2">
                {(["analytics", "grading_tracker"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPurpose(p)}
                    className={`text-left border rounded p-3 transition-colors ${
                      purpose === p
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-[#8b949e]"
                    }`}
                  >
                    <div className={`text-xs font-semibold mb-0.5 ${purpose === p ? "text-accent" : "text-[#e6edf3]"}`}>
                      {p === "analytics" ? "Analytics" : "My Grading Tracker"}
                    </div>
                    <div className="text-[10px] text-muted">
                      {p === "analytics"
                        ? "Certs I don't own — building the dataset"
                        : "Cards I own, submitting, or tracking"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <ImageDropZone label="Front scan" onChange={(f) => {
              setFrontFile(f);
              setFrontPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null; });
            }} />
            <ImageDropZone label="Back scan" onChange={(f) => {
              setBackFile(f);
              setBackPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : null; });
            }} />
          </div>

          {(frontPreview || backPreview) && (
            <div className="mb-4 text-[11px] text-muted border border-border/50 rounded px-3 py-2 bg-surface">
              Centering lines will be set on the next screen after saving.
            </div>
          )}

          <button
            onClick={handleCertStep}
            disabled={saving || !certNumber.trim() || !!certDuplicate}
            className="bg-accent text-bg font-semibold px-4 py-2 rounded text-sm hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving…" : "Continue →"}
          </button>
        </div>
      )}

      {step === "centering" && (
        <CenteringTool
          frontImage={frontPreview ?? undefined}
          backImage={backPreview ?? undefined}
          onDone={(front, back) => {
            setFrontCentering(front);
            setBackCentering(back);
            setStep("inspection");
          }}
          onSkip={() => setStep("inspection")}
        />
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

interface InspForm {
  centering_front_lr: number;
  centering_front_tb: number;
  centering_front_rotation: number;
  centering_back_lr: number;
  centering_back_tb: number;
  centering_back_rotation: number;
  corners_defective_cut: number;
  corners_major_whitening: number;
  corners_minor_whitening: number;
  corners_micro_whitening: number;
  edges_whitening: number;
  surface_dead_pixels: number;
  surface_dimples: number;
  surface_print_lines: number;
  notes: string;
}

const COUNT_DEFECTS = [
  { key: "corners_defective_cut",   label: "Defective Cut",   group: "Corners", max: 4 },
  { key: "corners_major_whitening", label: "Major Whitening", group: "Corners", max: 4 },
  { key: "corners_minor_whitening", label: "Minor Whitening", group: "Corners", max: 4 },
  { key: "corners_micro_whitening", label: "Micro Whitening", group: "Corners", max: 4 },
  { key: "edges_whitening",         label: "Whitening",       group: "Edges",   max: 4 },
  { key: "surface_dead_pixels",     label: "Dead Pixels",     group: "Surface", max: 5 },
  { key: "surface_dimples",         label: "Dimples",         group: "Surface", max: 5 },
  { key: "surface_print_lines",     label: "Print Lines",     group: "Surface", max: 5 },
] as const;

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
  const [form, setForm] = useState<InspForm>({
    centering_front_lr: frontCentering?.lr ?? DEFAULT_CENTERING.lr,
    centering_front_tb: frontCentering?.tb ?? DEFAULT_CENTERING.tb,
    centering_front_rotation: frontCentering?.rotationDeg ?? 0,
    centering_back_lr: backCentering?.lr ?? DEFAULT_CENTERING.lr,
    centering_back_tb: backCentering?.tb ?? DEFAULT_CENTERING.tb,
    centering_back_rotation: backCentering?.rotationDeg ?? 0,
    corners_defective_cut: 0,
    corners_major_whitening: 0,
    corners_minor_whitening: 0,
    corners_micro_whitening: 0,
    edges_whitening: 0,
    surface_dead_pixels: 0,
    surface_dimples: 0,
    surface_print_lines: 0,
    notes: "",
  });

  function patch(p: Partial<InspForm>) { setForm((prev) => ({ ...prev, ...p })); }

  function toRequest(): CreateInspectionRequest {
    return {
      source: "manual",
      centering_front_lr: form.centering_front_lr,
      centering_front_tb: form.centering_front_tb,
      centering_front_rotation: form.centering_front_rotation || null,
      centering_back_lr: form.centering_back_lr,
      centering_back_tb: form.centering_back_tb,
      centering_back_rotation: form.centering_back_rotation || null,
      corners_defective_cut: form.corners_defective_cut || null,
      corners_major_whitening: form.corners_major_whitening || null,
      corners_minor_whitening: form.corners_minor_whitening || null,
      corners_micro_whitening: form.corners_micro_whitening || null,
      edges_whitening: form.edges_whitening || null,
      surface_dead_pixels: form.surface_dead_pixels || null,
      surface_dimples: form.surface_dimples || null,
      surface_print_lines: form.surface_print_lines || null,
      notes: form.notes || undefined,
    };
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
            <CenteringSlider label="L / R" value={form.centering_front_lr}
              onChange={(v) => patch({ centering_front_lr: v })} />
            <CenteringSlider label="T / B" value={form.centering_front_tb}
              onChange={(v) => patch({ centering_front_tb: v })} />
            <RotationField value={form.centering_front_rotation}
              onChange={(v) => patch({ centering_front_rotation: v })} />
          </div>
          <div className="space-y-3">
            <div className="text-xs text-muted mb-2 uppercase tracking-widest">Back</div>
            <CenteringSlider label="L / R" value={form.centering_back_lr}
              onChange={(v) => patch({ centering_back_lr: v })} />
            <CenteringSlider label="T / B" value={form.centering_back_tb}
              onChange={(v) => patch({ centering_back_tb: v })} />
            <RotationField value={form.centering_back_rotation}
              onChange={(v) => patch({ centering_back_rotation: v })} />
          </div>
        </div>
      </section>

      {/* Defect counts */}
      <section>
        <SectionHeader>Defects</SectionHeader>
        <CountSliderTable form={form} onChange={patch} />
      </section>

      {/* Notes */}
      <div>
        <label className="text-muted text-xs block mb-1">Notes</label>
        <textarea rows={2} value={form.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder="any additional observations…"
          className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-[#e6edf3] placeholder-muted outline-none focus:border-accent resize-none" />
      </div>

      <div className="flex gap-3">
        <button onClick={() => onSave(toRequest())} disabled={saving}
          className="bg-accent text-bg font-semibold px-4 py-2 rounded text-sm hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {saving ? "Saving…" : "Save Inspection"}
        </button>
        <button onClick={onSkip} disabled={saving}
          className="border border-border text-muted px-4 py-2 rounded text-sm hover:text-[#e6edf3] hover:border-[#8b949e] transition-colors">
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ── Count slider table ────────────────────────────────────────────────────────

function CountSliderTable({
  form,
  onChange,
}: {
  form: InspForm;
  onChange: (p: Partial<InspForm>) => void;
}) {
  const groups = ["Corners", "Edges", "Surface"] as const;

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group}>
          <div className="text-[10px] text-muted uppercase tracking-widest mb-2">{group}</div>
          <div className="space-y-2">
            {COUNT_DEFECTS.filter((d) => d.group === group).map(({ key, label, max }) => {
              const val = (form[key as keyof InspForm] as number) ?? 0;
              const highlight = val > 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs text-muted w-32 flex-shrink-0">{label}</span>
                  <span className={`text-xs font-mono w-8 text-right flex-shrink-0 ${highlight ? "text-yellow-400" : "text-muted"}`}>
                    {val}/{max}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={max}
                    value={val}
                    onChange={(e) => onChange({ [key]: Number(e.target.value) } as Partial<InspForm>)}
                    className="flex-1 accent-[#58a6ff]"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Shared form components ────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="text-muted text-xs uppercase tracking-widest mb-3">{children}</div>;
}

function CenteringSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const a = value; const b = 100 - value;
  const offCenter = Math.abs(50 - value);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted">{label}</span>
        <span className={`font-mono font-semibold ${offCenter >= 10 ? "text-yellow-400" : "text-[#e6edf3]"}`}>{a} / {b}</span>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#58a6ff]" />
    </div>
  );
}

function RotationField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const off = Math.abs(value) >= 1;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted text-xs flex-1">Rotation</span>
      <input type="number" step={0.1} min={-45} max={45}
        value={value === 0 ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        placeholder="0°"
        className={`w-16 text-right bg-bg border rounded px-2 py-0.5 text-xs font-mono outline-none focus:border-accent ${
          off ? "text-yellow-400 border-yellow-400/40" : "text-muted border-border"
        }`} />
      <span className="text-muted text-xs">°</span>
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
    { key: "card",       label: "Card"       },
    { key: "cert",       label: "Cert"       },
    { key: "centering",  label: "Centering"  },
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
