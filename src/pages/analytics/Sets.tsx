import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api";
import type { SetSummary } from "../../types";

// Sets of a game (PokeData /sets style): language tabs, eras newest first.
const LANGS: [string, string][] = [["en", "English"], ["ja", "Japanese"], ["zh", "Chinese"]];

export default function Sets() {
  const [params, setParams] = useSearchParams();
  const lang = params.get("language") ?? "en";
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [langs, setLangs] = useState<Record<string, number>>({});
  const [eras, setEras] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSets(null);
    api.getSets(lang).then((r) => { setSets(r.sets); setLangs(r.languages); setEras(r.eras); }).catch((e: unknown) => setErr(String(e)));
  }, [lang]);

  const shown = (sets ?? []).filter((s) => !q || s.set_name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link to="/" className="hover:text-accent">Analytics</Link><span className="text-border">/</span><span className="text-[#e6edf3]">Pokémon</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold mr-2">Pokémon sets</h1>
        {LANGS.map(([k, label]) => (
          <button key={k} onClick={() => setParams({ language: k })}
            className={`px-3 py-1 text-xs rounded border ${lang === k ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:text-[#e6edf3]"}`}>
            {label}{langs[k] ? <span className="opacity-60"> · {langs[k].toLocaleString()}</span> : null}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search sets"
          className="ml-auto bg-bg border border-border rounded px-2 py-1 text-xs outline-none focus:border-accent w-56" />
      </div>
      {err && <div className="text-red-400 text-xs">{err}</div>}
      {!sets && !err && <div className="text-muted text-xs">Loading…</div>}
      {eras.map((era) => {
        const list = shown.filter((s) => s.era === era);
        if (!list.length) return null;
        return (
          <section key={era}>
            <h2 className="text-xs uppercase tracking-widest text-muted mb-2">{era}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {list.map((s) => (
                <Link key={s.set_code} to={`/sets/${encodeURIComponent(s.set_code)}?language=${s.language}`}
                  className="bg-surface border border-border rounded-md p-2 hover:border-accent/60 flex gap-2">
                  {s.image ? <img src={s.image} alt="" loading="lazy" className="w-12 h-16 object-contain bg-bg rounded" /> : <div className="w-12 h-16 bg-bg rounded" />}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate" title={s.set_name}>{s.set_name}</div>
                    <div className="text-[10px] text-muted">{s.release_date?.slice(0, 10) ?? "—"} · {s.cards} cards</div>
                    <div className="text-[10px] text-muted">{s.copies.toLocaleString()} copies · {s.measured.toLocaleString()} measured</div>
                    <div className="text-[10px]"><span className="text-green">PSA 10 {s.psa10}</span> · <span className="text-yellow">9 {s.psa9}</span></div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
