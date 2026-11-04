import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, imageUrl } from "../api";
import type { RefQueueItem } from "../types";

// Reference (stock) images for cards the tracker has none for. Without one the
// card ID machine can't recognise a listing's front and centering has no seed.
// The finder (tools/ref_finder.py) fills what it can from public card
// databases: confirm those. The rest: find a clean image (search links) and
// drop it on the card. Each one sends that card's stuck copies back through the
// machines.

export default function References() {
  const [tab, setTab] = useState<"missing" | "to_confirm">("missing");
  const [items, setItems] = useState<RefQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<number, string>>({});

  const load = useCallback(() => {
    api.getReferenceQueue(tab, offset)
      .then((r) => { setItems(r.items); setTotal(r.total); setErr(null); })
      .catch((e: unknown) => setErr(String(e)));
  }, [tab, offset]);
  useEffect(load, [load]);

  const done = (id: number, text: string) => setMsg((m) => ({ ...m, [id]: text }));
  const act = async (c: RefQueueItem, f: () => Promise<{ result: string; requeued: number }>) => {
    try {
      const r = await f();
      done(c.card_id, `${r.result}${r.requeued ? ` · ${r.requeued} copies sent back through the machines` : ""}`);
    } catch (e) {
      done(c.card_id, String(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link to="/factory" className="hover:text-accent">← Pre-grading factory</Link>
        <span className="text-border">/</span>
        <span className="text-[#e6edf3]">Reference images</span>
      </div>
      <p className="text-xs text-muted max-w-4xl">
        Cards the market tracker has no stock image for. The card ID machine can't recognise their listing photos and
        centering has nothing to align to, so their copies pile up in "needs you". The finder fills what it can from
        public card databases (hourly); confirm those. For the rest, open a search, save a clean front image and drop it
        on the card. Most-blocking cards first.
      </p>
      <div className="flex gap-1">
        {(["missing", "to_confirm"] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); setOffset(0); setMsg({}); }}
            className={`px-3 py-1 text-xs rounded border ${tab === t ? "border-accent text-accent bg-accent/10" : "border-border text-muted"}`}>
            {t === "missing" ? "Missing" : "Found, confirm"}{tab === t ? ` (${total})` : ""}
          </button>
        ))}
      </div>
      {err && <div className="text-red-400 text-xs">{err}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
        {items.map((c) => <RefCard key={c.card_id} c={c} tab={tab} msg={msg[c.card_id]} act={act} />)}
      </div>
      {items.length === 0 && !err && <div className="text-xs text-muted py-8">Nothing here.</div>}
      {total > offset + items.length && (
        <button onClick={() => setOffset(offset + 50)} className="text-xs border border-border rounded px-3 py-1 text-muted hover:text-accent">next 50 →</button>
      )}
    </div>
  );
}

function searchLinks(c: RefQueueItem): [string, string][] {
  const q = `${c.card_name} ${c.card_number}`;
  const qs = encodeURIComponent(`${q} ${c.set_name}`);
  return [
    ["TCGplayer", `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(q)}`],
    ["PriceCharting", `https://www.pricecharting.com/search-products?q=${qs}&type=prices`],
    ["Google images", `https://www.google.com/search?tbm=isch&q=${qs}`],
  ];
}

function RefCard({ c, tab, msg, act }: {
  c: RefQueueItem; tab: string; msg?: string;
  act: (c: RefQueueItem, f: () => Promise<{ result: string; requeued: number }>) => void;
}) {
  const [over, setOver] = useState(false);
  const upload = (f: File) => act(c, () => api.uploadReference(c.card_id, f));
  useEffect(() => {
    if (!over) return;
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (f) { e.preventDefault(); upload(f); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });
  return (
    <div className={`bg-surface border rounded-md p-2 flex gap-2 ${over ? "border-accent/60" : "border-border"}`}
      onMouseEnter={() => setOver(true)} onMouseLeave={() => setOver(false)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/")); if (f) upload(f); }}>
      <div className="w-28 shrink-0">
        <div className="text-[9px] text-muted">{tab === "missing" ? "drop image here" : "found image"}</div>
        {c.image_url
          ? <img src={c.image_url} alt="reference" className="w-full aspect-[5/7] object-contain bg-bg rounded" />
          : <div className="w-full aspect-[5/7] border border-dashed border-border rounded flex items-center justify-center text-[10px] text-muted text-center p-1">drop / paste a clean front image</div>}
      </div>
      <div className="w-24 shrink-0">
        <div className="text-[9px] text-muted">a listing front</div>
        {c.sample_front
          ? <img src={imageUrl(c.sample_front)} alt="listing" className="w-full aspect-[5/7] object-contain bg-bg rounded" loading="lazy" />
          : <div className="w-full aspect-[5/7] bg-bg rounded" />}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="text-xs font-semibold">{c.card_name}</div>
        <div className="text-[11px] text-muted">{c.set_name} · #{c.card_number}{c.language ? ` · ${c.language}` : ""}</div>
        <div className="text-[11px]">
          <Link to={`/copies?card_id=${c.card_id}`} className="text-accent hover:underline">{c.copies} copies</Link>
          {c.needs_you > 0 && <span className="text-red-400"> · {c.needs_you} stuck</span>}
          {c.image_source && <span className="text-muted"> · from {c.image_source}</span>}
        </div>
        {tab === "missing" ? (
          <div className="flex flex-wrap gap-2 text-[11px]">
            {searchLinks(c).map(([l, u]) => <a key={l} href={u} target="_blank" rel="noreferrer" className="text-accent hover:underline">{l} ↗</a>)}
          </div>
        ) : (
          <div className="flex gap-1">
            <button onClick={() => act(c, () => api.setReference(c.card_id, { confirm: true }))}
              className="text-[11px] bg-accent text-bg rounded px-2 py-0.5">Right card</button>
            <button onClick={() => act(c, () => api.setReference(c.card_id, { reject: true }))}
              className="text-[11px] border border-red-400/40 text-red-400 rounded px-2 py-0.5">Wrong card</button>
          </div>
        )}
        <label className="block text-[10px] text-muted cursor-pointer hover:text-accent">
          or choose a file
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        </label>
        {msg && <div className="text-[10px] text-green">{msg}</div>}
      </div>
    </div>
  );
}
