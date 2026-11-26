import { useEffect, useState } from "react";
import { api } from "../api";
import type { BandAxis, BandTarget, CardBands, CenteringBand } from "../types";

// Per-card centering bands (GET /v1/centering/bands): green up to ok_max,
// amber up to noticed_max, red past it, from the narrowest group with enough
// graded copies (card, set + rarity, set, era, all). The market tracker
// colors copies with the same bands.

export const LEVEL: Record<CenteringBand["level"], string> = {
  card: "this card",
  set_rarity: "set + rarity",
  set: "set",
  era: "era",
  all: "all copies",
};
const TARGETS: [BandTarget, string][] = [["psa_10", "PSA 10"], ["cgc_10_or_better", "CGC 10 or better"], ["cgc_pristine", "CGC Pristine"]];
const AXES: [BandAxis, string][] = [["front_lr", "front L/R"], ["front_tb", "front T/B"], ["back_lr", "back L/R"], ["back_tb", "back T/B"]];

// fixed PSA bands for when the API has no answer (front 52.5 / 55, back 52.5 / 75)
const FALLBACK = (axis: BandAxis) => (axis.startsWith("front") ? [52.5, 55] : [52.5, 75]);

export function useCardBands(cardId: number | undefined): CardBands | null {
  const [bands, setBands] = useState<CardBands | null>(null);
  useEffect(() => {
    if (!cardId) return;
    let live = true;
    api.centeringBands([cardId])
      .then((r) => { if (live) setBands(r.cards[String(cardId)]?.bands ?? r.defaults); })
      .catch(() => { if (live) setBands({}); });
    return () => { live = false; };
  }, [cardId]);
  return bands;
}

const big = (left: number) => Math.max(left, 100 - left);
const split = (v: number) => `${v}/${100 - v}`;

/** text color for a left/top share on one axis */
export function bandTone(left: number | null | undefined, band: CenteringBand | undefined, axis: BandAxis): string {
  if (left == null) return "text-muted";
  const [ok, noticed] = band ? [band.ok_max, band.noticed_max] : FALLBACK(axis);
  const v = big(left);
  return v <= ok ? "text-emerald-300" : v <= noticed ? "text-amber-300" : "text-red-300";
}

export function bandTitle(band: CenteringBand | undefined, axis: BandAxis, what = "PSA 10"): string {
  if (!band) { const [ok, n] = FALLBACK(axis); return `${what}: green to ${split(ok)}, amber to ${split(n)} (fixed bands)`; }
  return `${what}: green to ${split(band.ok_max)}, amber to ${split(band.noticed_max)} · ${LEVEL[band.level]} bands, n=${band.n} (${band.n_top} at the top grade)`;
}

/** the card's bands per grader and axis (card page) */
export function CenteringBandsPanel({ cardId }: { cardId: number }) {
  const bands = useCardBands(cardId);
  if (!bands) return null;
  const any = TARGETS.some(([t]) => bands[t]);
  return (
    <div className="bg-surface border border-border rounded-md p-4 mb-4">
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-sm font-semibold">Centering bands</h2>
        <span className="text-[10px] text-muted">where graders start to notice (green to amber) and where the top grade gets rare (amber to red); same bands as the market tracker</span>
      </div>
      {!any ? <div className="text-xs text-muted">No bands yet: too few graded copies anywhere.</div> : (
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr className="text-muted text-left">
                <th className="pr-4 font-normal"></th>
                {AXES.map(([a, l]) => <th key={a} className="pr-4 font-normal">{l}</th>)}
                <th className="font-normal">from</th>
              </tr>
            </thead>
            <tbody>
              {TARGETS.map(([t, l]) => {
                const b = bands[t];
                if (!b) return null;
                const levels = [...new Set(AXES.map(([a]) => b[a]).map((x) => `${LEVEL[x.level]} (n=${x.n})`))];
                return (
                  <tr key={t} className="border-t border-[#1c2128]">
                    <td className="pr-4 py-1 text-muted whitespace-nowrap">{l}</td>
                    {AXES.map(([a]) => (
                      <td key={a} className="pr-4 font-mono whitespace-nowrap" title={b[a].label}>
                        <span className="text-emerald-300">{b[a].ok_max}</span>
                        <span className="text-muted"> · </span>
                        <span className="text-amber-300">{b[a].noticed_max}</span>
                      </td>
                    ))}
                    <td className="text-muted whitespace-nowrap" title={b.front_lr.label}>{levels.join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-[10px] text-muted mt-1">Bigger side of the split: 52.5 means 52.5/47.5. Green up to the first number, amber up to the second, red past it.</div>
        </div>
      )}
    </div>
  );
}
