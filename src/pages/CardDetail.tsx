import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type {
  CardDetail as CardDetailType,
  CertRow,
  StatRow,
  GradedMarketData,
  GemRateData,
  CertCategory,
  CertPurpose,
} from "../types";

export default function CardDetail() {
  const { id } = useParams<{ id: string }>();
  const cardId = Number(id);
  const navigate = useNavigate();

  const [card, setCard] = useState<CardDetailType | null>(null);
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [stats, setStats] = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"certs" | "buckets">("certs");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [marketData, setMarketData] = useState<GradedMarketData | null>(null);
  const [gemData, setGemData] = useState<GemRateData | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.getCard(cardId), api.listCertsForCard(cardId), api.getCardStats(cardId)])
      .then(([c, certsData, statsData]) => {
        setCard(c);
        setCerts(certsData ?? []);
        setStats(statsData ?? []);
        // Fetch market data if linked
        if (c.market_display_key) {
          setMarketLoading(true);
          Promise.all([
            api.getGradedMarket(c.market_display_key).catch(() => null),
            api.getGemRate(c.market_display_key).catch(() => null),
          ]).then(([graded, gem]) => {
            setMarketData(graded);
            setGemData(gem);
          }).finally(() => setMarketLoading(false));
        }
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [cardId]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.deleteCard(cardId);
      navigate("/");
    } catch (e) {
      setError(String(e));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (loading) return <div className="text-muted py-12 text-center">Loading…</div>;
  if (error) return <div className="text-red-400 py-12 text-center">{error}</div>;
  if (!card) return null;

  const graded = certs.filter((c) => c.grade_received !== null);
  const pending = certs.filter((c) => c.grade_received === null);

  return (
    <div>
      <div className="flex items-center gap-2 mb-6 text-xs text-muted">
        <Link to="/" className="hover:text-accent transition-colors">← Games</Link>
        <span className="text-border">/</span>
        <span className="text-[#e6edf3]">{card.card_name}</span>
      </div>

      {/* Card header */}
      <div className="bg-surface border border-border rounded-md p-5 mb-4">
        <div className="flex items-start gap-4">
          <CardArt card={card} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-xl font-semibold">{card.card_name}</h1>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-[10px] text-muted hover:text-red-400 border border-transparent hover:border-red-400/30 rounded px-2 py-1 transition-colors whitespace-nowrap"
                >
                  Delete card
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-red-400">Delete?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-[10px] bg-red-500/20 text-red-400 border border-red-400/40 rounded px-2 py-1 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                  >
                    {deleting ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-[10px] text-muted hover:text-[#e6edf3] border border-border rounded px-2 py-1 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            <div className="text-muted text-sm mt-1">
              {card.set_name} · #{card.card_number} · {card.game}
            </div>
            <div className="flex gap-3 mt-3 flex-wrap">
              <StatPill label="Total" value={certs.length} color="text-[#e6edf3]" />
              <StatPill label="PSA 10" value={graded.filter((c) => c.grade_received === 10).length} color="text-green" />
              <StatPill label="PSA 9" value={graded.filter((c) => c.grade_received === 9).length} color="text-yellow" />
              <StatPill label="Pending" value={pending.length} color="text-muted" />
            </div>
          </div>
        </div>
      </div>

      {/* Market data panel */}
      <MarketPanel
        displayKey={card.market_display_key}
        marketData={marketData}
        gemData={gemData}
        loading={marketLoading}
      />

      {/* Tabs */}
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

// ── Card art thumbnail ────────────────────────────────────────────────────────

function CardArt({ card }: { card: CardDetailType }) {
  const [failed, setFailed] = useState(false);
  let imgUrl: string | null = card.image_url;
  if (!imgUrl && card.game.toLowerCase() === "pokemon") {
    const num = card.card_number.padStart(3, "0");
    imgUrl = `https://images.pokemontcg.io/${card.set_code}/${num}.png`;
  }

  if (!imgUrl || failed) {
    return (
      <div className="w-24 h-32 bg-bg border border-border rounded flex items-center justify-center flex-shrink-0">
        <span className="text-3xl text-border">◈</span>
      </div>
    );
  }
  return (
    <img
      src={imgUrl}
      alt={card.card_name}
      className="w-24 h-32 object-contain bg-bg rounded border border-border flex-shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

// ── Market data panel ─────────────────────────────────────────────────────────

function MarketPanel({
  displayKey,
  marketData,
  gemData,
  loading,
}: {
  displayKey: string | null;
  marketData: GradedMarketData | null;
  gemData: GemRateData | null;
  loading: boolean;
}) {
  if (!displayKey) {
    return (
      <div className="bg-surface border border-border rounded-md px-4 py-3 mb-4 text-muted text-xs">
        No market data linked. Set <code className="text-accent">market_display_key</code> on this card to pull gem rates and prices from the market tracker.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-md px-4 py-3 mb-4 text-muted text-xs">
        Loading market data…
      </div>
    );
  }

  // Extract latest snapshot per (company, grade) from graded endpoint
  const latestByKey = new Map<string, { marketCents: number | null; lastSaleCents: number | null }>();
  if (marketData?.snapshots) {
    for (const s of marketData.snapshots) {
      const key = `${s.company}|${s.grade}`;
      if (!latestByKey.has(key)) {
        latestByKey.set(key, { marketCents: s.market_price_cents ?? null, lastSaleCents: s.last_sale_cents ?? null });
      }
    }
  }

  // Latest gem rate per company
  const latestGem = new Map<string, number | null>();
  if (gemData?.gem_rates) {
    for (const g of gemData.gem_rates) {
      if (!latestGem.has(g.company)) {
        latestGem.set(g.company, g.gem_rate_pct ?? null);
      }
    }
  }

  const psa10Price = latestByKey.get("PSA|10") ?? latestByKey.get("PSA|PSA 10");
  const psa9Price  = latestByKey.get("PSA|9")  ?? latestByKey.get("PSA|PSA 9");
  const cgc10Price = latestByKey.get("CGC|10") ?? latestByKey.get("CGC|Pristine 10") ?? latestByKey.get("CGC|10");
  const psaGemRate = latestGem.get("PSA");
  const cgcGemRate = latestGem.get("CGC");

  const hasAnyData = psa10Price || psa9Price || cgc10Price || psaGemRate !== undefined || cgcGemRate !== undefined;

  if (!hasAnyData) {
    return (
      <div className="bg-surface border border-border rounded-md px-4 py-3 mb-4 text-muted text-xs">
        Market tracker linked (<code className="text-accent">{displayKey}</code>) but no graded data yet.
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-md p-4 mb-4">
      <div className="text-muted text-xs uppercase tracking-widest mb-3">Market Data</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {psaGemRate !== null && psaGemRate !== undefined && (
          <MarketTile label="PSA Gem Rate" value={`${psaGemRate.toFixed(1)}%`} color="text-green" />
        )}
        {cgcGemRate !== null && cgcGemRate !== undefined && (
          <MarketTile label="CGC Gem Rate" value={`${cgcGemRate.toFixed(1)}%`} color="text-green" />
        )}
        {psa10Price && <MarketTile label="PSA 10" value={formatCents(psa10Price.marketCents)} color="text-green" />}
        {psa9Price  && <MarketTile label="PSA 9"  value={formatCents(psa9Price.marketCents)}  color="text-yellow" />}
        {cgc10Price && <MarketTile label="CGC 10" value={formatCents(cgc10Price.marketCents)} color="text-blue-400" />}
      </div>
      <div className="text-[10px] text-muted mt-2">
        via market tracker · <code>{displayKey}</code>
      </div>
    </div>
  );
}

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function MarketTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-bg border border-border rounded px-3 py-2">
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-bg border border-border rounded px-3 py-2 text-center min-w-14">
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      <div className="text-muted text-[10px]">{label}</div>
    </div>
  );
}

// ── Cert category / purpose display ──────────────────────────────────────────

const CATEGORY_LABELS: Record<CertCategory, string> = {
  raw:     "Raw",
  psa9:    "PSA 9",   psa10:   "PSA 10",
  cgc9:    "CGC 9",   cgc10:   "CGC 10",
  bgs9:    "BGS 9",   bgs9pt5: "BGS 9.5",  bgs10: "BGS 10",
};

const PURPOSE_LABELS: Record<CertPurpose, { label: string; color: string }> = {
  analytics:         { label: "Analytics",          color: "text-muted"      },
  grading_tracker:   { label: "My Grading Tracker", color: "text-accent"     },
  buy_and_grade:     { label: "Buy+Grade",           color: "text-accent"     },
  crack_and_regrade: { label: "Crack+Regrade",       color: "text-orange-400" },
};

function CategoryBadge({ category }: { category: CertCategory }) {
  const colorMap: Record<CertCategory, string> = {
    raw:     "text-muted border-border",
    psa9:    "text-yellow border-yellow/30 bg-yellow/10",
    psa10:   "text-green border-green/30 bg-green/10",
    cgc9:    "text-blue-400 border-blue-400/30 bg-blue-400/10",
    cgc10:   "text-blue-300 border-blue-300/30 bg-blue-300/10",
    bgs9:    "text-orange-400 border-orange-400/30 bg-orange-400/10",
    bgs9pt5: "text-orange-300 border-orange-300/30 bg-orange-300/10",
    bgs10:   "text-green border-green/30 bg-green/10",
  };
  return (
    <span className={`border rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${colorMap[category] ?? "text-muted border-border"}`}>
      {CATEGORY_LABELS[category] ?? category}
    </span>
  );
}

// ── Cert table ────────────────────────────────────────────────────────────────

function CertTable({ certs }: { certs: CertRow[] }) {
  if (certs.length === 0) {
    return <div className="text-muted text-center py-12">No certs yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border text-muted text-left">
            <th className="py-2 pr-3">Cert</th>
            <th className="py-2 pr-3">Category</th>
            <th className="py-2 pr-3">Purpose</th>
            <th className="py-2 pr-3">Grade</th>
            <th className="py-2 pr-3">Centering F</th>
            <th className="py-2 pr-3">Inspection</th>
            <th className="py-2 pr-3">Images</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {certs.map((cert) => (
            <CertTableRow key={cert.id} cert={cert} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CertTableRow({ cert }: { cert: CertRow }) {
  const navigate = useNavigate();

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

  const hasInspection = cert.inspection_source !== null;
  const purposeInfo = PURPOSE_LABELS[cert.purpose as CertPurpose] ?? { label: cert.purpose, color: "text-muted" };

  return (
    <tr
      className="border-b border-[#1c2128] hover:bg-surface/50 transition-colors cursor-pointer"
      onClick={() => navigate(`/certs/${cert.id}`)}
    >
      <td className="py-2 pr-3 font-mono text-accent hover:underline">{cert.cert_number}</td>
      <td className="py-2 pr-3">
        <CategoryBadge category={cert.category as CertCategory} />
      </td>
      <td className={`py-2 pr-3 ${purposeInfo.color}`}>{purposeInfo.label}</td>
      <td className={`py-2 pr-3 font-semibold ${gradeColor}`}>
        {cert.grade_received !== null
          ? `${cert.grader} ${cert.grade_received}`
          : "pending"}
      </td>
      <td className="py-2 pr-3 text-muted font-mono">{center}</td>
      <td className="py-2 pr-3">
        {hasInspection ? (
          <span className={cert.inspection_source === "auto" ? "text-purple-400" : "text-green"}>
            {cert.inspection_source}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="py-2 pr-3">
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {cert.front_image && <ImageThumb label="F" path={cert.front_image} />}
          {cert.back_image && <ImageThumb label="B" path={cert.back_image} />}
        </div>
      </td>
      <td className="py-2 text-muted hover:text-accent">→</td>
    </tr>
  );
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
