import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import type { SetCard } from "../../types";

// A set's cards, most-collected first.
export default function SetCards() {
  const { code } = useParams<{ code: string }>();
  const [params] = useSearchParams();
  const lang = params.get("language") ?? "";
  const [cards, setCards] = useState<SetCard[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.getSetCards(code!, lang).then((r) => setCards(r.cards)).catch((e: unknown) => setErr(String(e))); }, [code, lang]);
  const name = cards?.length ? "" : "";
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link to="/" className="hover:text-accent">Analytics</Link><span className="text-border">/</span>
        <Link to={`/games/pokemon?language=${lang || "en"}`} className="hover:text-accent">Pokémon</Link><span className="text-border">/</span>
        <span className="text-[#e6edf3]">{code}{name}</span>
      </div>
      {err && <div className="text-red-400 text-xs">{err}</div>}
      {!cards && !err && <div className="text-muted text-xs">Loading…</div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-8 gap-3">
        {cards?.map((c) => (
          <Link key={c.id} to={`/cards/${c.id}`} className="bg-surface border border-border rounded-md p-2 hover:border-accent/60">
            {c.image_url ? <img src={c.image_url} alt="" loading="lazy" className="w-full aspect-[5/7] object-contain bg-bg rounded" />
              : <div className="w-full aspect-[5/7] bg-bg rounded flex items-center justify-center text-[10px] text-muted">no image</div>}
            <div className="text-xs font-semibold mt-1 truncate" title={c.card_name}>{c.card_name}</div>
            <div className="text-[10px] text-muted truncate">#{c.card_number}{c.rarity ? ` · ${c.rarity}` : ""}</div>
            <div className="text-[10px] text-muted">{c.copies} copies · {c.measured} measured</div>
            <div className="text-[10px]"><span className="text-green">PSA 10 {c.psa10}</span> · <span className="text-yellow">9 {c.psa9}</span>{c.cgc ? ` · CGC ${c.cgc}` : ""}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
