import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { AIUsageRow, AIUsageSummary } from "../types";

// AI operating cost: what our Claude usage would cost at API list prices,
// against what we pay (the subscriptions). Data: tools/ai_usage_collect.py on
// each agent machine (token counts from Claude Code sessions, no content).
//
// compact: stat tiles only (home page). Full: + daily chart by workspace and
// tables by workspace / model (Developer tab).

// Categorical slots (reference palette, dark steps), fixed order by workspace;
// validated on the #161b22 surface (all checks pass, adjacent CVD >= 8.4).
const SLOTS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];
const WORKSPACE_ORDER = ["fg-collectlabs", "fg-liquidator", "fg-cookbook", "fg-investmentlabs", "fg-options"];
const OTHER = "#6e7681";

const usd = (v: number, d = 2) => `$${v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const tok = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(v));

function colorOf(ws: string): string {
  const i = WORKSPACE_ORDER.indexOf(ws);
  return i >= 0 ? SLOTS[i] : OTHER;
}
function seriesOf(ws: string): string {
  return WORKSPACE_ORDER.includes(ws) ? ws : "other";
}

export default function AICostPanel({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<AIUsageSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.getAIUsage(45).then(setData).catch((e: unknown) => setErr(String(e)));
  }, []);

  if (err) return compact ? null : <div className="text-xs text-red-400">{err}</div>;
  if (!data) return null;

  const paidToDate = (data.subscription_usd_monthly * data.day_of_month) / data.days_in_month;
  const multiple = paidToDate > 0 ? data.month_to_date_api_usd / paidToDate : null;
  const updated = data.last_updated ? new Date(data.last_updated).toLocaleString() : "never";

  return (
    <div className="bg-surface border border-border rounded-md p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <div className="text-sm font-semibold">AI operating cost</div>
        <div className="text-[10px] text-muted">Claude usage across all FG workspaces · updated {updated}</div>
      </div>
      {data.rows.length === 0 ? (
        <div className="text-xs text-muted">No usage uploaded yet. Run tools/ai_usage_collect.py on the agent machines.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile value={usd(data.month_to_date_api_usd)} label={`API-equivalent, ${monthName(data.month_start)} to date`} />
            <Tile value={usd(paidToDate)} label={`actually paid to date (${usd(data.subscription_usd_monthly, 0)}/mo subscriptions)`} />
            <Tile value={multiple == null ? "—" : `${multiple.toFixed(0)}×`} label="API value per subscription dollar" />
            <Tile value={usd(data.last_30_days_api_usd)} label="API-equivalent, last 30 days" />
          </div>
          <div className="text-[10px] text-muted mt-2">
            API-equivalent = the same tokens at Anthropic API list prices. A plan's exact token allowance isn't published, so
            "share of allowance used" can't be measured; the multiple shows how much API spend the subscriptions are covering.
          </div>
          {!compact && <Details rows={data.rows} />}
        </>
      )}
    </div>
  );
}

function monthName(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleString(undefined, { month: "short", timeZone: "UTC" });
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-bg border border-border rounded px-3 py-2">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[10px] text-muted leading-tight">{label}</div>
    </div>
  );
}

// ── daily chart + tables ─────────────────────────────────────────────────────

function Details({ rows }: { rows: AIUsageRow[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const { days, series, byDay, max } = useMemo(() => {
    const dayList: string[] = [];
    const last = new Date();
    for (let i = 44; i >= 0; i--) {
      const d = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() - i));
      dayList.push(d.toISOString().slice(0, 10));
    }
    const present = new Set(rows.map((r) => seriesOf(r.workspace)));
    const ser = [...WORKSPACE_ORDER.filter((w) => present.has(w)), ...(present.has("other") ? ["other"] : [])];
    const m = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const e = m.get(r.day) ?? {};
      const s = seriesOf(r.workspace);
      e[s] = (e[s] ?? 0) + r.api_cost_usd;
      m.set(r.day, e);
    }
    const mx = Math.max(1, ...dayList.map((d) => Object.values(m.get(d) ?? {}).reduce((a, b) => a + b, 0)));
    return { days: dayList, series: ser, byDay: m, max: mx };
  }, [rows]);

  // chart geometry
  const W = 900;
  const H = 180;
  const padL = 44;
  const padB = 18;
  const plotW = W - padL - 4;
  const plotH = H - padB - 6;
  const slot = plotW / days.length;
  const barW = Math.max(4, slot - 4);
  const niceMax = niceCeil(max);
  const y = (v: number) => 6 + plotH - (v / niceMax) * plotH;
  const ticks = [0, niceMax / 2, niceMax];

  const totals = (key: (r: AIUsageRow) => string) => {
    const m = new Map<string, { req: number; inTok: number; out: number; cw: number; cr: number; cost: number }>();
    const cutoff = days[days.length - 30];
    for (const r of rows) {
      if (r.day < cutoff) continue;
      const k = key(r);
      const e = m.get(k) ?? { req: 0, inTok: 0, out: 0, cw: 0, cr: 0, cost: 0 };
      e.req += r.requests;
      e.inTok += r.input_tokens;
      e.out += r.output_tokens;
      e.cw += r.cache_write_5m + r.cache_write_1h;
      e.cr += r.cache_read;
      e.cost += r.api_cost_usd;
      m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => b[1].cost - a[1].cost);
  };

  const hd = hover != null ? days[hover] : null;
  const he = hd ? byDay.get(hd) ?? {} : null;

  return (
    <div className="mt-4 space-y-4">
      <div>
        <div className="text-xs font-semibold mb-1">Daily API-equivalent cost by workspace (last 45 days)</div>
        <div className="flex flex-wrap gap-3 mb-1" aria-label="legend">
          {series.map((s) => (
            <span key={s} className="flex items-center gap-1 text-[10px] text-muted">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s === "other" ? OTHER : colorOf(s) }} />
              {s}
            </span>
          ))}
        </div>
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="daily cost stacked by workspace"
            onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} stroke="#30363d" strokeWidth={t === 0 ? 1 : 0.5} />
                <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#8b949e">{usd(t, 0)}</text>
              </g>
            ))}
            {days.map((d, i) => {
              const e = byDay.get(d) ?? {};
              const x = padL + i * slot + (slot - barW) / 2;
              let acc = 0;
              const segs = series.filter((s) => (e[s] ?? 0) > 0);
              return (
                <g key={d} onMouseEnter={() => setHover(i)}>
                  <rect x={padL + i * slot} y={6} width={slot} height={plotH} fill="transparent" />
                  {segs.map((s, j) => {
                    const v = e[s];
                    const y1 = y(acc + v);
                    const y0 = y(acc);
                    acc += v;
                    const h = Math.max(0, y0 - y1 - (j < segs.length - 1 ? 2 : 0)); // 2px gap between segments
                    const top = j === segs.length - 1;
                    return (
                      <path key={s} d={barPath(x, y1, barW, h, top ? Math.min(4, barW / 2, h) : 0)}
                        fill={s === "other" ? OTHER : colorOf(s)} opacity={hover == null || hover === i ? 1 : 0.55} />
                    );
                  })}
                  {(i % 7 === 0 || i === days.length - 1) && (
                    <text x={padL + i * slot + slot / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="#8b949e">{d.slice(5)}</text>
                  )}
                </g>
              );
            })}
          </svg>
          {hd && he && (
            <div className="absolute top-0 right-0 bg-bg border border-border rounded px-2 py-1 text-[10px] pointer-events-none">
              <div className="font-semibold text-[#e6edf3]">{hd} · {usd(Object.values(he).reduce((a, b) => a + b, 0))}</div>
              {series.filter((s) => he[s]).map((s) => (
                <div key={s} className="flex items-center gap-1 text-muted">
                  <span className="inline-block w-2 h-2 rounded-sm" style={{ background: s === "other" ? OTHER : colorOf(s) }} />
                  {s} {usd(he[s])}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UsageTable title="By workspace (last 30 days)" rows={totals((r) => r.workspace)} />
        <UsageTable title="By model (last 30 days)" rows={totals((r) => r.model)} />
      </div>
      <UsageTable title="By machine / subscription (last 30 days)" rows={totals((r) => `${r.machine}${r.account ? ` · ${r.account}` : ""}`)} />
    </div>
  );
}

function UsageTable({ title, rows }: { title: string; rows: [string, { req: number; inTok: number; out: number; cw: number; cr: number; cost: number }][] }) {
  return (
    <div>
      <div className="text-xs font-semibold mb-1">{title}</div>
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="text-muted text-left border-b border-border">
            <th className="py-1 pr-2 font-normal"></th>
            <th className="pr-2 font-normal text-right">requests</th>
            <th className="pr-2 font-normal text-right">input</th>
            <th className="pr-2 font-normal text-right">output</th>
            <th className="pr-2 font-normal text-right">cache write</th>
            <th className="pr-2 font-normal text-right">cache read</th>
            <th className="font-normal text-right">API cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-[#1c2128]">
              <td className="py-1 pr-2">{k}</td>
              <td className="pr-2 text-right font-mono">{v.req.toLocaleString()}</td>
              <td className="pr-2 text-right font-mono">{tok(v.inTok)}</td>
              <td className="pr-2 text-right font-mono">{tok(v.out)}</td>
              <td className="pr-2 text-right font-mono">{tok(v.cw)}</td>
              <td className="pr-2 text-right font-mono">{tok(v.cr)}</td>
              <td className="text-right font-mono">{usd(v.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function niceCeil(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Bar with only the top corners rounded (r), anchored square to the baseline. */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return "";
  if (r <= 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
