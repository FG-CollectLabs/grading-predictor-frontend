import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type {
  CertFullDetail,
  InspectionRow,
  CreateInspectionRequest,
  CertCategory,
  CertPurpose,
} from "../types";

const GCS_BASE = import.meta.env.VITE_GCS_PUBLIC_BASE ?? "";

function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return GCS_BASE ? `${GCS_BASE}/${path}` : path;
}

const CATEGORY_LABELS: Record<CertCategory, string> = {
  raw: "Raw", psa9: "PSA 9", psa10: "PSA 10", cgc9: "CGC 9", cgc10: "CGC 10",
};

const PURPOSE_LABELS: Record<CertPurpose, { label: string; color: string }> = {
  analytics:         { label: "Analytics",     color: "text-muted" },
  buy_and_grade:     { label: "Buy + Grade",   color: "text-accent" },
  crack_and_regrade: { label: "Crack + Regrade", color: "text-orange-400" },
};

export default function CertView() {
  const { id } = useParams<{ id: string }>();
  const certId = Number(id);
  const navigate = useNavigate();

  const [cert, setCert] = useState<CertFullDetail | null>(null);
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([api.getCert(certId), api.listInspections(certId)])
      .then(([c, insps]) => {
        setCert(c);
        setInspections(insps ?? []);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [certId]);

  async function handleSave(insp: CreateInspectionRequest) {
    setSaving(true);
    setError(null);
    try {
      const created = await api.createInspection(certId, insp);
      setInspections((prev) => [created, ...prev]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-muted py-12 text-center">Loading…</div>;
  if (error && !cert) return <div className="text-red-400 py-12 text-center">{error}</div>;
  if (!cert) return null;

  const latest = inspections[0] ?? null;
  const purposeInfo = PURPOSE_LABELS[cert.purpose] ?? { label: cert.purpose, color: "text-muted" };
  const frontUrl = imageUrl(cert.front_image);
  const backUrl = imageUrl(cert.back_image);

  return (
    <div className="max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-xs text-muted">
        <button onClick={() => navigate(-1)} className="hover:text-accent transition-colors">← Back</button>
        <span className="text-border">/</span>
        <Link to={`/cards/${cert.card_id}`} className="hover:text-accent transition-colors">Card #{cert.card_id}</Link>
        <span className="text-border">/</span>
        <span className="text-[#e6edf3] font-mono">{cert.cert_number}</span>
      </div>

      {/* Cert header */}
      <div className="bg-surface border border-border rounded-md p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-lg font-semibold font-mono">{cert.cert_number}</span>
              <span className="text-muted text-sm">· {cert.grader}</span>
              <CategoryBadge category={cert.category} />
            </div>
            <div className={`text-xs mb-2 ${purposeInfo.color}`}>{purposeInfo.label}</div>
            {cert.grade_received !== null && (
              <div className="text-green font-semibold text-sm">
                Grade received: {cert.grader} {cert.grade_received}
              </div>
            )}
            {cert.notes && (
              <div className="text-muted text-xs mt-1 italic">"{cert.notes}"</div>
            )}
          </div>
          <div className="text-[10px] text-muted text-right">
            {new Date(cert.created_at).toLocaleDateString()}
          </div>
        </div>

        {/* Scan thumbnails */}
        {(frontUrl || backUrl) && (
          <div className="flex gap-3 mt-4">
            {frontUrl && (
              <a href={frontUrl} target="_blank" rel="noreferrer" className="block">
                <img src={frontUrl} alt="Front" className="h-28 object-contain rounded border border-border bg-bg" />
                <div className="text-[10px] text-muted text-center mt-1">Front</div>
              </a>
            )}
            {backUrl && (
              <a href={backUrl} target="_blank" rel="noreferrer" className="block">
                <img src={backUrl} alt="Back" className="h-28 object-contain rounded border border-border bg-bg" />
                <div className="text-[10px] text-muted text-center mt-1">Back</div>
              </a>
            )}
          </div>
        )}
        {!frontUrl && !backUrl && (
          <div className="text-muted text-xs mt-3">No scans uploaded.</div>
        )}
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500/30 text-red-400 rounded px-4 py-2 text-sm mb-4">
          {error}
        </div>
      )}

      {saved && (
        <div className="bg-green/10 border border-green/30 text-green rounded px-4 py-2 text-sm mb-4">
          Inspection saved.
        </div>
      )}

      {/* Inspection form */}
      <InspectionPanel
        latest={latest}
        onSave={handleSave}
        saving={saving}
        inspectionCount={inspections.length}
      />
    </div>
  );
}

// ── Inspection panel ──────────────────────────────────────────────────────────

function InspectionPanel({
  latest,
  onSave,
  saving,
  inspectionCount,
}: {
  latest: InspectionRow | null;
  onSave: (insp: CreateInspectionRequest) => void;
  saving: boolean;
  inspectionCount: number;
}) {
  const [form, setForm] = useState<CreateInspectionRequest>(() => ({
    source: "manual",
    centering_front_lr: latest?.centering_front_lr ?? 50,
    centering_front_tb: latest?.centering_front_tb ?? 50,
    centering_back_lr: latest?.centering_back_lr ?? 50,
    centering_back_tb: latest?.centering_back_tb ?? 50,
    corners_defective_cut: 0,
    corners_major_whitening: 0,
    corners_minor_whitening: 0,
    corners_micro_whitening: 0,
    edges_whitening: 0,
    surface_dead_pixels: 0,
    surface_dimples: 0,
    surface_print_lines: 0,
    notes: latest?.notes ?? undefined,
  }));

  function setNum(key: keyof CreateInspectionRequest, value: number) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  return (
    <div className="bg-surface border border-border rounded-md p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Inspection</h2>
        {inspectionCount > 0 && (
          <span className="text-muted text-xs">{inspectionCount} record{inspectionCount !== 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Centering */}
      <section>
        <SectionHeader>Centering</SectionHeader>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div className="space-y-3">
            <div className="text-xs text-muted mb-2 uppercase tracking-widest">Front</div>
            <CenteringSlider label="L / R" value={form.centering_front_lr ?? 50} onChange={(v) => setNum("centering_front_lr", v)} />
            <CenteringSlider label="T / B" value={form.centering_front_tb ?? 50} onChange={(v) => setNum("centering_front_tb", v)} />
          </div>
          <div className="space-y-3">
            <div className="text-xs text-muted mb-2 uppercase tracking-widest">Back</div>
            <CenteringSlider label="L / R" value={form.centering_back_lr ?? 50} onChange={(v) => setNum("centering_back_lr", v)} />
            <CenteringSlider label="T / B" value={form.centering_back_tb ?? 50} onChange={(v) => setNum("centering_back_tb", v)} />
          </div>
        </div>
      </section>

      {/* Corners */}
      <section>
        <SectionHeader>Corners</SectionHeader>
        <div className="space-y-3">
          <CountSlider label="Defective cuts"   description="imperfect corner geometry"            value={form.corners_defective_cut ?? 0}   max={4} onChange={(v) => setNum("corners_defective_cut", v)} />
          <CountSlider label="Major whitening"  description="immediately noticeable, stands out"   value={form.corners_major_whitening ?? 0}  max={4} onChange={(v) => setNum("corners_major_whitening", v)} />
          <CountSlider label="Minor whitening"  description="noticeable on close inspection"       value={form.corners_minor_whitening ?? 0}  max={4} onChange={(v) => setNum("corners_minor_whitening", v)} />
          <CountSlider label="Micro whitening"  description="requires loupe, not obvious at a glance" value={form.corners_micro_whitening ?? 0} max={4} onChange={(v) => setNum("corners_micro_whitening", v)} />
        </div>
      </section>

      {/* Edges */}
      <section>
        <SectionHeader>Edges</SectionHeader>
        <CountSlider label="Whitening" value={form.edges_whitening ?? 0} max={10} onChange={(v) => setNum("edges_whitening", v)} />
      </section>

      {/* Surface */}
      <section>
        <SectionHeader>Surface</SectionHeader>
        <div className="space-y-3">
          <CountSlider label="Dead pixels"  value={form.surface_dead_pixels ?? 0}  max={20} onChange={(v) => setNum("surface_dead_pixels", v)} />
          <CountSlider label="Dimples"      value={form.surface_dimples ?? 0}       max={10} onChange={(v) => setNum("surface_dimples", v)} />
          <CountSlider label="Print lines"  value={form.surface_print_lines ?? 0}   max={10} onChange={(v) => setNum("surface_print_lines", v)} />
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

      <button
        onClick={() => onSave(form)}
        disabled={saving}
        className="bg-accent text-bg font-semibold px-4 py-2 rounded text-sm hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? "Saving…" : inspectionCount > 0 ? "Record New Inspection" : "Save Inspection"}
      </button>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="text-muted text-xs uppercase tracking-widest mb-3">{children}</div>;
}

function CenteringSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const a = value;
  const b = 100 - value;
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

function CountSlider({ label, description, value, max, onChange }: { label: string; description?: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[#e6edf3]">{label}</span>
          {description && <span className="text-muted text-[11px]">{description}</span>}
        </div>
        <span className={`font-mono font-semibold tabular-nums ${value > 0 ? "text-accent" : "text-muted"}`}>{value}</span>
      </div>
      <input type="range" min={0} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#58a6ff]" />
    </div>
  );
}

function CategoryBadge({ category }: { category: CertCategory }) {
  const colorMap: Record<CertCategory, string> = {
    raw:   "text-muted border-border",
    psa9:  "text-yellow border-yellow/30 bg-yellow/10",
    psa10: "text-green border-green/30 bg-green/10",
    cgc9:  "text-blue-400 border-blue-400/30 bg-blue-400/10",
    cgc10: "text-blue-300 border-blue-300/30 bg-blue-300/10",
  };
  return (
    <span className={`border rounded px-1.5 py-0.5 text-[10px] font-semibold ${colorMap[category] ?? "text-muted border-border"}`}>
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

// keep useRef import used for future image upload
export { imageUrl };
