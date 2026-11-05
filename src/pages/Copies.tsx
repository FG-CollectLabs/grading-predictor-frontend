import { useEffect, useRef, useState } from "react";
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

// Bulk review: at these stations the list gets tick boxes and an action bar.
// Each action records the same thing as deciding the copies one by one.
const BULK: Record<string, { approve: string; reject?: string; hint: string }> = {
  card: { approve: "✓ Correct card", reject: "✗ Wrong card", hint: "each tile shows the listing front next to the catalog image" },
  grade: { approve: "✓ Grader & grade correct", reject: "✗ Not a genuine slab", hint: "check the label on each front" },
  cert: { approve: "✓ Cert correct", hint: "" },
  photos: { approve: "✓ Photos are right", hint: "front and back are the full slab" },
};

export default function Copies() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<CopyList | null>(null);
  const [counts, setCounts] = useState<CopyList["counts"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(params.get("q") ?? "");

  const offset = Number(params.get("offset") ?? 0);
  const station = params.get("station") ?? "";
  const bulk = BULK[station];
  const [tick, setTick] = useState(0);   // bump to load the list again
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const lastClicked = useRef<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  useEffect(() => { setSelected(new Set()); lastClicked.current = null; }, [params]);

  // click a tick box; shift-click ticks the whole range from the last one
  const toggle = (id: number, shift: boolean) => {
    const ids = data?.items.map((c) => c.id) ?? [];
    setSelected((cur) => {
      const next = new Set(cur);
      const on = !cur.has(id);
      if (shift && lastClicked.current !== null) {
        const a = ids.indexOf(lastClicked.current), b = ids.indexOf(id);
        if (a >= 0 && b >= 0) {
          for (const x of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) on ? next.add(x) : next.delete(x);
          return next;
        }
      }
      on ? next.add(id) : next.delete(id);
      return next;
    });
    lastClicked.current = id;
  };

  const runBulk = async (action: "approve" | "reject" | "remove") => {
    const ids = [...selected];
    const what = (action === "approve" ? bulk.approve : action === "reject" ? bulk.reject : "Remove from the dataset") ?? "Reject";
    if (!ids.length || !confirm(`${what.replace(/^[✓✗] /, "")}: ${ids.length} cop${ids.length === 1 ? "y" : "ies"}?`)) return;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const r = await api.bulkReview({ station, action, ids });
      setBulkMsg(`${what.replace(/^[✓✗] /, "")}: ${r.done} cop${r.done === 1 ? "y" : "ies"}${r.skipped ? ` (${r.skipped} skipped)` : ""}.`);
      setSelected(new Set());
      setTick((t) => t + 1);
    } catch (e) {
      setBulkMsg(String(e));
    } finally {
      setBulkBusy(false);
    }
  };

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
  }, [params, tick]);

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
            <button onClick={() => setTick((t) => t + 1)} disabled={loading} title="load this list again (what's left)"
              className="border border-border rounded px-2 py-1 disabled:opacity-30 hover:border-accent">
              ↻ refresh
            </button>
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
        {data?.items.map((c) => (
          <CopyTile key={c.id} copy={c} query={listQuery} catalog={station === "card"}
            selected={bulk ? selected.has(c.id) : undefined} onToggle={(shift) => toggle(c.id, shift)} />
        ))}
      </div>
      {data && data.items.length === 0 && !loading && <div className="text-muted text-center py-12">No copies match.</div>}

      {bulk && data && data.items.length > 0 && (
        <div className="sticky bottom-0 mt-4 bg-bg/95 border-t border-border py-3 flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold">{selected.size} selected</span>
          <button className="text-muted hover:text-accent" onClick={() => setSelected(new Set(data.items.map((c) => c.id)))}>
            select all {data.items.length} on this page
          </button>
          {selected.size > 0 && <button className="text-muted hover:text-accent" onClick={() => setSelected(new Set())}>clear</button>}
          <span className="text-[10px] text-muted">shift-click ticks a range{bulk.hint ? ` · ${bulk.hint}` : ""}</span>
          <div className="ml-auto flex gap-2">
            <button disabled={!selected.size || bulkBusy} onClick={() => runBulk("approve")}
              className="px-3 py-1.5 rounded bg-green/20 border border-green/50 text-green font-semibold disabled:opacity-40">{bulk.approve}</button>
            {bulk.reject && (
              <button disabled={!selected.size || bulkBusy} onClick={() => runBulk("reject")}
                className="px-3 py-1.5 rounded border border-red-400/50 text-red-400 disabled:opacity-40">{bulk.reject}</button>
            )}
            <button disabled={!selected.size || bulkBusy} onClick={() => runBulk("remove")}
              className="px-3 py-1.5 rounded border border-border text-muted hover:text-red-400 disabled:opacity-40">🗑 Remove from dataset</button>
          </div>
          {bulkMsg && <div className="w-full text-[11px] text-green">{bulkMsg}</div>}
        </div>
      )}
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

function CopyTile({ copy, query, catalog, selected, onToggle }: {
  copy: CopyRow; query: string; catalog?: boolean; selected?: boolean; onToggle?: (shift: boolean) => void;
}) {
  return (
    <Link
      to={`/copies/${copy.id}${query}`}
      className={`relative bg-surface border rounded-md p-2 hover:border-accent/60 transition-colors flex flex-col gap-2 ${
        selected ? "border-accent ring-1 ring-accent" : "border-border"}`}
    >
      {selected !== undefined && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle?.(e.shiftKey); }}
          className={`absolute top-1 left-1 z-10 w-6 h-6 rounded border-2 flex items-center justify-center text-sm font-bold ${
            selected ? "bg-accent border-accent text-bg" : "bg-bg/80 border-border text-transparent hover:border-accent"}`}
          title="select (shift-click: a range)"
        >✓</button>
      )}
      <div className="grid grid-cols-2 gap-1">
        <Thumb path={copy.front_image} label="front" />
        {catalog ? <CatalogThumb url={copy.card_image ?? null} /> : <Thumb path={copy.back_image} label="back" />}
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

/** The card's catalog image (PriceCharting thumbnails served at 240 px for the list). */
function CatalogThumb({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="aspect-[5/7] bg-bg border border-dashed border-border rounded flex items-center justify-center text-[9px] text-muted">
        no catalog image
      </div>
    );
  }
  const src = url
    .replace(/^(https:\/\/storage\.googleapis\.com\/images\.pricecharting\.com\/[^/]+)\/(60|1600)\.jpg$/, "$1/240.jpg")
    .replace(/^(https:\/\/assets\.tcgdex\.net\/.+)\/high\.webp$/, "$1/low.webp");
  return (
    <div className="relative">
      <img src={src.startsWith("http") ? src : imageUrl(src)} alt="catalog" loading="lazy" className="aspect-[5/7] w-full object-contain bg-bg rounded" />
      <span className="absolute bottom-0 left-0 right-0 text-center text-[8px] bg-bg/70 text-muted">catalog</span>
    </div>
  );
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
