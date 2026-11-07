import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, imageUrl } from "../api";
import type { CopyList, CopyRow } from "../types";

// Raw copies: cards sent for grade odds without a slab (POST /v1/predict, e.g.
// the market tracker's eBay listings and "check centering"). Their photos and
// the engine's measurements are kept so a person can check them, above all
// for the copies that were bought, and say what the engine got wrong.

const PAGE = 60;
const ratio = (p: number | null | undefined) => (p == null ? "—" : `${Math.round(p * 10) / 10}/${Math.round((100 - p) * 10) / 10}`);
const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function RawCopies() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "bought";
  const offset = Number(params.get("offset") ?? 0);
  const [data, setData] = useState<CopyList | null>(null);
  const [counts, setCounts] = useState<{ bought: number; all: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams({ grader: "RAW", limit: String(PAGE), offset: String(offset) });
    if (view === "bought") p.set("bought", "yes");
    setData(null);
    api.listCopies(p).then(setData).catch((e: unknown) => setErr(String(e)));
  }, [view, offset]);

  useEffect(() => {
    Promise.all([
      api.listCopies(new URLSearchParams({ grader: "RAW", bought: "yes", limit: "1" })),
      api.listCopies(new URLSearchParams({ grader: "RAW", limit: "1" })),
    ]).then(([b, a]) => setCounts({ bought: b.total, all: a.total })).catch(() => undefined);
  }, []);

  const tab = (v: string, label: string, n?: number) => (
    <button onClick={() => setParams({ view: v })}
      className={`px-3 py-1 rounded border text-xs ${view === v ? "border-accent text-accent" : "border-border text-muted hover:text-[#e6edf3]"}`}>
      {label}{n != null && <span className="text-[10px] text-muted ml-1">{n}</span>}
    </button>
  );

  return (
    <section className="space-y-4">
      <div>
        <div className="text-xs text-muted"><Link to="/factory" className="hover:text-accent">factory</Link> / raw copies</div>
        <h1 className="text-base font-semibold mt-1">Raw copies</h1>
        <p className="text-xs text-muted max-w-3xl mt-1">
          Cards sent for grade odds without a slab: the market tracker's eBay listings and its "check centering" button.
          Their photos and the engine's measurements are kept here. Check the ones you bought: fix the outline and corners
          where the engine is off, so the raw-card analysis improves. Mark a copy bought from its review page.
        </p>
      </div>
      <div className="flex gap-2">
        {tab("bought", "bought", counts?.bought)}
        {tab("all", "all raw copies", counts?.all)}
      </div>
      {err && <div className="text-xs text-red-400">{err}</div>}
      {!data ? <div className="text-xs text-muted">loading…</div>
        : data.items.length === 0 ? <div className="text-xs text-muted">{view === "bought" ? "No copies marked bought yet." : "No raw copies yet."}</div>
        : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {data.items.map((c) => <Tile key={c.id} c={c} />)}
          </div>
        )}
      {data && data.total > PAGE && (
        <div className="flex gap-2 text-xs">
          <button disabled={offset === 0} onClick={() => setParams({ view, offset: String(Math.max(0, offset - PAGE)) })}
            className="border border-border rounded px-2 py-1 disabled:opacity-40">← newer</button>
          <span className="text-muted py-1">{offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total}</span>
          <button disabled={offset + PAGE >= data.total} onClick={() => setParams({ view, offset: String(offset + PAGE) })}
            className="border border-border rounded px-2 py-1 disabled:opacity-40">older →</button>
        </div>
      )}
    </section>
  );
}

function Tile({ c }: { c: CopyRow }) {
  const reviewed = c.front_centering?.status === "accepted" && c.back_centering?.status === "accepted";
  return (
    <Link to={`/copies/${c.id}`} className="bg-surface border border-border rounded p-2 hover:border-accent/60 space-y-1 block">
      <div className="aspect-[5/7] bg-bg rounded overflow-hidden flex items-center justify-center">
        {c.front_image ? <img src={imageUrl(c.front_image)} alt={c.card_name} className="w-full h-full object-contain" loading="lazy" />
          : <span className="text-[10px] text-muted">no photo</span>}
      </div>
      <div className="text-xs truncate">{c.card_name} <span className="text-muted">{c.card_number}</span></div>
      <div className="text-[10px] text-muted truncate">{c.set_name}</div>
      <div className="text-[10px] font-mono">
        F {ratio(c.front_centering?.lr)} · {ratio(c.front_centering?.tb)}<br />
        B {ratio(c.back_centering?.lr)} · {ratio(c.back_centering?.tb)}
      </div>
      <div className="flex flex-wrap gap-1 text-[9px]">
        {c.bought_at && <span className="border border-green/50 text-green rounded px-1">bought{c.bought_price_cents != null ? ` ${usd(c.bought_price_cents)}` : ""}</span>}
        <span className={`border rounded px-1 ${reviewed ? "border-green/50 text-green" : "border-border text-muted"}`}>{reviewed ? "reviewed" : "engine only"}</span>
        <span className="text-muted">{new Date(c.updated_at).toLocaleDateString()}</span>
      </div>
    </Link>
  );
}
