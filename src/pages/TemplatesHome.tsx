import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { CardCoverage, SetCoverage } from "../types";

// Templates, set by set: every card with photographed copies, which have a
// front template (active, in progress) and which still need one. Work a set
// at a time until every tracked card is measured.

const GAMES = [["pokemon", "Pokémon"], ["riftbound", "Riftbound"]] as const;
type Game = (typeof GAMES)[number][0];

function Bar({ active, progress, total }: { active: number; progress: number; total: number }) {
  const pct = (v: number) => `${total ? (100 * v) / total : 0}%`;
  return (
    <div className="h-1.5 w-full rounded bg-[#1c2128] overflow-hidden flex">
      <div className="bg-emerald-500" style={{ width: pct(active) }} />
      <div className="bg-amber-400" style={{ width: pct(progress) }} />
    </div>
  );
}

export function TemplatesNav() {
  const { pathname } = useLocation();
  const items = [
    ["/templates", "By set"],
    ["/templates/frame", "Borderless editor"],
    ["/templates/queue", "Review queue (learned)"],
  ] as const;
  return (
    <div className="flex flex-wrap gap-1 border-b border-border pb-2">
      {items.map(([to, l]) => {
        const on = to === "/templates" ? pathname === "/templates" || pathname.startsWith("/templates/set") : pathname.startsWith(to);
        return (
          <Link key={to} to={to} className={`rounded px-3 py-1 text-xs ${on ? "bg-accent text-bg font-semibold" : "text-muted hover:text-[#e6edf3]"}`}>{l}</Link>
        );
      })}
    </div>
  );
}

export default function TemplatesHome() {
  const [params, setParams] = useSearchParams();
  const game = ((params.get("game") as Game) || "pokemon");
  const [data, setData] = useState<{ total: SetCoverage; sets: SetCoverage[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [onlyTodo, setOnlyTodo] = useState(false);
  useEffect(() => {
    setData(null); setErr(null);
    api.templateCoverage(game).then(setData).catch((e) => setErr(String(e)));
  }, [game]);
  const sets = (data?.sets ?? []).filter((s) => !onlyTodo || s.active < s.cards);
  const t = data?.total;
  return (
    <div className="space-y-4">
      <TemplatesNav />
      <div className="flex flex-wrap items-center gap-2">
        {GAMES.map(([g, l]) => (
          <button key={g} onClick={() => setParams({ game: g })}
            className={`rounded px-3 py-1 text-xs ${game === g ? "bg-accent text-bg font-semibold" : "border border-border hover:text-accent"}`}>{l}</button>
        ))}
        <label className="ml-3 flex items-center gap-1 text-xs text-muted">
          <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />only sets with work left</label>
      </div>
      <p className="text-xs text-muted max-w-4xl">
        A card's template is how every copy of it gets measured: the engine aligns each photo to the card's design and reads
        the borders (or, for borderless cards, the frame) from it. Cards counted here have at least one photographed copy.
        Green: an active template. Amber: a draft or one being built. The rest still need one.
      </p>
      {err && <div className="text-red-400 text-xs break-all">{err}</div>}
      {t && (
        <div className="space-y-1 max-w-xl">
          <div className="text-sm"><span className="font-semibold">{t.active}</span> of {t.cards} cards have an active template
            <span className="text-muted"> ({t.cards ? Math.round((100 * t.active) / t.cards) : 0}%) · {t.in_progress} in progress · {t.cards - t.active - t.in_progress} to go
            · {t.copies_without_template} photographed copies waiting on a template</span></div>
          <Bar active={t.active} progress={t.in_progress} total={t.cards} />
        </div>
      )}
      {!data ? (!err && <div className="text-xs text-muted">loading…</div>) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {sets.map((s) => {
            const todo = s.cards - s.active - s.in_progress;
            return (
              <Link key={s.set_code} to={`/templates/set/${game}/${encodeURIComponent(s.set_code)}`}
                className="rounded border border-border p-3 hover:border-accent/60 space-y-2 block">
                <div className="flex items-center gap-2">
                  {s.logo ? <img src={s.logo} alt="" className="h-6 max-w-[80px] object-contain" loading="lazy" /> : null}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{s.set_name}</div>
                    <div className="text-[10px] text-muted">{s.set_code}{s.release_date ? ` · ${s.release_date.slice(0, 7)}` : ""}</div>
                  </div>
                  <div className={`ml-auto text-xs font-mono ${todo === 0 && s.in_progress === 0 ? "text-emerald-300" : ""}`}>{s.active}/{s.cards}</div>
                </div>
                <Bar active={s.active} progress={s.in_progress} total={s.cards} />
                <div className="text-[10px] text-muted">
                  {todo > 0 ? `${todo} to go` : "every card covered"}{s.in_progress ? ` · ${s.in_progress} in progress` : ""}
                  {s.frame ? ` · ${s.frame} frame` : ""} · {s.copies_without_template} copies waiting
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TemplatesSet() {
  const { game = "pokemon", code = "" } = useParams<{ game: string; code: string }>();
  const [cards, setCards] = useState<CardCoverage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"todo" | "progress" | "active" | "all">("todo");
  useEffect(() => {
    setCards(null);
    api.templateSetCoverage(game, code).then(setCards).catch((e) => setErr(String(e)));
  }, [game, code]);
  const bucket = (c: CardCoverage) => (!c.template_status ? "todo" : c.template_status === "active" ? "active" : "progress");
  const counts = { todo: 0, progress: 0, active: 0, all: 0 };
  for (const c of cards ?? []) { counts.all++; counts[bucket(c)]++; }
  const rows = (cards ?? []).filter((c) => filter === "all" || bucket(c) === filter);
  const borderless = game === "riftbound";
  return (
    <div className="space-y-3">
      <TemplatesNav />
      <div className="flex items-center gap-2 text-xs">
        <Link to={`/templates?game=${game}`} className="text-muted hover:text-accent">← all sets</Link>
        <span className="font-semibold">{code}</span>
        {cards && <span className="text-muted">{counts.active} of {counts.all} cards with an active template</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {([["todo", "Needs a template"], ["progress", "Draft / building"], ["active", "Active"], ["all", "All"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`rounded px-2 py-0.5 text-[11px] ${filter === k ? "bg-accent text-bg font-semibold" : "border border-border hover:text-accent"}`}>{l} ({counts[k]})</button>
        ))}
      </div>
      {err && <div className="text-red-400 text-xs break-all">{err}</div>}
      {!cards ? (!err && <div className="text-xs text-muted">loading…</div>) : (
        <table className="text-xs w-full max-w-5xl">
          <thead><tr className="text-muted text-left border-b border-border"><th></th><th>card</th><th>copies</th><th>template</th><th></th></tr></thead>
          <tbody>{rows.map((c) => {
            const st = c.template_status;
            const tone = st === "active" ? "text-emerald-300" : st === "failed" ? "text-red-400" : st ? "text-amber-300" : "text-muted";
            return (
              <tr key={c.card_id} className="border-b border-[#1c2128]">
                <td className="py-1">{c.image_url ? <img src={c.image_url} alt="" loading="lazy" className="w-8 h-11 object-contain" /> : null}</td>
                <td><Link to={`/cards/${c.card_id}`} className="hover:text-accent">{c.card_name}</Link>
                  <div className="text-[10px] text-muted">#{c.card_number}{c.rarity ? ` · ${c.rarity}` : ""}</div></td>
                <td className="font-mono">{c.copies}</td>
                <td className={`text-[11px] ${tone}`}>{st ?? "none"}{c.template_mode === "border" ? " (border)" : c.template_mode === "frame" ? " (frame)" : ""}
                  {c.profile_id ? <span className="text-muted"> · profile</span> : null}</td>
                <td>
                  {borderless || c.template_mode === "frame"
                    ? <Link to={`/templates/frame?card=${c.card_id}`} className="text-accent hover:underline">{st ? "open" : "set up"} →</Link>
                    : !st && c.review_copy_id
                      ? <Link to={`/copies/${c.review_copy_id}?queue=set-templates&game=${game}&set=${encodeURIComponent(code)}&station=front`}
                          className="text-accent hover:underline" title="review this card's front: once accepted or adjusted it becomes the card's template">review a front →</Link>
                      : !st ? <Link to={`/cards/${c.card_id}`} className="text-muted hover:text-accent" title="no engine front to review yet">open card →</Link> : null}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
      {!borderless && (
        <p className="text-[11px] text-muted max-w-4xl">
          Pokémon cards learn a border template from the first front you accept or adjust: "review a front" opens that card's
          best copy, and after you save it moves to the next card in this set that still needs one. Borderless Pokémon cards
          can use the borderless editor too.
        </p>
      )}
    </div>
  );
}
