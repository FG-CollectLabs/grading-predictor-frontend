import { useEffect, useState } from "react";
import { api } from "../api";
import type { InfraItem, InfraSummary } from "../types";

// Hardware: what the homelab runs on, how full it is, and what renting the
// same would cost (data: tools/infra_collect.py on Proxmox, every 15 min).
// compact: tiles (home page); full: + every node / guest / pool (Developer).

const GB = 1 << 30;
const gb = (b: number) => (b >= 1024 * GB ? `${(b / 1024 / GB).toFixed(1)} TB` : `${Math.round(b / GB)} GB`);
const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);

export default function InfraPanel({ compact = false }: { compact?: boolean }) {
  const [d, setD] = useState<InfraSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.getInfra().then(setD).catch((e: unknown) => setErr(String(e))); }, []);
  if (err) return compact ? null : <div className="text-xs text-red-400">{err}</div>;
  if (!d) return null;
  const t = d.totals;
  const rentAlloc = d.rent.total_allocated ?? 0;
  const rentRight = d.rent.total_right_sized ?? 0;
  return (
    <div className="bg-surface border border-border rounded-md p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <div className="text-sm font-semibold">Hardware</div>
        <div className="text-[10px] text-muted">homelab (Proxmox) · {d.as_of ? `as of ${new Date(d.as_of).toLocaleString()}` : "no data yet"}</div>
      </div>
      {d.items.length === 0 ? (
        <div className="text-xs text-muted">No hardware data yet. Install tools/infra_collect.py on a Proxmox node (cron every 15 min).</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Tile value={`${(t.node_cores_used ?? 0).toFixed(1)} / ${t.node_cores ?? 0}`}
              label={`CPU cores in use (${pct(t.node_cores_avg_7d ?? 0, t.node_cores ?? 0)}% avg this week)`}
              level={pct(t.node_cores_avg_7d ?? 0, t.node_cores ?? 0)} />
            <Tile value={`${gb(t.node_mem_used ?? 0)} / ${gb(t.node_mem ?? 0)}`} label="memory in use" level={pct(t.node_mem_used ?? 0, t.node_mem ?? 0)} />
            <Tile value={`${gb((t.local_gb_used ?? 0) * GB)} / ${gb((t.local_gb ?? 0) * GB)}`} label="local disks"
              level={pct(t.local_gb_used ?? 0, t.local_gb ?? 0)} />
            <Tile value={`${gb((t.bulk_gb_used ?? 0) * GB)} / ${gb((t.bulk_gb ?? 0) * GB)}`} label="NAS / shared storage"
              level={pct(t.bulk_gb_used ?? 0, t.bulk_gb ?? 0)} />
            <Tile value={`${usd(rentRight)}–${usd(rentAlloc)}/mo`}
              label={`to rent the same on AWS (right-sized – as allocated)${d.actual_usd_monthly != null ? ` · actually ${usd(d.actual_usd_monthly)}/mo` : ""}`} />
          </div>
          {d.warnings.length > 0 && (
            <div className="mt-2 text-xs text-yellow space-y-0.5">{d.warnings.map((w) => <div key={w}>⚠ {w}</div>)}</div>
          )}
          <Housekeeping d={d} />
          {!compact && <Details d={d} />}
        </>
      )}
    </div>
  );
}

// Daily photo cleanup (vision/centering/housekeeping.py): removed copies'
// photos, orphan files, lossless recompression.
function Housekeeping({ d }: { d: InfraSummary }) {
  const h = d.housekeeping;
  if (!h?.totals) return null;
  const t = h.totals;
  const freed = (t.removed_bytes ?? 0) + (t.orphan_bytes ?? 0) + (t.recompress_saved_bytes ?? 0);
  const mb = (b: number) => (b >= GB ? `${(b / GB).toFixed(1)} GB` : `${Math.round(b / (1 << 20))} MB`);
  return (
    <div className="mt-2 text-[11px] text-muted">
      Photo housekeeping{h.ran_at ? ` (last run ${new Date(h.ran_at).toLocaleDateString()})` : ""}: {mb(freed)} freed so far ·{" "}
      {t.removed_files ?? 0} photos of removed copies ({mb(t.removed_bytes ?? 0)}) · {t.orphans ?? 0} orphan files ({mb(t.orphan_bytes ?? 0)}) ·{" "}
      {t.recompressed ?? 0} recompressed losslessly ({mb(t.recompress_saved_bytes ?? 0)})
      {h.last_run?.error ? <span className="text-red-400"> · last run failed: {String(h.last_run.error)}</span> : null}
    </div>
  );
}

function Tile({ value, label, level }: { value: string; label: string; level?: number }) {
  const cls = level == null ? "" : level >= 85 ? "text-red-400" : level >= 70 ? "text-yellow" : "";
  return (
    <div className="bg-bg border border-border rounded px-3 py-2">
      <div className={`text-lg font-semibold ${cls}`}>{value}</div>
      <div className="text-[10px] text-muted leading-tight">{label}</div>
      {level != null && <Bar v={level} />}
    </div>
  );
}

function Bar({ v }: { v: number }) {
  const color = v >= 85 ? "bg-red-400" : v >= 70 ? "bg-yellow" : "bg-accent";
  return (
    <div className="h-1.5 bg-border rounded mt-1 overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${Math.min(100, v)}%` }} />
    </div>
  );
}

function Details({ d }: { d: InfraSummary }) {
  const kinds: [string, string][] = [["node", "Nodes"], ["lxc", "Containers"], ["qemu", "VMs"], ["storage", "Storage pools"]];
  const p = d.prices;
  return (
    <div className="mt-4 space-y-4">
      {kinds.map(([k, label]) => {
        const items = d.items.filter((i) => i.kind === k);
        if (!items.length) return null;
        return (
          <div key={k}>
            <div className="text-xs font-semibold mb-1">{label}</div>
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="text-muted text-left border-b border-border">
                  <th className="py-1 pr-2 font-normal">name</th>
                  {k !== "storage" && <th className="pr-2 font-normal">CPU cores (now · avg · peak 7d / max)</th>}
                  {k !== "storage" && <th className="pr-2 font-normal">memory (now · peak 7d / max)</th>}
                  <th className="pr-2 font-normal">disk</th>
                  {k === "storage" && <th className="font-normal">growth</th>}
                </tr>
              </thead>
              <tbody>{items.map((i) => <Row key={i.id} i={i} />)}</tbody>
            </table>
          </div>
        );
      })}
      <div className="text-[10px] text-muted">
        Rented equivalent: {p.source}. ${p.vcpu}/vCPU-month, ${p.gb_ram}/GB-RAM-month, disks ${p.gb_block}/GB-month,
        NAS ${p.gb_bulk}/GB-month (storage priced at what's used). "As allocated" rents what the running guests are given;
        "right-sized" rents their 7-day peak + 30%. Compute {usd(d.rent.compute_right_sized ?? 0)}–{usd(d.rent.compute_allocated ?? 0)},
        disks {usd(d.rent.block_storage ?? 0)}, NAS {usd(d.rent.bulk_storage ?? 0)} a month.
        Grading predictor: database {gb(d.app.db_bytes ?? 0)}, photos {gb(d.app.photo_bytes ?? 0)}
        {d.app.photo_storage_free != null ? `, ${gb(d.app.photo_storage_free)} free on its share` : ""}.
      </div>
    </div>
  );
}

function Row({ i }: { i: InfraItem }) {
  const stopped = i.status && !["running", "online", "available"].includes(i.status);
  return (
    <tr className={`border-b border-[#1c2128] ${stopped ? "opacity-50" : ""}`}>
      <td className="py-1 pr-2">{i.name}<span className="text-muted"> · {i.id.split("/").slice(0, 2).join(" ")}{stopped ? ` · ${i.status}` : ""}</span></td>
      {i.kind !== "storage" && (
        <td className="pr-2 w-60">
          <span className="font-mono">{i.cpu_used.toFixed(1)} · {i.cpu_avg_7d.toFixed(1)} · {i.cpu_peak_7d.toFixed(1)} / {i.cpu_max}</span>
          <Bar v={pct(i.cpu_avg_7d, i.cpu_max)} />
        </td>
      )}
      {i.kind !== "storage" && (
        <td className="pr-2 w-60">
          <span className="font-mono">{gb(i.mem_used)} · {gb(i.mem_peak_7d)} / {gb(i.mem_max)}</span>
          <Bar v={pct(i.mem_peak_7d, i.mem_max)} />
        </td>
      )}
      <td className="pr-2 w-60"><span className="font-mono">{gb(i.disk_used)} / {gb(i.disk_max)}</span><Bar v={pct(i.disk_used, i.disk_max)} /></td>
      {i.kind === "storage" && <td className="font-mono">{i.disk_growth_per_day > 0 ? `+${gb(i.disk_growth_per_day)}/day` : "—"}</td>}
    </tr>
  );
}
