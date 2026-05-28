import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Card } from "../types";

export default function CardList() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [gameFilter, setGameFilter] = useState("");

  useEffect(() => {
    api
      .listCards()
      .then((data) => setCards(data ?? []))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const games = [...new Set(cards.map((c) => c.game))].sort();

  const filtered = cards.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      c.card_name.toLowerCase().includes(q) ||
      c.set_name.toLowerCase().includes(q) ||
      c.card_number.toLowerCase().includes(q);
    const matchGame = !gameFilter || c.game === gameFilter;
    return matchSearch && matchGame;
  });

  if (loading) return <div className="text-muted py-12 text-center">Loading…</div>;
  if (error) return <div className="text-red-400 py-12 text-center">{error}</div>;

  return (
    <div>
      <div className="flex gap-3 mb-6 flex-wrap">
        <input
          type="text"
          placeholder="Search card name, set…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-surface border border-border rounded px-3 py-1.5 text-sm text-[#e6edf3] placeholder-muted outline-none focus:border-accent flex-1 min-w-48"
        />
        <select
          value={gameFilter}
          onChange={(e) => setGameFilter(e.target.value)}
          className="bg-surface border border-border rounded px-3 py-1.5 text-sm text-[#e6edf3] outline-none focus:border-accent"
        >
          <option value="">All games</option>
          {games.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <Link
          to="/certs/new"
          className="bg-accent/10 border border-accent/30 text-accent rounded px-3 py-1.5 text-sm hover:bg-accent/20 transition-colors"
        >
          + New Cert
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="text-muted text-center py-16">
          {cards.length === 0
            ? "No cards yet — add a cert to get started."
            : "No cards match the search."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((card) => (
            <CardCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardCard({ card }: { card: Card }) {
  const total = card.cert_count;
  const pct10 = total > 0 ? Math.round((card.psa10_count / total) * 100) : null;

  return (
    <Link
      to={`/cards/${card.id}`}
      className="block bg-surface border border-border rounded-md p-4 hover:border-accent transition-colors"
    >
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{card.card_name}</div>
          <div className="text-muted text-xs truncate">
            {card.set_name} · #{card.card_number}
          </div>
        </div>
        <GameBadge game={card.game} />
      </div>

      <div className="flex gap-3 mt-3 text-xs">
        <GradeBadge grade={10} count={card.psa10_count} />
        <GradeBadge grade={9} count={card.psa9_count} />
        <span className="text-muted ml-auto">{total} cert{total !== 1 ? "s" : ""}</span>
      </div>

      {pct10 !== null && (
        <div className="mt-2">
          <div className="flex justify-between text-xs text-muted mb-1">
            <span>PSA 10 rate</span>
            <span>{pct10}%</span>
          </div>
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-green rounded-full transition-all"
              style={{ width: `${pct10}%` }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}

function GradeBadge({ grade, count }: { grade: number; count: number }) {
  const color = grade === 10 ? "text-green bg-green/10 border-green/30" : "text-yellow bg-yellow/10 border-yellow/30";
  return (
    <span className={`border rounded px-1.5 py-0.5 font-semibold ${color}`}>
      PSA {grade}: {count}
    </span>
  );
}

function GameBadge({ game }: { game: string }) {
  return (
    <span className="text-[10px] text-muted bg-bg border border-border rounded px-1.5 py-0.5 whitespace-nowrap flex-shrink-0">
      {game}
    </span>
  );
}
