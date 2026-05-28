import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";
import type { CardDetail as CardDetailType, CertRow, StatRow } from "../types";

export default function CardDetail() {
  const { id } = useParams<{ id: string }>();
  const cardId = Number(id);

  const [card, setCard] = useState<CardDetailType | null>(null);
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [stats, setStats] = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"certs" | "buckets">("certs");

  useEffect(() => {
    Promise.all([api.getCard(cardId), api.listCertsForCard(cardId), api.getCardStats(cardId)])
      .then(([c, certsData, statsData]) => {
        setCard(c);
        setCerts(certsData ?? []);
        setStats(statsData ?? []);
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [cardId]);

  if (loading) return <div className="text-muted py-12 text-center">Loading…</div>;
  if (error) return <div className="text-red-400 py-12 text-center">{error}</div>;
  if (!card) return null;

  const graded = certs.filter((c) => c.grade_received !== null);
  const pending = certs.filter((c) => c.grade_received === null);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="text-muted hover:text-accent text-xs transition-colors">
          ← All cards
        </Link>
      </div>

      <div className="bg-surface border border-border rounded-md p-5 mb-6">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{card.card_name}</h1>
            <div className="text-muted text-sm mt-1">
              {card.set_name} · #{card.card_number} · {card.game}
            </div>
          </div>
          <div className="flex gap-3 text-sm">
            <StatPill label="Total" value={certs.length} color="text-[#e6edf3]" />
            <StatPill label="PSA 10" value={graded.filter((c) => c.grade_received === 10).length} color="text-green" />
            <StatPill label="PSA 9" value={graded.filter((c) => c.grade_received === 9).length} color="text-yellow" />
            <StatPill label="Pending" value={pending.length} color="text-muted" />
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border mb-5">
        {(["certs", "buckets"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs transition-colors border-b-2 -mb-px ${
              tab === t
                ? "text-accent border-accent"
                : "text-muted border-transparent hover:text-[#e6edf3]"
            }`}
          >
            {t === "certs" ? `Certs (${certs.length})` : `Defect Buckets (${stats.length})`}
          </button>
        ))}
        <Link
          to={`/certs/new?card_id=${cardId}`}
          className="ml-auto text-xs text-accent border border-accent/30 rounded px-3 py-1 hover:bg-accent/10 transition-colors self-center mb-1"
        >
          + Add Cert
        </Link>
      </div>

      {tab === "certs" && <CertTable certs={certs} />}
      {tab === "buckets" && <DefectBuckets stats={stats} total={graded.length} />}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-bg border border-border rounded px-3 py-2 text-center min-w-16">
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      <div className="text-muted text-[10px]">{label}</div>
    </div>
  );
}

function CertTable({ certs }: { certs: CertRow[] }) {
  if (certs.length === 0) {
    return <div className="text-muted text-center py-12">No certs yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border text-muted text-left">
            <th className="py-2 pr-4">Cert</th>
            <th className="py-2 pr-4">Grade</th>
            <th className="py-2 pr-4">Centering F</th>
            <th className="py-2 pr-4">Surface</th>
            <th className="py-2 pr-4">Corners</th>
            <th className="py-2 pr-4">Edges</th>
            <th className="py-2 pr-4">Source</th>
            <th className="py-2">Images</th>
          </tr>
        </thead>
        <tbody>
          {certs.map((cert) => (
            <CertRow key={cert.id} cert={cert} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CertRow({ cert }: { cert: CertRow }) {
  const gradeColor =
    cert.grade_received === 10
      ? "text-green"
      : cert.grade_received === 9
      ? "text-yellow"
      : "text-muted";

  const center =
    cert.centering_front_lr !== null && cert.centering_front_tb !== null
      ? `${cert.centering_front_lr}/${100 - cert.centering_front_lr} · ${cert.centering_front_tb}/${100 - cert.centering_front_tb}`
      : "—";

  const corners = [cert.corner_tl, cert.corner_tr, cert.corner_bl, cert.corner_br];
  const worstCorner = worstOf(corners, ["heavy_wear", "light_wear", "sharp"]);

  const edges = [cert.edge_top, cert.edge_bottom, cert.edge_left, cert.edge_right];
  const worstEdge = worstOf(edges, ["nick", "heavy_wear", "light_wear", "clean"]);

  return (
    <tr className="border-b border-[#1c2128] hover:bg-surface/50 transition-colors">
      <td className="py-2 pr-4 font-mono">{cert.cert_number}</td>
      <td className={`py-2 pr-4 font-semibold ${gradeColor}`}>
        {cert.grade_received !== null ? `PSA ${cert.grade_received}` : "pending"}
      </td>
      <td className="py-2 pr-4 text-muted font-mono">{center}</td>
      <td className="py-2 pr-4">
        <DefectTag value={cert.surface_front} />
        {cert.surface_back && cert.surface_back !== cert.surface_front && (
          <span className="text-muted ml-1">/ <DefectTag value={cert.surface_back} /></span>
        )}
      </td>
      <td className="py-2 pr-4">
        <DefectTag value={worstCorner} />
      </td>
      <td className="py-2 pr-4">
        <DefectTag value={worstEdge} />
      </td>
      <td className="py-2 pr-4 text-muted">
        {cert.inspection_source ? (
          <span className={cert.inspection_source === "auto" ? "text-purple" : "text-muted"}>
            {cert.inspection_source}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="py-2">
        <div className="flex gap-1">
          {cert.front_image && <ImageThumb label="F" path={cert.front_image} />}
          {cert.back_image && <ImageThumb label="B" path={cert.back_image} />}
        </div>
      </td>
    </tr>
  );
}

function worstOf(values: (string | null)[], order: string[]): string | null {
  for (const level of order) {
    if (values.some((v) => v === level)) return level;
  }
  return values.find((v) => v !== null) ?? null;
}

function DefectTag({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted">—</span>;
  const color =
    value === "clean" || value === "sharp"
      ? "text-green"
      : value === "light_wear" || value === "light_scratch"
      ? "text-yellow"
      : "text-red-400";
  return <span className={color}>{value.replace(/_/g, " ")}</span>;
}

function ImageThumb({ label, path }: { label: string; path: string }) {
  const gcsBase = import.meta.env.VITE_GCS_PUBLIC_BASE ?? "";
  const url = gcsBase ? `${gcsBase}/${path}` : path;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-accent hover:underline text-[10px]">
      {label}
    </a>
  );
}

// ── Defect Buckets ────────────────────────────────────────────────────────────

type BucketKey = string;
interface Bucket {
  centering_bucket: string;
  surface_front: string;
  surface_back: string;
  grades: Record<number, number>;
  total: number;
}

function DefectBuckets({ stats, total }: { stats: StatRow[]; total: number }) {
  if (stats.length === 0) {
    return (
      <div className="text-muted text-center py-12">
        No graded certs with inspections yet.
      </div>
    );
  }

  // Group stat rows into buckets
  const bucketMap = new Map<BucketKey, Bucket>();
  for (const row of stats) {
    const key = `${row.centering_bucket}|${row.surface_front}|${row.surface_back}`;
    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        centering_bucket: row.centering_bucket,
        surface_front: row.surface_front,
        surface_back: row.surface_back,
        grades: {},
        total: 0,
      });
    }
    const bucket = bucketMap.get(key)!;
    if (row.grade_received !== null) {
      bucket.grades[row.grade_received] = (bucket.grades[row.grade_received] ?? 0) + row.count;
      bucket.total += row.count;
    }
  }

  const buckets = [...bucketMap.values()].sort((a, b) => b.total - a.total);

  return (
    <div>
      <div className="text-muted text-xs mb-4">
        {total} graded cert{total !== 1 ? "s" : ""} with inspections ·{" "}
        grouped by centering + surface profile
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {buckets.map((b) => (
          <BucketCard key={`${b.centering_bucket}|${b.surface_front}|${b.surface_back}`} bucket={b} />
        ))}
      </div>
    </div>
  );
}

function BucketCard({ bucket }: { bucket: Bucket }) {
  const psa10 = bucket.grades[10] ?? 0;
  const psa9 = bucket.grades[9] ?? 0;
  const pct10 = bucket.total > 0 ? Math.round((psa10 / bucket.total) * 100) : 0;

  const centerColor =
    bucket.centering_bucket === "centered"
      ? "text-green"
      : bucket.centering_bucket === "near_centered"
      ? "text-yellow"
      : "text-red-400";

  return (
    <div className="bg-surface border border-border rounded-md p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className={`text-sm font-semibold ${centerColor}`}>
            {bucket.centering_bucket.replace(/_/g, " ")}
          </div>
          <div className="text-muted text-xs mt-0.5">
            surface F: {bucket.surface_front.replace(/_/g, " ")} ·{" "}
            B: {bucket.surface_back.replace(/_/g, " ")}
          </div>
        </div>
        <span className="text-muted text-xs">{bucket.total} cert{bucket.total !== 1 ? "s" : ""}</span>
      </div>

      <div className="flex gap-3 text-xs mb-3">
        <span className="text-green">PSA 10: {psa10}</span>
        <span className="text-yellow">PSA 9: {psa9}</span>
        {Object.entries(bucket.grades)
          .filter(([g]) => Number(g) < 9)
          .map(([g, cnt]) => (
            <span key={g} className="text-muted">PSA {g}: {cnt}</span>
          ))}
      </div>

      <div className="mt-1">
        <div className="flex justify-between text-[10px] text-muted mb-1">
          <span>PSA 10 rate</span>
          <span className="text-green font-semibold">{pct10}%</span>
        </div>
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-green rounded-full transition-all"
            style={{ width: `${pct10}%` }}
          />
        </div>
      </div>
    </div>
  );
}
