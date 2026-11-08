import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

// Listing photos vs in-hand scans (backend remeasure.go): every copy bought
// from listing photos and scanned flat once in hand is one measurement of how
// far that photo source is off. A source's error spreads its listing copies'
// odds once it has min_pairs pairs.

interface ErrStat { n: number; bias: number; mae: number; rmse: number }
interface Group { source: string; pairs: number; axes: Record<string, ErrStat>; corners: ErrStat | null }
interface Recent { scan_copy_id: number; listing_copy_id: number; source: string; error_pp: Record<string, number>; at: string }
interface Resp { groups: Group[]; recent: Recent[] | null; min_pairs: number; notes: string[] }

const AXES: [string, string][] = [["front_lr", "front L/R"], ["front_tb", "front T/B"], ["back_lr", "back L/R"], ["back_tb", "back T/B"]];
const sign = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;

export default function PhotoError() {
  const [d, setD] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.getPhotoError().then(setD).catch((e: unknown) => setErr(String(e))); }, []);
  return (
    <section className="space-y-4 max-w-6xl">
      <div>
        <div className="text-xs text-muted"><Link to="/grader-analytics" className="hover:text-accent">grader analytics</Link> / listing photos</div>
        <h1 className="text-base font-semibold mt-1">How far off are listing photos?</h1>
        <p className="text-xs text-muted mt-1 max-w-3xl">
          Copies bought from listing photos, measured again from the in-hand scan (admin app). Error is listing minus scan, in points
          off 50/50: positive means the listing made the copy look more off-center than it is. Once a source has {d?.min_pairs ?? 10} pairs,
          its RMSE spreads the odds of that source's listing copies (else its site's, else all sources').
        </p>
      </div>
      {err && <div className="text-xs text-red-400">{err}</div>}
      {!d ? <div className="text-xs text-muted">loading…</div> : d.groups.length === 0 ? (
        <div className="text-xs text-muted">No listing copy has been re-measured in hand yet.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead className="text-muted text-[10px]">
                <tr>
                  <th className="text-left py-1">source</th><th className="text-right">pairs</th>
                  {AXES.map(([k, l]) => <th key={k} className="text-right px-2" title="bias · RMSE">{l}</th>)}
                  <th className="text-right px-2" title="worst-corner off-round, mm: bias · RMSE">corners mm</th>
                  <th className="text-left px-2">odds</th>
                </tr>
              </thead>
              <tbody>
                {d.groups.map((g) => (
                  <tr key={g.source} className="border-t border-border">
                    <td className="py-1 font-semibold">{g.source}</td>
                    <td className="text-right font-mono">{g.pairs}</td>
                    {AXES.map(([k]) => {
                      const a = g.axes[k];
                      return (
                        <td key={k} className="text-right font-mono px-2">
                          <span className={Math.abs(a.bias) >= 1 ? "text-yellow" : "text-muted"}>{sign(a.bias)}</span> · {a.rmse.toFixed(1)}
                        </td>
                      );
                    })}
                    <td className="text-right font-mono px-2">{g.corners ? `${g.corners.bias > 0 ? "+" : ""}${g.corners.bias.toFixed(2)} · ${g.corners.rmse.toFixed(2)}` : "–"}</td>
                    <td className="px-2 text-[10px]">{g.pairs >= d.min_pairs ? <span className="text-accent">spread by its error</span> : <span className="text-muted">{d.min_pairs - g.pairs} more to apply</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!!d.recent?.length && (
            <div className="space-y-1">
              <div className="text-xs font-semibold">Latest pairs</div>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <tbody>
                    {d.recent.map((p) => (
                      <tr key={p.scan_copy_id} className="border-t border-border">
                        <td className="py-1 text-muted">{new Date(p.at).toLocaleDateString()}</td>
                        <td><Link to={`/copies/${p.listing_copy_id}`} className="hover:text-accent">listing #{p.listing_copy_id}</Link></td>
                        <td><Link to={`/copies/${p.scan_copy_id}`} className="hover:text-accent">scan #{p.scan_copy_id}</Link></td>
                        <td className="text-muted">{p.source}</td>
                        {AXES.map(([k, l]) => (
                          <td key={k} className={`font-mono text-right px-2 ${Math.abs(p.error_pp[k]) >= 3 ? "text-yellow" : ""}`} title={l}>{sign(p.error_pp[k])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <ul className="text-[10px] text-muted list-disc pl-4">{d.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </>
      )}
    </section>
  );
}
