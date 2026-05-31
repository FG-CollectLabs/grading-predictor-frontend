import { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type {
  CertFullDetail,
  InspectionRow,
  CreateInspectionRequest,
  CertCategory,
  CertPurpose,
  SurfaceGrade,
  CornerGrade,
  EdgeGrade,
} from "../types";
import { CenteringTool } from "../components/CenteringTool";
import type { CenteringResult } from "../components/CenteringTool";

const GCS_BASE = import.meta.env.VITE_GCS_PUBLIC_BASE ?? "";

function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return GCS_BASE ? `${GCS_BASE}/${path}` : path;
}

const CATEGORY_LABELS: Record<CertCategory, string> = {
  raw: "Raw", psa9: "PSA 9", psa10: "PSA 10", cgc9: "CGC 9", cgc10: "CGC 10",
  bgs9: "BGS 9", bgs9pt5: "BGS 9.5", bgs10: "BGS 10",
};

const PURPOSE_LABELS: Record<CertPurpose, { label: string; color: string }> = {
  analytics:         { label: "Analytics",          color: "text-muted"       },
  grading_tracker:   { label: "My Grading Tracker", color: "text-accent"      },
  buy_and_grade:     { label: "Buy + Grade",         color: "text-accent"      },
  crack_and_regrade: { label: "Crack + Regrade",     color: "text-orange-400"  },
};

// ── Grade helpers ─────────────────────────────────────────────────────────────

const CORNER_GRADES: CornerGrade[] = ["sharp", "light_wear", "heavy_wear"];
const EDGE_GRADES: EdgeGrade[] = ["clean", "light_wear", "heavy_wear", "nick"];
const SURFACE_GRADES: SurfaceGrade[] = ["clean", "light_scratch", "heavy_scratch", "print_line", "print_dot"];

function gradeColor(g: string | null): string {
  if (!g || g === "sharp" || g === "clean") return "border-border text-muted bg-transparent";
  if (g === "light_wear" || g === "light_scratch") return "border-yellow-400/50 text-yellow-400 bg-yellow-400/10";
  if (g === "heavy_wear" || g === "heavy_scratch" || g === "print_line") return "border-orange-400/50 text-orange-400 bg-orange-400/10";
  return "border-red-400/50 text-red-400 bg-red-400/10";
}

function gradeShort(g: string | null): string {
  if (!g || g === "sharp" || g === "clean") return "—";
  if (g === "light_wear" || g === "light_scratch") return "LW";
  if (g === "heavy_wear" || g === "heavy_scratch") return "HW";
  if (g === "nick") return "Nick";
  if (g === "print_line") return "PL";
  if (g === "print_dot") return "PD";
  return g;
}

// ── Edit form types ───────────────────────────────────────────────────────────

interface EditForm {
  cert_number: string;
  grader: string;
  category: CertCategory;
  purpose: CertPurpose;
  notes: string;
  grade_received: string;
  graded_at: string;
}

// ── Inspection form state ─────────────────────────────────────────────────────

interface InspForm {
  centering_front_lr: number;
  centering_front_tb: number;
  centering_front_rotation: number;
  centering_back_lr: number;
  centering_back_tb: number;
  centering_back_rotation: number;
  surface_front: SurfaceGrade | null;
  surface_back: SurfaceGrade | null;
  corner_tl: CornerGrade | null;
  corner_tr: CornerGrade | null;
  corner_bl: CornerGrade | null;
  corner_br: CornerGrade | null;
  edge_top: EdgeGrade | null;
  edge_bottom: EdgeGrade | null;
  edge_left: EdgeGrade | null;
  edge_right: EdgeGrade | null;
  notes: string;
}

function defaultForm(latest: InspectionRow | null): InspForm {
  return {
    centering_front_lr: latest?.centering_front_lr ?? 50,
    centering_front_tb: latest?.centering_front_tb ?? 50,
    centering_front_rotation: latest?.centering_front_rotation ?? 0,
    centering_back_lr: latest?.centering_back_lr ?? 50,
    centering_back_tb: latest?.centering_back_tb ?? 50,
    centering_back_rotation: latest?.centering_back_rotation ?? 0,
    surface_front: latest?.surface_front ?? null,
    surface_back: latest?.surface_back ?? null,
    corner_tl: latest?.corner_tl ?? null,
    corner_tr: latest?.corner_tr ?? null,
    corner_bl: latest?.corner_bl ?? null,
    corner_br: latest?.corner_br ?? null,
    edge_top: latest?.edge_top ?? null,
    edge_bottom: latest?.edge_bottom ?? null,
    edge_left: latest?.edge_left ?? null,
    edge_right: latest?.edge_right ?? null,
    notes: latest?.notes ?? "",
  };
}

function toRequest(form: InspForm): CreateInspectionRequest {
  return {
    source: "manual",
    centering_front_lr: form.centering_front_lr,
    centering_front_tb: form.centering_front_tb,
    centering_front_rotation: form.centering_front_rotation || null,
    centering_back_lr: form.centering_back_lr,
    centering_back_tb: form.centering_back_tb,
    centering_back_rotation: form.centering_back_rotation || null,
    surface_front: form.surface_front,
    surface_back: form.surface_back,
    corner_tl: form.corner_tl,
    corner_tr: form.corner_tr,
    corner_bl: form.corner_bl,
    corner_br: form.corner_br,
    edge_top: form.edge_top,
    edge_bottom: form.edge_bottom,
    edge_left: form.edge_left,
    edge_right: form.edge_right,
    notes: form.notes || undefined,
  };
}

// ── CertView ──────────────────────────────────────────────────────────────────

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

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);

  useEffect(() => {
    Promise.all([api.getCert(certId), api.listInspections(certId)])
      .then(([c, insps]) => {
        setCert(c);
        setInspections(insps ?? []);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [certId]);

  function startEdit() {
    if (!cert) return;
    setEditForm({
      cert_number: cert.cert_number,
      grader: cert.grader,
      category: cert.category,
      purpose: cert.purpose,
      notes: cert.notes ?? "",
      grade_received: cert.grade_received !== null ? String(cert.grade_received) : "",
      graded_at: cert.graded_at ?? "",
    });
    setEditError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditForm(null);
    setEditError(null);
  }

  async function submitEdit() {
    if (!editForm) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const gradeVal = editForm.grade_received.trim();
      const updated = await api.patchCert(certId, {
        cert_number: editForm.cert_number,
        grader: editForm.grader,
        notes: editForm.notes,
        category: editForm.category,
        purpose: editForm.purpose,
        grade_received: gradeVal !== "" ? Number(gradeVal) : null,
        graded_at: editForm.graded_at || undefined,
      });
      setCert((prev) => prev ? { ...prev, ...updated } : prev);
      setEditing(false);
      setEditForm(null);
    } catch (e) {
      setEditError(String(e));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.deleteCert(certId);
      navigate(-1);
    } catch (e) {
      setError(String(e));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleImageUpload(side: "front" | "back", file: File) {
    const setUploading = side === "front" ? setUploadingFront : setUploadingBack;
    setUploading(true);
    setError(null);
    try {
      await api.uploadCertImage(certId, side, file);
      const updated = await api.getCert(certId);
      setCert(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  }

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
        {editing && editForm ? (
          <EditCertForm
            form={editForm}
            onChange={(patch) => setEditForm((p) => p ? { ...p, ...patch } : p)}
            onSave={submitEdit}
            onCancel={cancelEdit}
            saving={editSaving}
            error={editError}
          />
        ) : (
          <>
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
              <div className="flex flex-col items-end gap-2">
                <div className="text-[10px] text-muted">{new Date(cert.created_at).toLocaleDateString()}</div>
                <div className="flex gap-1.5">
                  <button
                    onClick={startEdit}
                    className="text-xs text-muted hover:text-accent transition-colors border border-border hover:border-accent rounded px-2 py-0.5"
                  >
                    Edit
                  </button>
                  {confirmDelete ? (
                    <>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="text-xs text-red-400 border border-red-500/50 rounded px-2 py-0.5 hover:bg-red-900/20 transition-colors disabled:opacity-40"
                      >
                        {deleting ? "Deleting…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="text-xs text-muted border border-border rounded px-2 py-0.5 hover:text-[#e6edf3] transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="text-xs text-muted hover:text-red-400 transition-colors border border-border hover:border-red-500/50 rounded px-2 py-0.5"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Scans */}
            <div className="flex gap-4 mt-4">
              <ScanSlot
                label="Front"
                url={frontUrl}
                uploading={uploadingFront}
                onUpload={(f) => handleImageUpload("front", f)}
              />
              <ScanSlot
                label="Back"
                url={backUrl}
                uploading={uploadingBack}
                onUpload={(f) => handleImageUpload("back", f)}
              />
            </div>
          </>
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

      {/* Inspection panel */}
      <InspectionPanel
        latest={latest}
        certImages={{ front: frontUrl, back: backUrl }}
        onSave={handleSave}
        saving={saving}
        inspectionCount={inspections.length}
      />
    </div>
  );
}

// ── Edit cert form ─────────────────────────────────────────────────────────────

function EditCertForm({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
}: {
  form: EditForm;
  onChange: (patch: Partial<EditForm>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const inputCls = "w-full bg-bg border border-border rounded px-3 py-1.5 text-sm text-[#e6edf3] outline-none focus:border-accent";
  const labelCls = "text-muted text-xs block mb-1";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">Edit Cert</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Cert Number</label>
          <input className={inputCls} value={form.cert_number} onChange={(e) => onChange({ cert_number: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Grader</label>
          <select className={inputCls} value={form.grader} onChange={(e) => onChange({ grader: e.target.value })}>
            <option>PSA</option><option>CGC</option><option>BGS</option><option>SGC</option><option>ACE</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Category</label>
          <select className={inputCls} value={form.category} onChange={(e) => onChange({ category: e.target.value as CertCategory })}>
            <option value="raw">Raw</option>
            <option value="psa9">PSA 9</option><option value="psa10">PSA 10</option>
            <option value="cgc9">CGC 9</option><option value="cgc10">CGC 10</option>
            <option value="bgs9">BGS 9</option><option value="bgs9pt5">BGS 9.5</option><option value="bgs10">BGS 10</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Purpose</label>
          <select className={inputCls} value={form.purpose} onChange={(e) => onChange({ purpose: e.target.value as CertPurpose })}>
            <option value="analytics">Analytics</option>
            <option value="grading_tracker">My Grading Tracker</option>
            <option value="buy_and_grade">Buy + Grade</option>
            <option value="crack_and_regrade">Crack + Regrade</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Grade Received</label>
          <input type="number" min={1} max={10} step={0.5} placeholder="blank if not graded"
            className={inputCls} value={form.grade_received}
            onChange={(e) => onChange({ grade_received: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Graded At</label>
          <input type="date" className={inputCls} value={form.graded_at}
            onChange={(e) => onChange({ graded_at: e.target.value })} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Notes</label>
        <textarea rows={2}
          className="w-full bg-bg border border-border rounded px-3 py-1.5 text-sm text-[#e6edf3] outline-none focus:border-accent resize-none"
          value={form.notes} onChange={(e) => onChange({ notes: e.target.value })} placeholder="optional notes…" />
      </div>

      {error && <div className="text-red-400 text-xs">{error}</div>}

      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving}
          className="bg-accent text-bg font-semibold px-4 py-1.5 rounded text-sm hover:bg-accent/90 disabled:opacity-40 transition-colors">
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} disabled={saving}
          className="text-muted hover:text-[#e6edf3] border border-border rounded px-4 py-1.5 text-sm transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Inspection panel ──────────────────────────────────────────────────────────

function InspectionPanel({
  latest,
  certImages,
  onSave,
  saving,
  inspectionCount,
}: {
  latest: InspectionRow | null;
  certImages: { front: string | null; back: string | null };
  onSave: (insp: CreateInspectionRequest) => void;
  saving: boolean;
  inspectionCount: number;
}) {
  const [form, setForm] = useState<InspForm>(() => defaultForm(latest));
  const [showCentering, setShowCentering] = useState(false);

  function patch(p: Partial<InspForm>) { setForm((prev) => ({ ...prev, ...p })); }

  function applyCentering(front: CenteringResult, back: CenteringResult) {
    patch({
      centering_front_lr: front.lr,
      centering_front_tb: front.tb,
      centering_front_rotation: front.rotationDeg,
      centering_back_lr: back.lr,
      centering_back_tb: back.tb,
      centering_back_rotation: back.rotationDeg,
    });
    setShowCentering(false);
  }

  const hasCertImages = !!(certImages.front || certImages.back);

  return (
    <>
      {showCentering && (
        <CenteringTool
          frontImage={certImages.front ?? undefined}
          backImage={certImages.back ?? undefined}
          onDone={applyCentering}
          onSkip={() => setShowCentering(false)}
          doneLabel="Apply to Inspection →"
        />
      )}

      <div className="bg-surface border border-border rounded-md p-5 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Inspection</h2>
          {inspectionCount > 0 && (
            <span className="text-muted text-xs">{inspectionCount} record{inspectionCount !== 1 ? "s" : ""}</span>
          )}
        </div>

        {/* Latest defect summary (read-only) */}
        {latest && hasAnyDefect(latest) && (
          <section>
            <SectionHeader>Latest Defects</SectionHeader>
            <CardDefectMap form={defectFormFromRow(latest)} onChange={() => {}} readOnly />
          </section>
        )}

        {/* Centering */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <SectionHeader>Centering</SectionHeader>
            {hasCertImages && (
              <button
                onClick={() => setShowCentering(true)}
                className="text-[10px] text-muted hover:text-accent border border-border hover:border-accent rounded px-2 py-0.5 transition-colors"
              >
                Set Lines
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div className="space-y-3">
              <div className="text-xs text-muted mb-2 uppercase tracking-widest">Front</div>
              <CenteringRow label="L / R" value={form.centering_front_lr}
                onChange={(v) => patch({ centering_front_lr: v })} />
              <CenteringRow label="T / B" value={form.centering_front_tb}
                onChange={(v) => patch({ centering_front_tb: v })} />
              <RotationRow value={form.centering_front_rotation}
                onChange={(v) => patch({ centering_front_rotation: v })} />
            </div>
            <div className="space-y-3">
              <div className="text-xs text-muted mb-2 uppercase tracking-widest">Back</div>
              <CenteringRow label="L / R" value={form.centering_back_lr}
                onChange={(v) => patch({ centering_back_lr: v })} />
              <CenteringRow label="T / B" value={form.centering_back_tb}
                onChange={(v) => patch({ centering_back_tb: v })} />
              <RotationRow value={form.centering_back_rotation}
                onChange={(v) => patch({ centering_back_rotation: v })} />
            </div>
          </div>
        </section>

        {/* Defect map */}
        <section>
          <SectionHeader>Defects</SectionHeader>
          <CardDefectMap form={form} onChange={patch} />
        </section>

        {/* Notes */}
        <div>
          <label className="text-muted text-xs block mb-1">Notes</label>
          <textarea rows={2} value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="any additional observations…"
            className="w-full bg-bg border border-border rounded px-3 py-2 text-sm text-[#e6edf3] placeholder-muted outline-none focus:border-accent resize-none" />
        </div>

        <button
          onClick={() => onSave(toRequest(form))}
          disabled={saving}
          className="bg-accent text-bg font-semibold px-4 py-2 rounded text-sm hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving…" : inspectionCount > 0 ? "Record New Inspection" : "Save Inspection"}
        </button>
      </div>
    </>
  );
}

function hasAnyDefect(r: InspectionRow): boolean {
  return !!(r.corner_tl || r.corner_tr || r.corner_bl || r.corner_br ||
            r.edge_top || r.edge_bottom || r.edge_left || r.edge_right ||
            r.surface_front || r.surface_back);
}

function defectFormFromRow(r: InspectionRow): InspForm {
  return {
    centering_front_lr: r.centering_front_lr ?? 50,
    centering_front_tb: r.centering_front_tb ?? 50,
    centering_front_rotation: r.centering_front_rotation ?? 0,
    centering_back_lr: r.centering_back_lr ?? 50,
    centering_back_tb: r.centering_back_tb ?? 50,
    centering_back_rotation: r.centering_back_rotation ?? 0,
    surface_front: r.surface_front as SurfaceGrade | null,
    surface_back: r.surface_back as SurfaceGrade | null,
    corner_tl: r.corner_tl as CornerGrade | null,
    corner_tr: r.corner_tr as CornerGrade | null,
    corner_bl: r.corner_bl as CornerGrade | null,
    corner_br: r.corner_br as CornerGrade | null,
    edge_top: r.edge_top as EdgeGrade | null,
    edge_bottom: r.edge_bottom as EdgeGrade | null,
    edge_left: r.edge_left as EdgeGrade | null,
    edge_right: r.edge_right as EdgeGrade | null,
    notes: r.notes ?? "",
  };
}

// ── Card defect map ───────────────────────────────────────────────────────────

function CardDefectMap({
  form,
  onChange,
  readOnly = false,
}: {
  form: InspForm;
  onChange: (p: Partial<InspForm>) => void;
  readOnly?: boolean;
}) {
  const [surfaceSide, setSurfaceSide] = useState<"front" | "back">("front");

  function cycleCorner(key: keyof InspForm) {
    if (readOnly) return;
    const cur = (form[key] as CornerGrade | null) ?? "sharp";
    const idx = CORNER_GRADES.indexOf(cur);
    onChange({ [key]: CORNER_GRADES[(idx + 1) % CORNER_GRADES.length] });
  }

  function cycleEdge(key: keyof InspForm) {
    if (readOnly) return;
    const cur = (form[key] as EdgeGrade | null) ?? "clean";
    const idx = EDGE_GRADES.indexOf(cur);
    onChange({ [key]: EDGE_GRADES[(idx + 1) % EDGE_GRADES.length] });
  }

  function cycleSurface(key: keyof InspForm) {
    if (readOnly) return;
    const cur = (form[key] as SurfaceGrade | null) ?? "clean";
    const idx = SURFACE_GRADES.indexOf(cur);
    onChange({ [key]: SURFACE_GRADES[(idx + 1) % SURFACE_GRADES.length] });
  }

  const surfaceKey = surfaceSide === "front" ? "surface_front" : "surface_back";
  const surfaceVal = form[surfaceKey] as SurfaceGrade | null;

  const cornerBtn = (key: keyof InspForm, pos: string) => {
    const g = form[key] as CornerGrade | null;
    const color = gradeColor(g);
    return (
      <button
        key={key}
        onClick={() => cycleCorner(key)}
        title={pos}
        disabled={readOnly && (!g || g === "sharp")}
        className={`w-10 h-10 rounded border text-[10px] font-semibold transition-colors ${color} ${
          !readOnly ? "hover:opacity-80 cursor-pointer" : "cursor-default"
        }`}
      >
        {gradeShort(g)}
      </button>
    );
  };

  const edgeBtn = (key: keyof InspForm, label: string, horiz: boolean) => {
    const g = form[key] as EdgeGrade | null;
    const color = gradeColor(g);
    return (
      <button
        key={key}
        onClick={() => cycleEdge(key)}
        title={label}
        disabled={readOnly && (!g || g === "clean")}
        className={`${horiz ? "h-10 w-full" : "w-10 h-full min-h-[2.5rem]"} rounded border text-[10px] font-semibold transition-colors ${color} ${
          !readOnly ? "hover:opacity-80 cursor-pointer" : "cursor-default"
        }`}
      >
        {gradeShort(g) === "—" ? label : gradeShort(g)}
      </button>
    );
  };

  return (
    <div className="flex gap-4 items-start">
      {/* Card grid */}
      <div className="flex-shrink-0">
        {/* Row 1: TL, top edge, TR */}
        <div className="flex gap-1 mb-1">
          {cornerBtn("corner_tl", "Top-Left")}
          {edgeBtn("edge_top", "Top", true)}
          {cornerBtn("corner_tr", "Top-Right")}
        </div>
        {/* Row 2: left edge, surface, right edge */}
        <div className="flex gap-1 mb-1 items-stretch">
          {edgeBtn("edge_left", "L", false)}
          <div
            onClick={() => cycleSurface(surfaceKey)}
            className={`flex-1 min-w-[5rem] h-16 rounded border flex flex-col items-center justify-center gap-0.5 transition-colors ${gradeColor(surfaceVal)} ${
              !readOnly ? "hover:opacity-80 cursor-pointer" : "cursor-default"
            }`}
          >
            <div className="flex gap-1 mb-0.5">
              {(["front", "back"] as const).map((s) => (
                <button
                  key={s}
                  onClick={(e) => { e.stopPropagation(); setSurfaceSide(s); }}
                  className={`text-[9px] px-1 py-0.5 rounded transition-colors ${
                    surfaceSide === s ? "bg-accent/20 text-accent" : "text-muted hover:text-[#e6edf3]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <span className="text-[10px] font-semibold">{gradeShort(surfaceVal)}</span>
          </div>
          {edgeBtn("edge_right", "R", false)}
        </div>
        {/* Row 3: BL, bottom edge, BR */}
        <div className="flex gap-1">
          {cornerBtn("corner_bl", "Bottom-Left")}
          {edgeBtn("edge_bottom", "Bot", true)}
          {cornerBtn("corner_br", "Bottom-Right")}
        </div>
      </div>

      {/* Legend */}
      {!readOnly && (
        <div className="text-[10px] text-muted space-y-1 pt-1">
          <div className="font-semibold text-[#e6edf3] mb-2">Click to cycle</div>
          <div>Corners: sharp → light → heavy</div>
          <div>Edges: clean → light → heavy → nick</div>
          <div>Surface: clean → scratch → PL → PD</div>
        </div>
      )}
    </div>
  );
}

// ── Scan slot ──────────────────────────────────────────────────────────────────

function ScanSlot({
  label,
  url,
  uploading,
  onUpload,
}: {
  label: string;
  url: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  function handleFile(f: File | null) {
    if (f?.type.startsWith("image/")) onUpload(f);
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current++;
    setDragging(true);
  }
  function onDragLeave() {
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setDragging(false); }
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    handleFile(e.dataTransfer.files[0] ?? null);
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />

      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={`rounded border transition-colors ${
          dragging ? "border-accent bg-accent/5" : "border-border"
        }`}
      >
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="block">
            <img src={url} alt={label} className="h-28 object-contain rounded bg-bg" />
          </a>
        ) : (
          <div className={`h-28 w-20 rounded flex items-center justify-center text-muted text-xs bg-bg ${
            dragging ? "text-accent" : ""
          }`}>
            {dragging ? "Drop" : "No scan"}
          </div>
        )}
      </div>

      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="text-[10px] text-muted hover:text-accent border border-border hover:border-accent rounded px-2 py-0.5 transition-colors disabled:opacity-40"
      >
        {uploading ? "Uploading…" : url ? `Replace ${label}` : `Upload ${label}`}
      </button>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="text-muted text-xs uppercase tracking-widest mb-3">{children}</div>;
}

function CenteringRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
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

function RotationRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const off = Math.abs(value) >= 1;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted text-xs flex-1">Rotation</span>
      <input
        type="number" step={0.1} min={-45} max={45}
        value={value === 0 ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        placeholder="0°"
        className={`w-16 text-right bg-bg border rounded px-2 py-0.5 text-xs font-mono outline-none focus:border-accent ${
          off ? "text-yellow-400 border-yellow-400/40" : "text-muted border-border"
        }`}
      />
      <span className="text-muted text-xs">°</span>
    </div>
  );
}

function CategoryBadge({ category }: { category: CertCategory }) {
  const colorMap: Record<CertCategory, string> = {
    raw:      "text-muted border-border",
    psa9:     "text-yellow border-yellow/30 bg-yellow/10",
    psa10:    "text-green border-green/30 bg-green/10",
    cgc9:     "text-blue-400 border-blue-400/30 bg-blue-400/10",
    cgc10:    "text-blue-300 border-blue-300/30 bg-blue-300/10",
    bgs9:     "text-orange-400 border-orange-400/30 bg-orange-400/10",
    bgs9pt5:  "text-orange-300 border-orange-300/30 bg-orange-300/10",
    bgs10:    "text-green border-green/30 bg-green/10",
  };
  return (
    <span className={`border rounded px-1.5 py-0.5 text-[10px] font-semibold ${colorMap[category] ?? "text-muted border-border"}`}>
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

export { imageUrl };
