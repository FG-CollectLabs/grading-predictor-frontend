import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { FactoryStats, IngestStatus } from "../types";

// The pre-grading factory: how a graded copy moves from a marketplace listing
// to a centering measurement, with live counts per stage, links into each
// stage's review queue, and the feedback the engine gets tuned against.

const n = (v: number | undefined | null) => (v ?? 0).toLocaleString();
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");

export default function Factory() {
  const [stats, setStats] = useState<FactoryStats | null>(null);
  const [status, setStatus] = useState<IngestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      Promise.all([api.getFactory(), api.getIngestStatus()])
        .then(([f, s]) => { setStats(f); setStatus(s); setError(null); })
        .catch((e: unknown) => setError(String(e)));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (error) return <div className="text-red-400 py-12 text-center">{error}</div>;
  if (!stats || !status) return <div className="text-muted py-12 text-center">Loading…</div>;

  const tri = stats.triage.status;
  const triTotal = Object.values(tri).reduce((a, b) => a + b, 0);
  const cen = stats.centering.current;
  const cenTotal = Object.values(cen).reduce((a, b) => a + b, 0);
  const version = stats.centering.versions?.[0];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold">Pre-grading factory</h1>
          <Link to="/factory/history" className="text-xs text-accent hover:underline">my review history →</Link>
        </div>
        <p className="text-muted text-xs mt-1 max-w-3xl">
          Every graded copy the market tracker finds on eBay or Fanatics goes down this line. Each stage runs
          automatically, stores its result next to the photo, and flags what it isn't sure about for review.
          A person's correction never overwrites the machine's answer: it's saved alongside it, which is what the next
          engine version is tuned against.
        </p>
      </div>

      {/* ── the line ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-stretch">
        <Stage
          step="0" title="Catalog" subtitle="cards synced from the market tracker"
          rows={[["cards", n(status.cards_synced)], ["last sync", status.catalog_synced_at?.slice(0, 16).replace("T", " ") ?? "—"]]}
          how="Every tracked card (game, set, number, language, release date, catalog image)."
        />
        <Stage
          step="1" title="Listings" subtitle="graded copies from eBay + Fanatics"
          rows={[
            ["copies", n(stats.listings.copies)],
            ...Object.entries(stats.listings.by_source).map(([k, v]) => [k, n(v)] as [string, string]),
            ["with cert #", `${n(stats.listings.with_cert)} (${pct(stats.listings.with_cert, stats.listings.copies)})`],
          ]}
          how="The tracker's graded-copy feed: listing title, grader + grade, cert # when the listing has it, every photo URL."
          links={[["all copies", "/copies"]]}
        />
        <Stage
          step="2" title="Photo triage" subtitle="front, back and cert"
          health={status.triage_paused}
          rows={[
            ["done", `${n(tri.done)} (${pct(tri.done ?? 0, triTotal)})`],
            ["queued", n(tri.pending)],
            ["needs AI / failed", `${n(tri.needs_ai)} / ${n(tri.failed)}`],
            ["front + back stored", n(stats.triage.both_photos)],
            ["reviewed by you", n(Object.values(stats.triage.reviewed).reduce((a, b) => a + b, 0))],
          ]}
          how="Matches each listing photo against the card's catalog image and a card back (SIFT features), picks the best front and back, reads the cert from the slab's QR code or barcode. Fanatics: photo 1 = front, 2 = back. No AI."
          links={[[`review queue (${n(stats.triage.needs_review)})`, "/copies?review=needed"], ["spot-check done", "/copies?review=unreviewed&photos=both"]]}
        />
        <Stage
          step="3" title="Centering" subtitle={version ? `engine v${version}` : "engine"}
          health={status.centering_paused}
          rows={[
            ["photos measured", n(cenTotal)],
            ["to check", n(cen.to_check)],
            ["accepted as-is", n(cen.accepted)],
            ["adjusted by you", n(cen.adjusted)],
            ["no reference yet", n(stats.centering.unseeded)],
            ["back templates", backTemplates(stats.centering.back_templates)],
            ["front templates", `${n(stats.centering.front_templates)} cards`],
          ]}
          how="Finds the card's cut edge, straightens the card, then measures the inner border. With a template (v0.4) the printed design is aligned to a reference and the template's border lines are mapped in; templates come from measurements you accept or adjust: one back per language covers every back, one front per card covers every copy of that card."
          links={[["check centering", "/copies?centering=proposed"]]}
        />
        <Stage
          step="4" title="Defects + grade" subtitle="later" todo
          rows={[["status", "not built yet"]]}
          how="Surface, corners and edges; then the backtest: where PSA 10 vs 9 actually breaks, per card, to get true gem rates for raw cards."
        />
      </div>

      <Feedback stats={stats} />
    </div>
  );
}

function backTemplates(have?: string[]) {
  const h = new Set(have ?? []);
  return ["en", "ja"].map((l) => `${l} ${h.has(l) ? "✓" : "—"}`).join("  ");
}

function Stage({ step, title, subtitle, rows, how, links, health, todo }: {
  step: string; title: string; subtitle: string; rows: [string, string][]; how: string;
  links?: [string, string][]; health?: string; todo?: boolean;
}) {
  return (
    <div className={`relative bg-surface border rounded-md p-3 flex flex-col ${todo ? "border-dashed border-border opacity-60" : "border-border"}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] text-accent font-mono">{step}</span>
        <span className="text-sm font-semibold">{title}</span>
        {health !== undefined && (
          <span className={`ml-auto text-[10px] ${health ? "text-orange-400" : "text-green"}`} title={health || "running"}>
            {health ? "● paused" : "● running"}
          </span>
        )}
      </div>
      <div className="text-[10px] text-muted mb-2">{subtitle}</div>
      <div className="space-y-0.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <span className="text-muted">{k}</span>
            <span className="font-mono">{v}</span>
          </div>
        ))}
      </div>
      {health && <div className="text-[10px] text-orange-400 mt-1">{health}</div>}
      <div className="text-[10px] text-muted mt-2 leading-snug flex-1">{how}</div>
      {links && (
        <div className="flex flex-wrap gap-2 mt-2">
          {links.map(([label, to]) => (
            <Link key={to} to={to} className="text-[11px] text-accent hover:underline">{label} →</Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── tuning feedback ──────────────────────────────────────────────────────────

function Feedback({ stats }: { stats: FactoryStats }) {
  const f2 = (v: number | null | undefined, d = 2) => (v == null ? "—" : v.toFixed(d));
  return (
    <div className="bg-surface border border-border rounded-md p-4">
      <div className="text-sm font-semibold">Centering engine feedback</div>
      <p className="text-[11px] text-muted mt-1 mb-3 max-w-3xl">
        Every adjustment you save is paired with the automatic measurement it replaced. Those pairs show how far off the
        engine was, side by side, and your tags show why. A new engine version is run against the same photos and has
        to beat these numbers. Adjusted fronts of cards with no catalog image also become that card's reference image.
      </p>
      {stats.feedback.length === 0 ? (
        <div className="text-xs text-muted">No measurements yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs w-full border-collapse">
            <thead>
              <tr className="text-muted text-left border-b border-border">
                <th className="py-1.5 pr-3">engine</th>
                <th className="pr-3">measured</th>
                <th className="pr-3">accepted as-is</th>
                <th className="pr-3">adjusted</th>
                <th className="pr-3">can't measure</th>
                <th className="pr-3" title="mean |engine − you| border width, mm">border error L / R / T / B (mm)</th>
                <th className="pr-3" title="mean corner displacement">corner error (px)</th>
                <th className="pr-3">ratio error L/R · T/B (pp)</th>
                <th className="pr-3" title="adjusted photos where the engine was within 1 point on both axes">within 1 pp</th>
                <th>top reasons</th>
              </tr>
            </thead>
            <tbody>
              {stats.feedback.map((v) => (
                <tr key={v.version} className="border-b border-[#1c2128] align-top">
                  <td className="py-1.5 pr-3 font-mono">v{v.version}</td>
                  <td className="pr-3">{n(v.auto)}</td>
                  <td className="pr-3">{n(v.accepted_as_is)}</td>
                  <td className="pr-3">{n(v.adjusted)}</td>
                  <td className="pr-3">{n(v.rejected)}</td>
                  <td className="pr-3 font-mono">{f2(v.side_err_mm.left)} / {f2(v.side_err_mm.right)} / {f2(v.side_err_mm.top)} / {f2(v.side_err_mm.bottom)}</td>
                  <td className="pr-3 font-mono">{f2(v.outer_err_px, 1)}</td>
                  <td className="pr-3 font-mono">{f2(v.lr_err_pp, 1)} · {f2(v.tb_err_pp, 1)}</td>
                  <td className="pr-3">{v.within_1pp == null ? "—" : `${Math.round(v.within_1pp * 100)}%`}</td>
                  <td className="text-[10px] text-muted">
                    {Object.entries(v.tags).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, c]) => `${t.replace(/_/g, " ")} ${c}`).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
