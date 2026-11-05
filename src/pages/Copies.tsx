import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, imageUrl } from "../api";
import type { CenteringBrief, CopyList, CopyRow } from "../types";

// Browse every copy (feed + intake) with filters for photos, triage and
// review state. Filters live in the URL so the review page can walk the same
// list with "Save & next".

const PAGE = 48;

type Opt = { value: string; label: string };

const REVIEW: Opt[] = [
  { value: "", label: "All" },
  { value: "needed", label: "Needs review" },
  { value: "unreviewed", label: "Done, not reviewed" },
  { value: "reviewed", label: "Reviewed" },
];
const PHOTOS: Opt[] = [
  { value: "", label: "Any" },
  { value: "both", label: "Front + back" },
  { value: "any", label: "Some" },
  { value: "none", label: "None" },
];
const CENTERING: Opt[] = [
  { value: "", label: "Any" },
  { value: "proposed", label: "To check" },
  { value: "accepted", label: "Accepted" },
  { value: "none", label: "Not measured" },
];
const TRIAGE: Opt[] = [
  { value: "", label: "Any status" },
  { value: "done", label: "Done" },
  { value: "needs_ai", label: "Needs AI" },
  { value: "pending", label: "Queued" },
  { value: "failed", label: "Failed" },
  { value: "skipped", label: "Skipped (over cap)" },
  { value: "none", label: "No feed photos" },
];
const GRADERS: Opt[] = [{ value: "", label: "Any grader" }, ...["PSA", "CGC", "PCG", "BGS", "TAG", "SGC"].map((g) => ({ value: g, label: g }))];
const GRADES: Opt[] = [{ value: "", label: "Any grade" }, ...["10", "9.5", "9", "8.5", "8"].map((g) => ({ value: g, label: g }))];
const LANGS: Opt[] = [
  { value: "", label: "Any language" },
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
];

const STATION_LABEL: Record<string, string> = {
  card: "card identification", grade: "grader & grade", cert: "cert number", photos: "front & back photos",
  front: "front centering", back: "back centering",
};
const STATE_LABEL: Record<string, string> = {
  queued: "in the automation queue", upstream: "waiting at earlier machines", high: "auto-passed (high)",
  medium: "auto-passed (medium)", low: "needs you", scans: "needs scans from the cert page", reviewed: "reviewed by you", removed: "removed", auto: "auto-passed",
};

export const FLAG_LABELS: Record<string, string> = {
  no_front: "no front",
  no_back: "no back",
  single_photo: "1 photo",
  no_cert: "no cert",
  no_reference: "no catalog image",
  back_by_qr: "back via QR",
  front_by_elimination: "front by elimination",
  cert_mismatch: "cert ≠ listing",
  cert_taken: "cert on another copy",
  grader_mismatch: "grader ≠ title",
  codes_disagree: "codes disagree",
};

export default function Copies() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<CopyList | null>(null);
  const [counts, setCounts] = useState<CopyList["counts"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(params.get("q") ?? "");

  const offset = Number(params.get("offset") ?? 0);

  useEffect(() => {
    const p = new URLSearchParams(params);
    p.set("limit", String(PAGE));
    setLoading(true);
    api
      .listCopies(p)
      .then((d) => {
        setData(d);
        if (d.counts) setCounts(d.counts);
        setError(null);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [params]);

  function set(key: string, value: string) {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete("offset");
    setParams(p);
  }

  function page(delta: number) {
    const p = new URLSearchParams(params);
    const next = Math.max(0, offset + delta * PAGE);
    if (next) p.set("offset", String(next));
    else p.delete("offset");
    setParams(p);
  }

  const countFor: Record<string, number | undefined> = {
    needed: counts?.needs_review,
    unreviewed: counts?.unreviewed,
    reviewed: counts?.reviewed,
    both: counts?.both_photos,
  };

  // The review page keeps the list's filters (minus paging) for "Save & next".
  const listQuery = (() => {
    const p = new URLSearchParams(params);
    p.delete("offset");
    const s = p.toString();
    return s ? `?${s}` : "";
  })();

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 text-xs text-muted">
        <Link to="/" className="hover:text-accent transition-colors">← Games</Link>
        <span className="text-border">/</span>
        <span className="text-[#e6edf3]">Copies</span>
      </div>

      {params.get("station") && (
        <div className="bg-accent/5 border border-accent/30 rounded-md px-3 py-2 mb-3 text-xs flex items-center gap-2">
          <span>
            Factory station <span className="font-semibold">{STATION_LABEL[params.get("station")!] ?? params.get("station")}</span> ·{" "}
            <span className="font-semibold">{STATE_LABEL[params.get("state") ?? ""] ?? params.get("state")}</span>
          </span>
          <button onClick={() => { const p = new URLSearchParams(params); p.delete("station"); p.delete("state"); p.delete("offset"); setParams(p); }}
            className="ml-auto text-muted hover:text-accent">clear ✕</button>
        </div>
      )}
      <div className="bg-surface border border-border rounded-md p-4 mb-4 space-y-3">
        <ChipRow label="Review" opts={REVIEW} value={params.get("review") ?? ""} counts={countFor} onPick={(v) => set("review", v)} />
        <ChipRow label="Photos" opts={PHOTOS} value={params.get("photos") ?? ""} counts={countFor} onPick={(v) => set("photos", v)} />
        <ChipRow label="Centering" opts={CENTERING} value={params.get("centering") ?? ""} counts={{}} onPick={(v) => set("centering", v)} />
        <div className="flex flex-wrap gap-2 items-center">
          <Select opts={TRIAGE} value={params.get("triage") ?? ""} onChange={(v) => set("triage", v)} />
          <Select opts={GRADERS} value={params.get("grader") ?? ""} onChange={(v) => set("grader", v)} />
          <Select opts={GRADES} value={params.get("grade") ?? ""} onChange={(v) => set("grade", v)} />
          <Select opts={LANGS} value={params.get("language") ?? ""} onChange={(v) => set("language", v)} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              set("q", q.trim());
            }}
            className="flex gap-1"
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="card, set or cert #"
              className="bg-bg border border-border rounded px-2 py-1 text-xs outline-none focus:border-accent w-48"
            />
          </form>
          {params.toString() && (
            <button onClick={() => { setQ(""); setParams(new URLSearchParams()); }} className="text-xs text-muted hover:text-accent">
              clear
            </button>
          )}
        </div>
      </div>

      {error && <div className="text-red-400 py-4">{error}</div>}

      {data && (
        <div className="flex items-center justify-between text-xs text-muted mb-3">
          <span>
            {data.total.toLocaleString()} cop{data.total === 1 ? "y" : "ies"}
            {data.total > 0 && ` · ${offset + 1}–${Math.min(offset + PAGE, data.total)}`}
            {loading && " · loading…"}
          </span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => page(-1)} className="border border-border rounded px-2 py-1 disabled:opacity-30 hover:border-accent">
              ← prev
            </button>
            <button disabled={offset + PAGE >= data.total} onClick={() => page(1)} className="border border-border rounded px-2 py-1 disabled:opacity-30 hover:border-accent">
              next →
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {data?.items.map((c) => <CopyTile key={c.id} copy={c} query={listQuery} />)}
      </div>
      {data && data.items.length === 0 && !loading && <div className="text-muted text-center py-12">No copies match.</div>}
    </div>
  );
}

function ChipRow({ label, opts, value, counts, onPick }: {
  label: string; opts: Opt[]; value: string; counts: Record<string, number | undefined>; onPick: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted text-[10px] uppercase tracking-widest w-20">{label}</span>
      {opts.map((o) => (
        <button
          key={o.value}
          onClick={() => onPick(o.value)}
          className={`text-xs rounded px-2.5 py-1 border transition-colors ${
            value === o.value ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:text-[#e6edf3]"
          }`}
        >
          {o.label}
          {counts[o.value] !== undefined && <span className="ml-1 opacity-70">{counts[o.value]!.toLocaleString()}</span>}
        </button>
      ))}
    </div>
  );
}

function Select({ opts, value, onChange }: { opts: Opt[]; value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-bg border border-border rounded px-2 py-1 text-xs outline-none focus:border-accent"
    >
      {opts.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function gradeText(c: Pick<CopyRow, "grader" | "grade" | "grade_label">): string {
  if (c.grade === null) return "Raw";
  const label = c.grade_label ? ` ${c.grade_label.replace("_", " ")}` : "";
  return `${c.grader} ${c.grade}${label}`;
}

export function StatusBadge({ copy }: { copy: Pick<CopyRow, "triage_status" | "needs_review" | "verdict"> }) {
  if (copy.verdict) {
    const color = copy.verdict === "unusable" ? "text-red-400 border-red-400/40" : "text-green border-green/40";
    return <span className={`border rounded px-1.5 py-0.5 text-[10px] ${color}`}>reviewed: {copy.verdict}</span>;
  }
  if (copy.needs_review) return <span className="border rounded px-1.5 py-0.5 text-[10px] text-orange-400 border-orange-400/40">needs review</span>;
  if (!copy.triage_status) return null;
  const color: Record<string, string> = {
    done: "text-accent border-accent/40",
    pending: "text-muted border-border",
    working: "text-muted border-border",
    skipped: "text-muted border-border",
    needs_ai: "text-orange-400 border-orange-400/40",
    failed: "text-red-400 border-red-400/40",
  };
  const text = copy.triage_status === "pending" ? "queued" : copy.triage_status.replace("_", " ");
  return <span className={`border rounded px-1.5 py-0.5 text-[10px] ${color[copy.triage_status]}`}>{text}</span>;
}

function CopyTile({ copy, query }: { copy: CopyRow; query: string }) {
  return (
    <Link
      to={`/copies/${copy.id}${query}`}
      className="bg-surface border border-border rounded-md p-2 hover:border-accent/60 transition-colors flex flex-col gap-2"
    >
      <div className="grid grid-cols-2 gap-1">
        <Thumb path={copy.front_image} label="front" />
        <Thumb path={copy.back_image} label="back" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold truncate" title={copy.card_name}>{copy.card_name}</div>
        <div className="text-[10px] text-muted truncate" title={copy.set_name}>
          {copy.set_name} · #{copy.card_number}{copy.language ? ` · ${copy.language}` : ""}
        </div>
        <div className="flex items-center justify-between mt-1 gap-1">
          <span className="text-[11px] font-semibold">{gradeText(copy)}</span>
          <StatusBadge copy={copy} />
        </div>
        <div className="text-[10px] text-muted font-mono mt-0.5 truncate">
          {copy.cert_number || "no cert"}
          {copy.cert_source && copy.cert_number ? ` · ${copy.cert_source}` : ""}
        </div>
        {(copy.front_centering || copy.back_centering) && (
          <div className="text-[10px] font-mono mt-0.5 flex gap-2">
            <CenteringChip label="F" c={copy.front_centering} />
            <CenteringChip label="B" c={copy.back_centering} />
          </div>
        )}
        {copy.flags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {copy.flags.map((f) => (
              <span key={f} className="text-[9px] text-muted border border-border rounded px-1">{FLAG_LABELS[f] ?? f}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

function Thumb({ path, label }: { path: string | null; label: string }) {
  if (!path) {
    return (
      <div className="aspect-[5/7] bg-bg border border-dashed border-border rounded flex items-center justify-center text-[9px] text-muted">
        no {label}
      </div>
    );
  }
  return <img src={imageUrl(path)} alt={label} loading="lazy" className="aspect-[5/7] w-full object-contain bg-bg rounded" />;
}

function CenteringChip({ label, c }: { label: string; c: CenteringBrief | null }) {
  if (!c || c.lr == null || c.tb == null) return <span className="text-muted">{label} —</span>;
  const worst = Math.max(Math.abs(c.lr - 50), Math.abs(c.tb - 50)) + 50;
  const color = c.status === "accepted" ? "text-green" : "text-yellow";
  return (
    <span className={color} title={`${c.status} · ${c.placed_by === "auto" ? `auto v${c.version}` : c.placed_by}`}>
      {label} {Math.round(worst)}/{Math.round(100 - worst)}
    </span>
  );
}
