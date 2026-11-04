import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { FactoryStats, IngestStatus, StationId, StationStats } from "../types";

// The pre-grading factory: how a graded copy moves from a marketplace listing
// to a centering measurement, with live counts per stage, links into each
// stage's review queue, and the feedback the engine gets tuned against.

const n = (v: number | undefined | null) => (v ?? 0).toLocaleString();

export default function Factory() {
  const [stats, setStats] = useState<FactoryStats | null>(null);
  const [status, setStatus] = useState<IngestStatus | null>(null);
  const [stations, setStations] = useState<StationStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      Promise.all([api.getFactory(), api.getIngestStatus(), api.getStations()])
        .then(([f, s, st]) => { setStats(f); setStatus(s); setStations(st.stations); setError(null); })
        .catch((e: unknown) => setError(String(e)));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  if (error) return <div className="text-red-400 py-12 text-center">{error}</div>;
  if (!stats || !status || !stations) return <div className="text-muted py-12 text-center">Loading the factory floor…</div>;

  const by = Object.fromEntries(stations.map((s) => [s.id, s])) as Record<StationId, StationStats>;
  const needsYou = stations.reduce((a, s) => a + (s.states.low ?? 0), 0);
  const version = stats.centering.versions?.[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-lg font-semibold">Pre-grading factory</h1>
        <span className="text-xs text-muted">
          {n(needsYou)} station checks need you · <Link to="/factory/history" className="text-accent hover:underline">my review history →</Link>
        </span>
      </div>
      <p className="text-muted text-xs max-w-4xl">
        Every graded copy from eBay and Fanatics rides the belt through each machine. A machine answers on its own and says how
        sure it is: <span className="text-green">high</span> passes automatically, <span className="text-yellow">medium</span> passes
        but is worth a spot-check, <span className="text-red-400">needs you</span> waits for a person. Your corrections are stored next
        to the machine's answer and are what the next version is tuned against.
      </p>

      {/* inputs */}
      <div className="flex flex-wrap items-stretch gap-2">
        <Feeder title="Catalog" lines={[`${n(status.cards_synced)} cards`, `synced ${status.catalog_synced_at?.slice(5, 16).replace("T", " ") ?? "—"}`]} />
        <Arrow label="" />
        <Feeder title="Listings (eBay + Fanatics)" lines={[
          `${n(stats.listings.copies)} copies`,
          Object.entries(stats.listings.by_source).map(([k, v]) => `${k} ${n(v)}`).join(" · "),
          `+${rate(by.card?.added_per_day)} a day into the line`,
        ]} link={["all copies", "/copies"]} />
      </div>

      {/* the floor */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3">
        <Machine s={by.card} n0="1" power="photo matched against the catalog image (SIFT) · AI label check when unsure" worker={status.triage_paused} />
        <Machine s={by.grade} n0="2" power="CGC QR codes carry the grade · AI label check; otherwise the listing title" worker={status.triage_paused} />
        <Machine s={by.cert} n0="3" power="QR code / barcode on the slab · AI reads the label when they fail" worker={status.triage_paused} />
        <Machine s={by.photos} n0="4" power="best full front and back by match strength, size and sharpness (Fanatics: fixed order)" worker={status.triage_paused} />
        <Machine s={by.front} n0="5" power={`centering engine${version ? ` v${version}` : ""}: cut edge, then inner border (template when the card has one)`} worker={status.centering_paused} />
        <Machine s={by.back} n0="6" power={`centering engine${version ? ` v${version}` : ""} · back templates ${backTemplates(stats.centering.back_templates)}`} worker={status.centering_paused} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Later n0="7" title="Corners" text="Each corner front and back: a clean quarter circle? Whitening from a dull blade on the back?" />
        <Later n0="8" title="Edges" text="Each edge: fraying, silvering and other cutting imperfections. Then the backtest: where PSA 10 vs 9 actually breaks." />
      </div>

      <Feedback stats={stats} />
    </div>
  );
}

const rate = (v?: number) => (v == null ? "—" : v >= 10 ? Math.round(v).toLocaleString() : v.toFixed(1));

function Arrow({ label }: { label: string }) {
  return <div className="flex items-center text-accent text-lg px-1" title={label}>→</div>;
}

function Feeder({ title, lines, link }: { title: string; lines: string[]; link?: [string, string] }) {
  return (
    <div className="bg-surface border border-border rounded-md px-3 py-2 min-w-48">
      <div className="text-xs font-semibold">{title}</div>
      {lines.map((l) => <div key={l} className="text-[11px] text-muted">{l}</div>)}
      {link && <Link to={link[1]} className="text-[11px] text-accent hover:underline">{link[0]} →</Link>}
    </div>
  );
}

function Machine({ s, n0, power, worker }: { s?: StationStats; n0: string; power: string; worker?: string }) {
  if (!s) return null;
  const st = s.states;
  const q = st.queued ?? 0;
  const eta = s.processed_per_day > 0 && q > 0 ? q / s.processed_per_day : null;
  const href = (state: string) => `/copies?station=${s.id}&state=${state}`;
  const bin = (label: string, state: string, cls: string, hint: string) => (
    <Link to={href(state)} title={hint} className={`flex justify-between items-baseline rounded px-2 py-1 border ${cls} hover:brightness-125`}>
      <span className="text-[11px]">{label}</span>
      <span className="font-mono text-sm">{n(st[state as keyof typeof st])}</span>
    </Link>
  );
  return (
    <div className="bg-surface border border-border rounded-md p-3 flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] text-accent">{n0}</span>
        <span className="text-sm font-semibold">{s.label}</span>
        <span className={`ml-auto text-[10px] ${worker ? "text-orange-400" : "text-green"}`} title={worker || "running"}>● {worker ? "paused" : "running"}</span>
      </div>
      <div className="text-[10px] text-muted leading-snug">{power}</div>

      {/* in the machine */}
      <Link to={href("queued")} className="bg-bg border border-border rounded px-2 py-1.5 hover:border-accent/50">
        <div className="flex justify-between items-baseline">
          <span className="text-[11px] text-muted">in the machine (automation queue)</span>
          <span className="font-mono text-lg">{n(q)}</span>
        </div>
        <div className="text-[10px] text-muted">
          +{rate(s.added_per_day)}/day in · {rate(s.processed_per_day)}/day done{eta != null ? ` · clears in ~${eta < 1 ? "<1" : Math.round(eta)} day${eta >= 1.5 ? "s" : ""}` : ""}
        </div>
        {(st.upstream ?? 0) > 0 && <div className="text-[10px] text-muted">{n(st.upstream)} waiting at earlier machines</div>}
      </Link>

      {/* output bins */}
      <div className="space-y-1">
        {bin("auto-passed · high", "high", "border-green/30 text-green", "the machine is sure; no review needed")}
        {bin("auto-passed · medium", "medium", "border-yellow/30 text-yellow", "plausible but not proven; worth a spot-check")}
        {bin("needs you", "low", "border-red-400/50 text-red-400 bg-red-500/5", "the machine is unsure or something disagrees")}
        {bin(`reviewed by you${s.reviewed_per_day ? ` (${rate(s.reviewed_per_day)}/day)` : ""}`, "reviewed", "border-border text-[#e6edf3]", "a person decided this step")}
        {(st.removed ?? 0) > 0 && bin("removed", "removed", "border-border text-muted", "removed from the dataset")}
      </div>
    </div>
  );
}

function Later({ n0, title, text }: { n0: string; title: string; text: string }) {
  return (
    <div className="bg-surface border border-dashed border-border rounded-md p-3 opacity-60">
      <div className="flex items-baseline gap-2"><span className="font-mono text-[10px] text-accent">{n0}</span><span className="text-sm font-semibold">{title}</span><span className="text-[10px] text-muted ml-auto">later</span></div>
      <div className="text-[10px] text-muted mt-1">{text}</div>
    </div>
  );
}

function backTemplates(have?: string[]) {
  const h = new Set(have ?? []);
  return ["en", "ja"].map((l) => `${l} ${h.has(l) ? "✓" : "—"}`).join("  ");
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
