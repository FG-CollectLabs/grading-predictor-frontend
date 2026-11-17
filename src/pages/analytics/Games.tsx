import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import AICostPanel from "../../components/AICostPanel";
import InfraPanel from "../../components/InfraPanel";

// Analytics home: pick a game (PokeData /tcgs style).
export default function Games() {
  type Sum = { sets: number; copies: number; measured: number };
  const [sums, setSums] = useState<Record<string, Sum>>({});
  useEffect(() => {
    for (const g of ["pokemon", "riftbound"]) {
      api.getSets("", g).then((r) => setSums((m) => ({ ...m, [g]: {
        sets: r.sets.length,
        copies: r.sets.reduce((a, s) => a + s.copies, 0),
        measured: r.sets.reduce((a, s) => a + s.measured, 0),
      } }))).catch(() => undefined);
    }
  }, []);
  const line = (s?: Sum) => (s ? `${s.sets.toLocaleString()} sets · ${s.copies.toLocaleString()} copies · ${s.measured.toLocaleString()} measured` : "…");
  const tile = "bg-surface border border-border rounded-md p-5 flex flex-col gap-1";
  return (
    <div className="space-y-6">
      <AICostPanel compact />
      <InfraPanel compact />
      <h1 className="text-lg font-semibold">Analytics</h1>
      <p className="text-xs text-muted max-w-3xl">
        What the factory has measured, per game, set and card, and the grade odds a raw card's centering implies.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Link to="/games/pokemon" className={`${tile} hover:border-accent/60`}>
          <span className="text-base font-semibold">Pokémon</span>
          <span className="text-xs text-muted">{line(sums.pokemon)}</span>
        </Link>
        <Link to="/games/riftbound" className={`${tile} hover:border-accent/60`}>
          <span className="text-base font-semibold">Riftbound</span>
          <span className="text-xs text-muted">{line(sums.riftbound)}</span>
          <span className="text-[10px] text-muted">collected only: borderless cards need their own centering engine, so no odds yet</span>
        </Link>
        {["Magic: The Gathering", "One Piece"].map((g) => (
          <div key={g} className={`${tile} opacity-50`}>
            <span className="text-base font-semibold">{g}</span>
            <span className="text-xs text-muted">not tracked yet</span>
          </div>
        ))}
      </div>
    </div>
  );
}
