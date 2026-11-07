import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, imageUrl } from "../api";

// What the factory decided on its own (backend auto_actions.go): removals and
// corrections by category, the newest 10 of each to audit, and an undo. A
// restored copy is never removed automatically again.

interface Item {
  event_id: number; copy_id: number; card_name: string; grader: string; grade: number | null; language: string | null;
  note: string | null; at: string; restored: boolean; front_image: string | null;
}
interface Category { category: string; kind: "removed" | "corrected"; total: number; last_7_days: number; restored: number; recent: Item[] }

const WHAT: Record<string, string> = {
  "ai-raw": "no grading slab in any photo (a raw card listed as graded)",
  "wrong-card": "the photos show a different card or language than the catalog's",
  "label-unreadable": "the slab's grader / grade can't be read in any photo",
  "grade-corrected": "the slab says a different grader / grade / label than the listing: corrected to the slab",
  "photo-front-unusable": "the chosen front photo isn't the whole card: dropped (pull scans or removal follows)",
  "photo-back-unusable": "the chosen back photo isn't the whole card: dropped (pull scans or removal follows)",
  "no-cert": "no cert and no full front / back photo: no scans can be looked up",
  "old-cert-no-scans": "cert predates the grader scanning every card (Settings): nothing to pull",
  dedupe: "the same slab listed twice",
};

export default function AutoActions() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api.autoActions().then((r) => setCats(r.categories as Category[])).catch((e: unknown) => setErr(String(e)));
  useEffect(() => { load(); }, []);
  return (
    <section className="space-y-4 max-w-6xl">
      <div>
        <div className="text-xs text-muted"><Link to="/factory" className="hover:text-accent">factory</Link> / automatic decisions</div>
        <h1 className="text-base font-semibold mt-1">What the factory decided on its own</h1>
        <p className="text-xs text-muted mt-1 max-w-3xl">
          Removals and corrections made without you, by reason, with the newest 10 of each to audit. <b>Restore</b> undoes a
          removal and keeps that copy from being removed automatically again. A high restore count means a rule needs fixing.
        </p>
      </div>
      {err && <div className="text-xs text-red-400">{err}</div>}
      {!cats ? <div className="text-xs text-muted">loading…</div> : cats.length === 0 ? <div className="text-xs text-muted">Nothing yet.</div> : (
        <div className="space-y-4">
          {cats.map((c) => <Cat key={c.category + c.kind} c={c} onChange={load} />)}
        </div>
      )}
    </section>
  );
}

function Cat({ c, onChange }: { c: Category; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-surface border border-border rounded p-3 text-xs space-y-2">
      <button onClick={() => setOpen(!open)} className="w-full flex flex-wrap items-baseline gap-3 text-left">
        <span className={`border rounded px-1 text-[10px] ${c.kind === "removed" ? "border-red-400/50 text-red-300" : "border-yellow/50 text-yellow"}`}>{c.kind}</span>
        <span className="font-semibold">{c.category}</span>
        <span className="text-muted">{WHAT[c.category] ?? ""}</span>
        <span className="ml-auto font-mono">{c.total.toLocaleString()} total · {c.last_7_days.toLocaleString()} this week{c.restored ? ` · ${c.restored} restored` : ""}</span>
        <span className="text-muted">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {c.recent.map((it) => <Tile key={it.event_id} it={it} removable={c.kind === "removed"} onChange={onChange} />)}
        </div>
      )}
    </div>
  );
}

function Tile({ it, removable, onChange }: { it: Item; removable: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="border border-border rounded p-1.5 space-y-1">
      <Link to={`/copies/${it.copy_id}`} className="block">
        <div className="aspect-[5/7] bg-bg rounded overflow-hidden flex items-center justify-center">
          {it.front_image ? <img src={imageUrl(it.front_image)} alt="" className="w-full h-full object-contain" loading="lazy" /> : <span className="text-[10px] text-muted">no photo</span>}
        </div>
      </Link>
      <div className="truncate">{it.card_name}</div>
      <div className="text-[10px] text-muted">{it.grader} {it.grade ?? ""} · {it.language ?? "?"} · {new Date(it.at).toLocaleDateString()}</div>
      {it.note && <div className="text-[10px] text-muted line-clamp-3" title={it.note}>{it.note}</div>}
      {removable && (it.restored ? <div className="text-[10px] text-green">restored</div> : (
        <button disabled={busy} onClick={async () => {
          setBusy(true);
          try { await api.restoreCopy(it.copy_id); setMsg("restored"); onChange(); } catch (e) { setMsg(String(e)); } finally { setBusy(false); }
        }} className="text-[10px] border border-border rounded px-1.5 py-0.5 hover:text-accent disabled:opacity-40">restore</button>
      ))}
      {msg && <div className="text-[10px] text-muted">{msg}</div>}
    </div>
  );
}
