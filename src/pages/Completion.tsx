import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { CardCompletion, CompletionResp, GroupCompletion, NextStep, SetCompletion } from "../types";

// Dataset completion: how close each set and card is to the dataset's
// targets (per card + grader + grade: 40 usable copies, 100 for PSA 10 / 9
// of valuable cards), and what to do next.

const pct = (v: number) => `${Math.round(v * 100)}%`;
const KIND: Record<NextStep["kind"], [string, string]> = {
  review: ["Review", "text-green border-green/50"],
  almost: ["Nearly complete", "text-accent border-accent/50"],
  supply: ["Short on listings", "text-yellow border-yellow/50"],
  pipeline: ["Backlog", "text-purple border-purple/50"],
};

function Bar({ v, sub, className = "h-2" }: { v: number; sub?: number; className?: string }) {
  return (
    <div className={`w-full bg-bg rounded overflow-hidden relative ${className}`}>
      <div className="absolute inset-y-0 left-0 bg-accent/80" style={{ width: `${Math.min(100, v * 100)}%` }} />
      {sub != null && <div className="absolute inset-y-0 left-0 bg-green" style={{ width: `${Math.min(100, sub * 100)}%` }} />}
    </div>
  );
}

export default function Completion() {
  const [params, setParams] = useSearchParams();
  const game = params.get("game") ?? "pokemon";
  const set = params.get("set") ?? "";
  const [d, setD] = useState<CompletionResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setD(null);
    setErr(null);
    api.getCompletion(game, set).then(setD).catch((e) => setErr(String(e.message ?? e)));
  }, [game, set]);
  const go = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); if (k === "game") p.delete("set"); setParams(p); };
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="text-xs text-muted">
          <Link to="/grader-analytics" className="hover:text-accent">grader analytics</Link> / {set
            ? <><button className="hover:text-accent" onClick={() => go("set", "")}>completion</button> / {d?.set?.set_name ?? set}</> : "completion"}
        </div>
        <h1 className="text-lg font-semibold mt-1">{set ? `${d?.set?.set_name ?? set}: dataset completion` : "Dataset completion"}</h1>
        <p className="text-xs text-muted mt-1 max-w-3xl">
          Each card + grader + grade we collect aims for {d?.targets.base ?? 40} usable measured copies ({d?.targets.top ?? 100} for PSA 10 / 9 of cards
          worth ${d?.targets.top_min_raw_usd ?? 50}+ raw). Blue: measured; green: of those, centering checked by a person. Waiting: copies still in photo
          triage or the centering queue. A grade short of its target with nothing waiting is limited by listings.
        </p>
        <div className="flex gap-1 mt-2 text-xs">
          {[["pokemon", "Pokémon"], ["riftbound", "Riftbound"]].map(([g, l]) => (
            <button key={g} onClick={() => go("game", g)}
              className={`px-2 py-0.5 rounded border ${game === g ? "border-accent text-accent" : "border-border text-muted"}`}>{l}</button>
          ))}
        </div>
      </div>
      {err && <div className="text-red-400 text-xs">{err}</div>}
      {!d && !err && <div className="text-muted text-xs">working it out…</div>}
      {d && <NextSteps steps={d.next ?? []} />}
      {d && !set && d.sets && <SetGrid sets={d.sets} onPick={(c) => go("set", c)} />}
      {d && set && d.cards && <CardTable cards={d.cards} />}
    </div>
  );
}

function NextSteps({ steps }: { steps: NextStep[] }) {
  if (!steps.length) return <section className="text-xs text-muted">Nothing pressing: every group is complete, waiting in the pipeline, or limited by listings.</section>;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">What to do next</h2>
      <div className="grid gap-2 md:grid-cols-2">
        {steps.map((s, i) => (
          <Link key={i} to={s.link} className="block bg-surface border border-border rounded-md p-3 hover:border-accent/60 text-xs">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] border rounded px-1.5 py-0.5 ${KIND[s.kind][1]}`}>{KIND[s.kind][0]}</span>
              <span className="font-semibold">{s.title}</span>
            </div>
            <div className="text-muted mt-1 leading-relaxed">{s.detail}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SetGrid({ sets, onPick }: { sets: SetCompletion[]; onPick: (code: string) => void }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Sets</h2>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {sets.map((s) => (
          <button key={s.set_code} onClick={() => onPick(s.set_code)}
            className="text-left bg-surface border border-border rounded-md p-3 hover:border-accent/60 text-xs space-y-1.5">
            <div className="flex items-center gap-2">
              {s.logo ? <img src={s.logo} alt="" className="w-14 h-9 object-contain" loading="lazy" />
                : s.image ? <img src={s.image} alt="" className="w-7 h-9 object-contain" loading="lazy" /> : null}
              <div className="min-w-0">
                <div className="font-semibold truncate">{s.set_name}</div>
                <div className="text-muted">{s.release_date?.slice(0, 10) ?? "—"} · {s.cards} cards</div>
              </div>
              <span className="ml-auto text-sm font-semibold">{pct(s.completion)}</span>
            </div>
            <Bar v={s.completion} sub={s.measured ? (s.reviewed / s.measured) * s.completion : 0} />
            <div className="text-muted">{s.complete_groups} / {s.groups} grades complete · {s.measured.toLocaleString()} measured · {s.reviewed.toLocaleString()} reviewed
              {s.waiting ? ` · ${s.waiting.toLocaleString()} waiting` : ""}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

type Sort = "completion_desc" | "completion_asc" | "value" | "number";

function CardTable({ cards }: { cards: CardCompletion[] }) {
  const [sort, setSort] = useState<Sort>("value");
  const [onlyKey, setOnlyKey] = useState("");
  const keys = cards[0]?.groups.map((g) => [g.key, g.label]) ?? [];
  const shown = [...cards].sort((a, b) =>
    sort === "completion_desc" ? b.completion - a.completion
      : sort === "completion_asc" ? a.completion - b.completion
        : sort === "number" ? a.number.localeCompare(b.number, undefined, { numeric: true })
          : (b.raw_usd ?? 0) - (a.raw_usd ?? 0));
  const cols = onlyKey ? keys.filter(([k]) => k === onlyKey) : keys;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <h2 className="text-sm font-semibold">Cards</h2>
        <label className="text-muted">grade{" "}
          <select value={onlyKey} onChange={(e) => setOnlyKey(e.target.value)} className="bg-surface border border-border rounded px-1">
            <option value="">all collected grades</option>
            {keys.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="text-muted ml-auto">sort{" "}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-surface border border-border rounded px-1">
            <option value="value">raw value</option><option value="completion_desc">most complete</option>
            <option value="completion_asc">least complete</option><option value="number">card number</option>
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs w-full">
          <thead className="text-muted text-left">
            <tr><th className="py-1 pr-2">card</th><th className="pr-2 text-right">raw</th><th className="pr-3 w-28">overall</th>
              {cols.map(([k, l]) => <th key={k} className="pr-2 font-normal whitespace-nowrap">{l}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.card_id} className="border-t border-border align-top">
                <td className="py-1.5 pr-2">
                  <Link to={`/grader-analytics?card_id=${c.card_id}`} className="hover:text-accent flex items-center gap-2">
                    {c.image && <img src={c.image} alt="" className="w-6 h-8 object-contain" loading="lazy" />}
                    <span>{c.name} <span className="text-muted">{c.number}</span>{c.rarity && <div className="text-[10px] text-muted">{c.rarity}</div>}</span>
                  </Link>
                </td>
                <td className="pr-2 text-right text-muted">{c.raw_usd != null ? `$${Math.round(c.raw_usd)}` : "–"}</td>
                <td className="pr-3"><div className="font-semibold">{pct(c.completion)}</div><Bar v={c.completion} /></td>
                {cols.map(([k]) => <GroupCell key={k} g={c.groups.find((g) => g.key === k)} cardId={c.card_id} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GroupCell({ g, cardId }: { g?: GroupCompletion; cardId: number }) {
  if (!g) return <td />;
  const done = g.measured >= g.target;
  const [grader, grade] = g.label.split(" ");
  return (
    <td className="pr-2 min-w-[86px]">
      <Link to={`/copies?card_id=${cardId}&grader=${grader}&grade=${grade}`} className="block hover:opacity-80"
        title={`${g.label}: ${g.measured} measured of ${g.target} (${g.reviewed} reviewed, ${g.waiting} waiting, ${g.total} seen)`}>
        <div className={done ? "text-green" : g.measured === 0 ? "text-border" : ""}>
          {g.measured}/{g.target}{g.waiting ? <span className="text-muted"> +{g.waiting}</span> : null}
        </div>
        <Bar v={g.measured / g.target} sub={g.reviewed / g.target} className="h-1.5" />
      </Link>
    </td>
  );
}
