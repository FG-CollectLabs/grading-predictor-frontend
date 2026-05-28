import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Card } from "../types";

// Per-game display metadata
const GAME_META: Record<string, { label: string; accent: string; bg: string; icon: string }> = {
  pokemon:    { label: "Pokémon",              accent: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30", icon: "⚡" },
  magic:      { label: "Magic: The Gathering", accent: "text-purple-400", bg: "bg-purple-400/10 border-purple-400/30", icon: "✦" },
  "one piece": { label: "One Piece",           accent: "text-red-400",    bg: "bg-red-400/10 border-red-400/30",       icon: "☠" },
  lorcana:    { label: "Lorcana",              accent: "text-blue-400",   bg: "bg-blue-400/10 border-blue-400/30",     icon: "✦" },
  yugioh:     { label: "Yu-Gi-Oh!",            accent: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/30", icon: "★" },
};

function gameMeta(game: string) {
  return GAME_META[game.toLowerCase()] ?? {
    label: game,
    accent: "text-accent",
    bg: "bg-accent/10 border-accent/30",
    icon: "◈",
  };
}

function cardImageUrl(card: Card): string | null {
  if (card.image_url) return card.image_url;
  // Auto-derive for Pokemon via pokemontcg.io
  if (card.game.toLowerCase() === "pokemon") {
    const num = card.card_number.padStart(3, "0");
    return `https://images.pokemontcg.io/${card.set_code}/${num}.png`;
  }
  return null;
}

function setLogoUrl(game: string, setCode: string): string | null {
  if (game.toLowerCase() === "pokemon") {
    return `https://images.pokemontcg.io/${setCode}/logo.png`;
  }
  return null;
}

export default function CardList() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .listCards()
      .then((data) => setCards(data ?? []))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-muted py-12 text-center">Loading…</div>;
  if (error) return <div className="text-red-400 py-12 text-center">{error}</div>;

  // Derived aggregations
  const games = [...new Set(cards.map((c) => c.game))].sort();

  const setsForGame = selectedGame
    ? [...new Map(
        cards
          .filter((c) => c.game === selectedGame)
          .map((c) => [c.set_code, { set_code: c.set_code, set_name: c.set_name }])
      ).values()].sort((a, b) => a.set_name.localeCompare(b.set_name))
    : [];

  const cardsForSet = (selectedGame && selectedSet)
    ? cards.filter((c) => c.game === selectedGame && c.set_code === selectedSet)
    : [];

  const filteredCards = search
    ? cardsForSet.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.card_name.toLowerCase().includes(q) ||
          c.card_number.toLowerCase().includes(q)
        );
      })
    : cardsForSet;

  // ── Game grid ──────────────────────────────────────────────────────────────
  if (!selectedGame) {
    const gameCounts = Object.fromEntries(
      games.map((g) => [g, cards.filter((c) => c.game === g).length])
    );
    const gameCertCounts = Object.fromEntries(
      games.map((g) => [g, cards.filter((c) => c.game === g).reduce((s, c) => s + c.cert_count, 0)])
    );

    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm text-muted uppercase tracking-widest">Select a Game</h2>
          <Link
            to="/certs/new"
            className="bg-accent/10 border border-accent/30 text-accent rounded px-3 py-1.5 text-xs hover:bg-accent/20 transition-colors"
          >
            + New Cert
          </Link>
        </div>

        {games.length === 0 ? (
          <div className="text-muted text-center py-16">
            No cards yet — add a cert to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {games.map((game) => {
              const meta = gameMeta(game);
              const setCount = setsForGame.length;
              return (
                <button
                  key={game}
                  onClick={() => setSelectedGame(game)}
                  className={`text-left border rounded-lg p-5 hover:scale-[1.01] active:scale-100 transition-all ${meta.bg}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-3xl ${meta.accent}`}>{meta.icon}</span>
                    <div>
                      <div className={`font-semibold text-sm ${meta.accent}`}>{meta.label}</div>
                      <div className="text-muted text-xs">{game}</div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs text-muted">
                    <span>{gameCounts[game]} card{gameCounts[game] !== 1 ? "s" : ""}</span>
                    <span>{gameCertCounts[game]} cert{gameCertCounts[game] !== 1 ? "s" : ""}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Set grid ───────────────────────────────────────────────────────────────
  if (!selectedSet) {
    const meta = gameMeta(selectedGame);
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedGame(null)}
            className="text-muted hover:text-accent text-xs transition-colors"
          >
            ← Games
          </button>
          <span className="text-border">/</span>
          <span className={`text-sm font-semibold ${meta.accent}`}>{meta.label}</span>
          <Link
            to="/certs/new"
            className="ml-auto bg-accent/10 border border-accent/30 text-accent rounded px-3 py-1.5 text-xs hover:bg-accent/20 transition-colors"
          >
            + New Cert
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {setsForGame.map((set) => {
            const setCards = cards.filter((c) => c.game === selectedGame && c.set_code === set.set_code);
            const certCount = setCards.reduce((s, c) => s + c.cert_count, 0);
            const psa10 = setCards.reduce((s, c) => s + c.psa10_count, 0);
            const logoUrl = setLogoUrl(selectedGame, set.set_code);

            return (
              <button
                key={set.set_code}
                onClick={() => setSelectedSet(set.set_code)}
                className="text-left bg-surface border border-border rounded-md p-4 hover:border-accent transition-colors"
              >
                {logoUrl && (
                  <div className="h-10 mb-3 flex items-center">
                    <img
                      src={logoUrl}
                      alt={set.set_name}
                      className="max-h-10 max-w-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                )}
                <div className="font-semibold text-sm truncate">{set.set_name}</div>
                <div className="text-muted text-xs mt-0.5 mb-2">{set.set_code.toUpperCase()}</div>
                <div className="flex gap-3 text-xs text-muted">
                  <span>{setCards.length} card{setCards.length !== 1 ? "s" : ""}</span>
                  <span>{certCount} cert{certCount !== 1 ? "s" : ""}</span>
                  {psa10 > 0 && <span className="text-green">{psa10} PSA 10</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Card grid ──────────────────────────────────────────────────────────────
  const meta = gameMeta(selectedGame);
  const setName = setsForGame.find((s) => s.set_code === selectedSet)?.set_name ?? selectedSet;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button
          onClick={() => { setSelectedGame(null); setSelectedSet(null); }}
          className="text-muted hover:text-accent text-xs transition-colors"
        >
          ← Games
        </button>
        <span className="text-border">/</span>
        <button
          onClick={() => setSelectedSet(null)}
          className={`text-xs ${meta.accent} hover:opacity-80 transition-opacity`}
        >
          {meta.label}
        </button>
        <span className="text-border">/</span>
        <span className="text-xs text-[#e6edf3]">{setName}</span>
        <div className="ml-auto flex gap-2">
          <input
            type="text"
            placeholder="Search cards…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-surface border border-border rounded px-3 py-1.5 text-sm text-[#e6edf3] placeholder-muted outline-none focus:border-accent w-48"
          />
          <Link
            to="/certs/new"
            className="bg-accent/10 border border-accent/30 text-accent rounded px-3 py-1.5 text-xs hover:bg-accent/20 transition-colors whitespace-nowrap"
          >
            + New Cert
          </Link>
        </div>
      </div>

      {filteredCards.length === 0 ? (
        <div className="text-muted text-center py-16">
          {cardsForSet.length === 0
            ? "No cards in this set yet — add a cert to get started."
            : "No cards match the search."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredCards.map((card) => (
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
  const imgUrl = cardImageUrl(card);
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <Link
      to={`/cards/${card.id}`}
      className="block bg-surface border border-border rounded-md overflow-hidden hover:border-accent transition-colors"
    >
      {imgUrl && !imgFailed ? (
        <div className="h-36 bg-bg flex items-center justify-center overflow-hidden">
          <img
            src={imgUrl}
            alt={card.card_name}
            className="h-full w-full object-contain p-2"
            onError={() => setImgFailed(true)}
          />
        </div>
      ) : (
        <div className="h-20 bg-bg flex items-center justify-center">
          <span className="text-3xl text-border">◈</span>
        </div>
      )}

      <div className="p-3">
        <div className="font-semibold text-sm truncate">{card.card_name}</div>
        <div className="text-muted text-xs mb-2">#{card.card_number}</div>

        <div className="flex gap-2 text-xs mb-2">
          <GradeBadge grade={10} count={card.psa10_count} />
          <GradeBadge grade={9} count={card.psa9_count} />
          <span className="text-muted ml-auto">{total} cert{total !== 1 ? "s" : ""}</span>
        </div>

        {pct10 !== null && (
          <div>
            <div className="flex justify-between text-[10px] text-muted mb-0.5">
              <span>PSA 10 rate</span>
              <span>{pct10}%</span>
            </div>
            <div className="h-1 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-green rounded-full" style={{ width: `${pct10}%` }} />
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

function GradeBadge({ grade, count }: { grade: number; count: number }) {
  const color = grade === 10 ? "text-green bg-green/10 border-green/30" : "text-yellow bg-yellow/10 border-yellow/30";
  return (
    <span className={`border rounded px-1.5 py-0.5 font-semibold text-[10px] ${color}`}>
      {grade === 10 ? "10" : "9"}: {count}
    </span>
  );
}
