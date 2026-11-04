import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import AICostPanel from "../../components/AICostPanel";

// Analytics home: pick a game (PokeData /tcgs style).
export default function Games() {
  const [pokemon, setPokemon] = useState<{ sets: number; copies: number; measured: number } | null>(null);
  useEffect(() => {
    api.getSets("").then((r) => setPokemon({
      sets: r.sets.length,
      copies: r.sets.reduce((a, s) => a + s.copies, 0),
      measured: r.sets.reduce((a, s) => a + s.measured, 0),
    })).catch(() => undefined);
  }, []);
  const tile = "bg-surface border border-border rounded-md p-5 flex flex-col gap-1";
  return (
    <div className="space-y-6">
      <AICostPanel compact />
      <h1 className="text-lg font-semibold">Analytics</h1>
      <p className="text-xs text-muted max-w-3xl">
        What the factory has measured, per game, set and card, and the grade odds a raw card's centering implies.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Link to="/games/pokemon" className={`${tile} hover:border-accent/60`}>
          <span className="text-base font-semibold">Pokémon</span>
          <span className="text-xs text-muted">
            {pokemon ? `${pokemon.sets.toLocaleString()} sets · ${pokemon.copies.toLocaleString()} copies · ${pokemon.measured.toLocaleString()} measured` : "…"}
          </span>
        </Link>
        {["Magic: The Gathering", "One Piece", "Riftbound"].map((g) => (
          <div key={g} className={`${tile} opacity-50`}>
            <span className="text-base font-semibold">{g}</span>
            <span className="text-xs text-muted">not tracked yet</span>
          </div>
        ))}
      </div>
    </div>
  );
}
