import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { TemplateTask } from "../types";

// Where one review does the most: a card's first front you validate (accept or
// adjust) becomes its template, and every copy of that card is re-measured with
// it. Cards without one, most copies first; "Start" walks through them, one
// front centering per card.
export default function Templates() {
  const [items, setItems] = useState<TemplateTask[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.getTemplateQueue(0, 100).then((r) => { setItems(r.items); setTotal(r.total); }).catch((e: unknown) => setErr(String(e))); }, []);
  const first = items?.[0];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link to="/factory" className="hover:text-accent">← Pre-grading factory</Link><span className="text-border">/</span>
        <span className="text-[#e6edf3]">Card templates</span>
      </div>
      <p className="text-xs text-muted max-w-4xl">
        A card's first front you validate becomes its template: every other copy of that card is then measured by aligning
        its print to that one, and moves to "auto-passed · high". {total.toLocaleString()} cards don't have one yet; the
        top of this list fixes the most copies per review. Take care with the first one of each card: put the corners
        on the cut edge and the lines on the border exactly.
      </p>
      {first && (
        <Link to={`/copies/${first.copy_id}?queue=templates&station=front`}
          className="inline-block bg-accent text-bg font-semibold px-4 py-1.5 rounded text-sm">Start: one front per card →</Link>
      )}
      {err && <div className="text-red-400 text-xs">{err}</div>}
      <table className="text-xs w-full max-w-4xl">
        <thead><tr className="text-muted text-left border-b border-border"><th className="py-1"></th><th>card</th><th>copies it re-measures</th><th>engine warnings on the suggested copy</th><th></th></tr></thead>
        <tbody>
          {items?.map((t) => (
            <tr key={t.card_id} className="border-b border-[#1c2128]">
              <td className="py-1">{t.image_url ? <img src={t.image_url} alt="" loading="lazy" className="w-8 h-11 object-contain" /> : null}</td>
              <td><Link to={`/cards/${t.card_id}`} className="hover:text-accent">{t.card_name}</Link>
                <div className="text-[10px] text-muted">{t.set_name} · #{t.card_number}{t.language ? ` · ${t.language}` : ""}</div></td>
              <td className="font-mono">{t.copies}</td>
              <td className="text-[10px] text-muted">{t.flags.length ? t.flags.join(", ").replace(/_/g, " ") : "none"}</td>
              <td><Link to={`/copies/${t.copy_id}?queue=templates&station=front`} className="text-accent hover:underline">review →</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
