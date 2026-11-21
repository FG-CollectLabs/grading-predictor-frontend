import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, imageUrl } from "../api";
import AICostPanel from "../components/AICostPanel";
import InfraPanel from "../components/InfraPanel";
import { currentMeasurement } from "../components/CenteringEditor";
import type { CenteringMeasurement } from "../types";

// Developer tab: the architecture guide. How the pre-grader is put together,
// how each pre-grading step works (who does it: the engine, an AI job or a
// person), where everything runs, and the decisions behind it. Mostly static
// on purpose; the centering walkthrough shows live examples. Keep it current
// when a component changes: it's the map for future work.

type Tab = "overview" | "pipeline" | "centering" | "infra" | "decisions" | "costs";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "pipeline", label: "Pre-grading pipeline" },
  { id: "centering", label: "Centering, step by step" },
  { id: "infra", label: "Infrastructure" },
  { id: "decisions", label: "Decisions & rules" },
  { id: "costs", label: "Costs" },
];

export default function Developer() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "overview";
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-lg font-semibold">Developer guide</h1>
        <p className="text-muted text-xs mt-1 max-w-3xl">
          How the pre-grader works and where it runs, for anyone changing it. Machines do each step first; an AI job
          takes the steps that need judgement; a person reviews what either is unsure about. Repos: grading-predictor-backend
          (Go API + Python vision workers + AI job scripts) and grading-predictor-frontend (this site).
        </p>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setParams({ tab: t.id })}
            className={`px-3 py-2 text-xs border-b-2 -mb-px ${tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-[#e6edf3]"}`}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "overview" && <Overview />}
      {tab === "pipeline" && <Pipeline />}
      {tab === "centering" && <Centering />}
      {tab === "infra" && <Infra />}
      {tab === "decisions" && <Decisions />}
      {tab === "costs" && <Costs />}
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────

type Tone = "ext" | "store" | "worker" | "api" | "ui" | "ai";
const TONE: Record<Tone, string> = {
  ext: "border-border", store: "border-yellow/50", worker: "border-purple/60", api: "border-accent/60", ui: "border-green/50", ai: "border-orange-400/50",
};

function B({ title, where, lines, tone = "ext" }: { title: string; where: string; lines: string[]; tone?: Tone }) {
  return (
    <div className={`bg-surface border rounded-md p-3 ${TONE[tone]}`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-[10px] text-muted mb-1">{where}</div>
      <ul className="text-[11px] text-muted space-y-0.5 list-disc pl-4">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}

const Arrow = ({ label }: { label: string }) => (
  <div className="flex items-center justify-center gap-2 text-[10px] text-muted py-1"><span className="text-accent">↓</span>{label}</div>
);

function Section({ title, children, lead }: { title: string; children?: React.ReactNode; lead?: string }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {lead && <p className="text-xs text-muted max-w-3xl leading-relaxed">{lead}</p>}
      {children}
    </section>
  );
}

type Who = "engine" | "ai" | "person";
const WHO: Record<Who, [string, string]> = {
  engine: ["engine", "text-accent border-accent/50"],
  ai: ["AI job", "text-orange-300 border-orange-300/50"],
  person: ["person", "text-green border-green/50"],
};
const WhoTag = ({ w }: { w: Who }) => <span className={`text-[10px] border rounded px-1.5 py-0.5 ${WHO[w][1]}`}>{WHO[w][0]}</span>;

// ── Overview ─────────────────────────────────────────────────────────────────

function Overview() {
  return (
    <div className="space-y-8">
      <Section title="What it's for"
        lead="Graded copies found on marketplaces become a measured dataset: which card, which grade, the cert, both photos, the centering on each side, and corner and edge readings. From that we learn where graders actually draw the line (how centering moves the odds of a 10), and use it to pre-grade raw cards before paying to grade them." />
      <Section title="System map">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <B title="Market tracker" where="market-tracker-backend · separate app, same LXC 109" lines={[
            "GET /v1/tracked/catalog: every tracked card, with its raw price",
            "GET /v1/graded-copies/feed: graded eBay + Fanatics listings (token)",
            "gem rates (GemRate), consumes our odds for deals and bids",
          ]} />
          <B title="Marketplaces" where="eBay image CDN, Fanatics vault CDN" lines={[
            "listing photos, fetched from allowlisted hosts only",
            "one shared rate limit, backoff, honest user agent",
          ]} />
          <B title="Admin app / scanner" where="admin.futuregadgetlabs.com" lines={[
            "in-hand scans of cards we own → POST /v1/predict",
            "outcomes when a card comes back graded",
          ]} />
        </div>
        <Arrow label="catalog sync daily · feed poll every 30 min · photo downloads" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <B tone="api" title="Grading API" where="Go · container grading-predictor-backend · LXC 109 :8084" lines={[
            "ingester (caps, check sample), copies, review, stations",
            "grade model + odds, reports, batch scans",
            "auth: Google sign-in (Firebase) or API tokens",
          ]} />
          <B tone="worker" title="Triage worker" where="Python + OpenCV + zxing · grading-vision" lines={[
            "match photos to the card (SIFT), pick front + back",
            "read cert from QR / barcode",
          ]} />
          <B tone="worker" title="Centering worker" where="Python + OpenCV · grading-centering" lines={[
            "outer edge, corners, inner border or template, ratios",
            "corner and edge readings; batch scan sheets",
          ]} />
          <B tone="ai" title="AI jobs" where="tools/cert_reader.py · hourly cron on agent2 · Claude Haiku" lines={[
            "label check (card, grader, grade, cert), photo picker",
            "corner & edge judgement on close-ups",
          ]} />
        </div>
        <Arrow label="reads / writes" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <B tone="store" title="Postgres" where="grading_predictor · LXC 102 (pg-slab-cracker) · proxmox2 · local disk" lines={[
            "cards, certifications (= copies), triage, measurements",
            "review steps + events (append-only), settings, report runs",
            "migrations run by hand before merging",
          ]} />
          <B tone="store" title="Photo storage" where="Synology NAS → NFS on proxmox3 → LXC 109" lines={[
            "/volume1/grading-photos (200 GB quota)",
            "copies/<id>/<side>-<sha>.jpg, refs/, batches/",
            "workers refuse to write unless the NAS marker exists",
          ]} />
          <B tone="ui" title="This site" where="React + Vite · GitHub Pages (gh-pages branch)" lines={[
            "Analytics, Factory (stations, review), Grader analytics",
            "centering editor straightens cards in the browser",
          ]} />
        </div>
      </Section>
      <Section title="Where to look next">
        <div className="grid gap-3 md:grid-cols-3 text-xs">
          {[
            ["pipeline", "Pre-grading pipeline", "Every step a copy goes through, and who does it."],
            ["centering", "Centering, step by step", "Edge, corners, border, templates, flags, review: with live examples."],
            ["infra", "Infrastructure", "Hosts, containers, storage, deploys, auth, known risks."],
          ].map(([t, h, d]) => (
            <Link key={t} to={`/developer?tab=${t}`} className="block border border-border rounded-md p-3 bg-surface hover:border-accent/60">
              <div className="font-semibold text-sm">{h} →</div><div className="text-muted mt-1">{d}</div>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

const STEPS: { n: string; title: string; who: Who[]; what: string; out: string; code: string }[] = [
  { n: "1", title: "Ingest", who: ["engine"], code: "internal/predictor/ingest.go, sample.go",
    what: "The tracker's feed gives grader, grade, title, cert (when the listing has it) and every photo URL. One copy per listing. Caps: 40 usable copies per card + grader + grade, 100 for PSA 10 / 9 of cards worth $50+ raw; extra copies are held back and fill in when one is removed. Of each group only a 15-copy sample gets AI checks and review; the rest are 'reserve' (measured, trained on, never queued).",
    out: "certifications + feed_photos (candidates)" },
  { n: "2", title: "Photo triage", who: ["engine"], code: "vision/triage",
    what: "Each photo is matched to the card's catalog image and to a card back (English and Japanese backs differ) with SIFT + RANSAC. The match says whether the whole card is in frame and which side it is; the best front and back are picked and downloaded. QR codes and barcodes on the slab give the cert.",
    out: "cert_images (front / back), copy_triage" },
  { n: "3", title: "AI label check", who: ["ai"], code: "tools/cert_reader.py (card, grade, cert tasks) → cert_ai.go, auto_triage.go",
    what: "Claude looks at all the listing's photos: is it this card (and language), which grader / grade / label is on the slab, the cert number, BGS / CGC subgrades, whether the chosen photos show the whole card. The API acts on confident answers: no slab → removed, wrong card → removed, grade differs → corrected to the slab, unreadable → removed. A person's review always wins.",
    out: "copy_triage.detail.ai_label, auto actions (audited)" },
  { n: "4", title: "AI photo picker", who: ["ai"], code: "tools/cert_reader.py (photos task) → photo_ai.go",
    what: "Where the matcher couldn't pick a full front or back, the AI picks from all listing photos, or says none is usable (the copy then needs the grader's scans pulled, or is removed).",
    out: "triage picks" },
  { n: "5", title: "Centering", who: ["engine", "person"], code: "vision/centering (pipeline.py, geometry.py, corners.py, template.py)",
    what: "Outer edge, pixel-level corners, inner border (or a card template), left/right and top/bottom ratios with a ± error, and flags when unsure. Flagged sides go to a person. Details in the next tab.",
    out: "centering_measurements (append-only, versioned)" },
  { n: "6", title: "Corners & edges", who: ["engine", "ai", "person"], code: "vision/centering/corners.py, edges.py · cert_reader.py (condition task) → condition.go",
    what: "The engine reads each corner (off-round from a quarter circle, whitening) and each edge (straightness, nicks, whitening). The AI then judges the zoomed inspection sheets with those readings: whitening, soft corner, ding, foil chip, rough cut, dent… with severity. Unsure or dirty → a person.",
    out: "condition_reviews" },
  { n: "7", title: "Review (stations)", who: ["person"], code: "stations.go, review_steps, frontend Copy review",
    what: "Every check is a station with a state per copy: queued, high (sure), medium, low (needs a person), reviewed, removed, reserve. People work the low queues step by step (card, grade, cert, photos, front, back, corners, edges); every decision is logged and can be reopened.",
    out: "copy_review_steps + copy_review_events" },
  { n: "8", title: "Grade model & odds", who: ["engine"], code: "grade_model.go, predict.go, explain.go",
    what: "Per grader, an ordinal model of grade on the four centering axes and corner off-round, with each card's own level (its PSA gem rate when known). Gives the odds of each grade for a copy or a raw card, why (per axis), and where it ranks among graded 10s.",
    out: "/v1/predict, Grader analytics, tracker deals" },
  { n: "9", title: "Reports", who: ["engine", "person"], code: "reports.go, frontend Grader reports",
    what: "Written-up findings per set and rarity: where graders start to ding centering, the near-centre thesis, what 9s have. People audit unreviewed copies, then refresh; each run is recorded to watch a thesis move.",
    out: "report_runs" },
];

function Pipeline() {
  return (
    <Section title="One graded copy, start to finish"
      lead="Each step says who does it. The engine is plain, versioned image processing (reproducible). AI jobs handle judgement calls (reading labels, picking photos, judging defects) and report a confidence. A person reviews what either flags; their decision is kept next to the machine's and wins.">
      <div className="flex gap-3 text-[11px] text-muted"><WhoTag w="engine" /><WhoTag w="ai" /><WhoTag w="person" /></div>
      <ol className="space-y-2">
        {STEPS.map((s) => (
          <li key={s.n} className="bg-surface border border-border rounded-md p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-accent font-mono">{s.n}</span>
              <span className="font-semibold text-sm">{s.title}</span>
              {s.who.map((w) => <WhoTag key={w} w={w} />)}
              <span className="text-[10px] text-muted ml-auto font-mono">{s.code}</span>
            </div>
            <div className="text-muted mt-1.5 leading-relaxed">{s.what}</div>
            <div className="text-[10px] text-muted mt-1">writes: <span className="font-mono">{s.out}</span></div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ── Centering deep dive ──────────────────────────────────────────────────────

const C_STEPS: { title: string; who: Who; body: string; tag?: string }[] = [
  { title: "1 · Seed the outline", who: "engine", tag: "seed.py",
    body: "Match the card's catalog image (front) or the card back (back) into the photo with SIFT + RANSAC. The homography gives the card's four corners to within a few pixels. Without a reference, straight-line and contour candidates are scored for 'looks like a card' (a uniform printed border, then a step 1.5–6 mm in)." },
  { title: "2 · Snap to the cut edge", who: "engine", tag: "geometry.refine_quad",
    body: "Each side is snapped to a straight edge within ±1.6 mm, keeping several candidates per side, because a slab's inner wall often sits ~1 mm outside the card and can be the stronger edge. The combination whose proportions best match a 63 × 88 mm card wins." },
  { title: "3 · Corner check (pixel level)", who: "engine", tag: "corners.py",
    body: "Zoom into each corner: a real card corner is two straight cut edges joined by a ~3 mm quarter circle. A slab wall or glare line is straight too, but no arc of the right size joins it. Where the cut sits off the outline's corner, the corner moves there (sub-pixel; corner error ~0.25 mm on reviewed photos). Also measured here: off-round and whitening, for corner grading." },
  { title: "4 · Scanner shadow (in-hand scans only)", who: "engine", tag: "shadow.py",
    body: "On flatbed scans a shadow just outside an edge can pull the outline out; sides are snapped back in to where the card's own border colour ends (at most 0.6 mm, inward only)." },
  { title: "5 · Straighten", who: "engine", tag: "geometry.rectify",
    body: "The four corners map the card onto a flat 63 × 88 mm image, taking out perspective and rotation, so every measurement is in millimetres." },
  { title: "6a · Inner border by scanning", who: "engine", tag: "geometry.inner_border",
    body: "From each edge, ~48 scan lines go straight in; on each the border ends where the colour leaves the border colour and stays away for 0.4 mm (thin copyright text doesn't count). The depth most lines agree on is the border. If one side can't be read (full-art cards), it's worked out from the other three; if the sums disagree (a text box caught), the off side is re-picked." },
  { title: "6b · …or by template (preferred)", who: "engine", tag: "template.py",
    body: "A template is the print frame marked once on a reference (the card's catalog image for fronts, one card back per language for backs), learned from a measurement a person accepted. The straightened card is registered to the reference over the whole design (hundreds of SIFT matches, ~0.05 mm) and the template's lines are mapped across. Hard edges are decided once per card, not per photo. The frame is a fixed size, so it also checks the cut: borders that don't add up flag the outer edge." },
  { title: "6c · Borderless cards: frame templates", who: "person", tag: "template.py · Card templates → Borderless",
    body: "Cards without a printed border (Riftbound's alt arts, overnumbered, signatures) are measured from a frame of reference a person sets per card: four lines on the design, placed on a reference copy straightened by its confirmed cut. Centering is the frame's shift from nominal (where a perfect cut leaves it: the cherry-picked copies' median, or the game's layout), shown as a ratio that reads 50/50 for a perfect cut. When a copy's cut misses the frame's fixed size (a slab's well or label taken for the edge), the cut is found again from the design: the reference's cut mapped through the registration, then the real edges near it. A new template is a draft read on its copies; it measures nothing until activated. Order per front: card template, then the game's layout (Riftbound's gold frame), then the printed-border engine." },
  { title: "7 · Ratios and error", who: "engine",
    body: "Left/right = left border ÷ (left + right), same for top/bottom, with a ± in percentage points from how much the scan lines disagree (half a pixel minimum per edge). Typical: ±1–2 points on listing photos, under 1 on scans." },
  { title: "8 · Flags → station state", who: "engine", tag: "stations.go",
    body: "Anything doubtful is flagged: card cut off, low resolution, bowed or weak edge, edge partly missing, ambiguous outer edge, weak card match, corners not found, low edge contrast, inconsistent or missing inner border. Template-measured sides are 'high'; flagged ones 'low' (a person's queue); the rest 'medium'." },
  { title: "9 · Person review", who: "person", tag: "CenteringEditor",
    body: "In the review screen the person confirms the outer edge first (drag corners, 1-pixel nudges, corner zoom; a confirmed outline makes the engine re-measure the inner border on it), then the inner border lines. Accept, adjust (a new measurement row, the engine's kept) or 'can't measure'. Adjustments become the golden set the engine is scored against (Centering eval on every vision PR) and the source of templates." },
  { title: "AI outline check & fix", who: "ai", tag: "outline_fix.go · worker.ai_fixes",
    body: "An AI looks at the four corner tiles of each engine outline. Where a corner is off it also estimates how far each edge should move; the engine re-snaps those edges to the strongest real edge within 0.6 mm of the estimate (never a blind move), the AI checks the fixed outline once more, and only if all four corners are then on does the fix become the outline (flag ai_outline_fixed; 15% still go to a person as a sample). Otherwise the copy goes to a person with both outlines shown (ai_fix_failed). Limits: no corner moves over 3 mm, the shape stays within 1.5% of 63 × 88. The inner border and ratios are always the engine's." },
];

function Centering() {
  return (
    <div className="space-y-8">
      <Section title="How a side's centering is measured (Pokémon)"
        lead="Centering = how far the printed border is shifted from one side to the other, measured from the card's cut edge. So the engine finds two things on each side: the cut (the outer edge) and the inner border (where the printed frame starts).">
        <CenteringDiagram />
        <ol className="grid gap-2 md:grid-cols-2">
          {C_STEPS.map((s) => (
            <li key={s.title} className="bg-surface border border-border rounded-md p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{s.title}</span><WhoTag w={s.who} />
                {s.tag && <span className="text-[10px] text-muted font-mono ml-auto">{s.tag}</span>}
              </div>
              <div className="text-muted mt-1 leading-relaxed">{s.body}</div>
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Live examples"
        lead="Real copies from the factory right now, with the engine's outline (blue) and inner border (magenta). Left: a side measured with a template (high). Right: a side the engine flagged for a person (low).">
        <div className="grid gap-4 md:grid-cols-2">
          <LiveExample state="high" title="Template-measured (high)" />
          <LiveExample state="low" title="Flagged for a person (low)" />
        </div>
      </Section>
      <Section title="Other games"
        lead="Riftbound's chase cards are borderless: there's no inner border, so centering is the shift of a thin gold frame at a fixed distance from the cut, registered against the card's catalog render (vision/centering/riftbound.py, preliminary, not wired in yet)." />
    </div>
  );
}

function CenteringDiagram() {
  // a schematic card: cut (blue), border shifted right, with the readings
  const W = 300, H = 400, k = W / 63;
  const L = 4.2, R = 2.8, T = 3.4, Bm = 3.6;
  return (
    <div className="flex flex-wrap gap-6 items-center bg-surface border border-border rounded-md p-4">
      <svg viewBox={`-30 -20 ${W + 60} ${H + 50}`} className="w-[300px] max-w-full" role="img" aria-label="centering diagram">
        <rect x={0} y={0} width={W} height={H} rx={3 * k} fill="#1f2937" stroke="#58a6ff" strokeWidth={2} />
        <rect x={L * k} y={T * k} width={W - (L + R) * k} height={H - (T + Bm) * k} fill="#0d1117" stroke="#bc8cff" strokeWidth={2} strokeDasharray="6 4" />
        <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={14} fill="#8b949e">printed art</text>
        {[["L", 0, H / 2, L * k, H / 2], ["R", W - R * k, H / 2 + 20, W, H / 2 + 20]].map(([t, x1, y1, x2, y2]) => (
          <g key={t as string}><line x1={x1 as number} y1={y1 as number} x2={x2 as number} y2={y2 as number} stroke="#d29922" strokeWidth={2} />
            <text x={((x1 as number) + (x2 as number)) / 2} y={(y1 as number) - 6} textAnchor="middle" fontSize={11} fill="#d29922">{t === "L" ? `${L} mm` : `${R} mm`}</text></g>
        ))}
        <line x1={W / 2} y1={0} x2={W / 2} y2={T * k} stroke="#d29922" strokeWidth={2} />
        <line x1={W / 2 + 30} y1={H - Bm * k} x2={W / 2 + 30} y2={H} stroke="#d29922" strokeWidth={2} />
        <text x={-6} y={-6} fontSize={11} fill="#58a6ff">cut (outer edge)</text>
        <text x={L * k + 4} y={T * k + 14} fontSize={11} fill="#bc8cff">inner border</text>
      </svg>
      <div className="text-xs space-y-2 max-w-sm">
        <div>Left / right = {L} ÷ ({L} + {R}) = <b>{(100 * L / (L + R)).toFixed(0)}/{(100 * R / (L + R)).toFixed(0)}</b></div>
        <div>Top / bottom = {T} ÷ ({T} + {Bm}) = <b>{(100 * T / (T + Bm)).toFixed(0)}/{(100 * Bm / (T + Bm)).toFixed(0)}</b></div>
        <div className="text-muted">PSA allows 60/40 on the front and 75/25 on the back for a 10 (worse axis). Graded data says the odds of a 10 start to fall from about 52/48 (Grader analytics → reports).</div>
      </div>
    </div>
  );
}

// homography: card mm (0..63, 0..88) → photo px for TL TR BR BL
function homography(q: number[][]): number[] {
  const src = [[0, 0], [63, 0], [63, 88], [0, 88]];
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = q[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((r, i) => r[8] / r[i]), 1];
}
const mapPt = (h: number[], x: number, y: number) => {
  const z = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / z, (h[3] * x + h[4] * y + h[5]) / z];
};

function LiveExample({ state, title }: { state: "high" | "low"; title: string }) {
  const [ex, setEx] = useState<{ id: number; img: string; m: CenteringMeasurement; size: [number, number] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const list = await api.listCopies(new URLSearchParams({ station: "front", state, limit: "8", photos: "both" }));
      for (const c of list.items) {
        if (!c.front_image) continue;
        const ms = (await api.getCentering(c.id)).measurements.filter((m) => m.side === "front");
        const m = currentMeasurement(ms);
        if (!m?.outer_quad || !m.inner_mm) continue;
        const img = new Image();
        img.src = imageUrl(c.front_image);
        await img.decode();
        setEx({ id: c.id, img: c.front_image, m, size: [img.naturalWidth, img.naturalHeight] });
        return;
      }
      setErr("no example right now");
    })().catch((e) => setErr(String(e.message ?? e)));
  }, [state]);
  if (err) return <div className="text-xs text-muted bg-surface border border-border rounded-md p-3">{title}: {err}</div>;
  if (!ex) return <div className="text-xs text-muted bg-surface border border-border rounded-md p-3">{title}: loading…</div>;
  const q = ex.m.outer_quad!.map((p) => [p[0], p[1]]);
  const h = homography(q);
  const i = ex.m.inner_mm!;
  const inner = [[i.left, i.top], [63 - i.right, i.top], [63 - i.right, 88 - i.bottom], [i.left, 88 - i.bottom]].map(([x, y]) => mapPt(h, x, y));
  // crop the view to the card with a margin
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
  const pad = 0.06 * (Math.max(...ys) - Math.min(...ys));
  const vb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad];
  const sw = vb[3] / 300;
  const lr = ex.m.lr_left_pct, tb = ex.m.tb_top_pct;
  return (
    <figure className="bg-surface border border-border rounded-md p-3 text-xs space-y-2">
      <figcaption className="font-semibold text-sm">{title}</figcaption>
      <svg viewBox={vb.join(" ")} className="w-full max-h-[420px] bg-black rounded">
        <image href={imageUrl(ex.img)} x={0} y={0} width={ex.size[0]} height={ex.size[1]} />
        <polygon points={q.map((p) => p.join(",")).join(" ")} fill="none" stroke="#58a6ff" strokeWidth={2 * sw} />
        <polygon points={inner.map((p) => p.join(",")).join(" ")} fill="none" stroke="#ff4fd8" strokeWidth={2 * sw} />
      </svg>
      <div>front L/R <b>{lr?.toFixed(1)}/{lr != null ? (100 - lr).toFixed(1) : ""}</b> · T/B <b>{tb?.toFixed(1)}/{tb != null ? (100 - tb).toFixed(1) : ""}</b>
        {ex.m.lr_err_pp != null && <span className="text-muted"> · ±{ex.m.lr_err_pp}</span>}
        <span className="text-muted"> · engine v{ex.m.detector_version}</span></div>
      {ex.m.flags.length > 0 && (
        <div className="flex flex-wrap gap-1">{ex.m.flags.map((f) => <span key={f} className="text-[10px] text-orange-300 border border-orange-300/30 rounded px-1">{f.replace(/_/g, " ")}</span>)}</div>
      )}
      <Link to={`/copies/${ex.id}`} className="text-accent hover:underline">open copy {ex.id} in review →</Link>
    </figure>
  );
}

// ── Infrastructure ───────────────────────────────────────────────────────────

const HOSTS: [string, string, string][] = [
  ["proxmox2 · LXC 102 pg-slab-cracker (192.168.86.183)", "Postgres grading_predictor", "4 GB / 4 cores, 40 GB disk (grown from 15 GB after it filled on 2026-11-15). Database ~2.2 GB; journald capped at 200 MB."],
  ["proxmox3 (192.168.86.92) · LXC 109 fg-market-app (192.168.86.199)", "grading API :8084, grading-vision, grading-centering; market tracker API :8080 + worker; GitHub runners", "Runners: fg-grading-lxc109 (grading deploys + centering eval), fg-market-lxc109 (ingests), fg-market-lxc109-deploy. Env: /opt/grading-predictor/runtime.env."],
  ["proxmox3 · LXC 106 pg-market-tracker", "Postgres market_tracker", "The tracker's database (separate app)."],
  ["proxmox4 · LXC 116 agent2 (192.168.86.241)", "AI jobs (hourly cron), usage collector", "cert_reader.py per task from an auto-pulled checkout; claude -p --no-session-persistence (photos would fill the disk otherwise); one run per task at a time (lock)."],
  ["agent1 (192.168.86.240)", "agent worker, usage collector", "Market tracker agent jobs; AI cost collection."],
  ["Synology NAS (192.168.86.162)", "photos", "/volume1/grading-photos via NFS on proxmox3, bind-mounted into LXC 109 as /data/images; 200 GB quota."],
  ["GitHub Pages + Cloudflare", "this site; TLS / proxy for the APIs", "Site built to the gh-pages branch on merge. Cloudflare caps request bodies at 100 MB (batch uploads go one file at a time)."],
  ["Firebase (future-gadget-labs-b7e6b)", "Sign in with Google", "Same project as the admin app and tracker; the API verifies ID tokens and an email allowlist."],
];

function Infra() {
  return (
    <div className="space-y-8">
      <Section title="Where everything runs">
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead className="text-muted text-left"><tr><th className="py-1 pr-3">host</th><th className="pr-3">runs</th><th>notes</th></tr></thead>
            <tbody>{HOSTS.map(([h, r, n]) => (
              <tr key={h} className="border-t border-border align-top"><td className="py-1.5 pr-3 font-semibold">{h}</td><td className="pr-3">{r}</td><td className="text-muted">{n}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </Section>
      <Section title="Deploying">
        <div className="text-xs text-muted space-y-1 bg-surface border border-border rounded-md p-3 leading-relaxed">
          <div><b className="text-[#e6edf3]">Migrations first:</b> a PR with a migration gets a paste-ready command, run on LXC 102 as postgres before merging (no goose table; SQL is idempotent).</div>
          <div><b className="text-[#e6edf3]">Backend + workers:</b> merge to master → "Test &amp; deploy" on the self-hosted runner on LXC 109 builds the API and vision images and restarts the three containers. PRs touching vision/centering also run "Centering eval" against the golden set.</div>
          <div><b className="text-[#e6edf3]">Frontend:</b> merge to master → build pushed to the gh-pages branch, Pages serves it.</div>
          <div><b className="text-[#e6edf3]">AI jobs:</b> agent2's crons git-pull the backend checkout before each run; settings (on/off, copies per run) live on the Settings page.</div>
        </div>
      </Section>
      <Section title="Auth">
        <div className="text-xs text-muted bg-surface border border-border rounded-md p-3 leading-relaxed space-y-1">
          <div>People: Sign in with Google (Firebase); allowlisted emails act as admin on any device. The pasted API token still works as a fallback.</div>
          <div>Machines: ADMIN_API_TOKEN (AI jobs, tracker) and ADMIN_APP_API_TOKEN (admin app: predict, outcomes, feed only). Never in the site's build: the bundle is public.</div>
          <div>Private copies (in-hand scans) answer 404 without auth.</div>
        </div>
      </Section>
      <Section title="Known risks & backlog" lead="From incidents; details in infra/docs/backlog.md.">
        <ul className="text-xs space-y-1.5 list-disc pl-5">
          <li><b>No database backups.</b> grading_predictor exists only on LXC 102's disk. Planned: nightly pg_dump to the NAS, 14 days kept, restore tested.</li>
          <li><b>No disk alerts.</b> LXC 102 filled on 2026-11-15 and the API returned 500s. Planned: warn above 80% on the hardware panel.</li>
          <li><b>proxmox3 reboots on network stalls.</b> HA fencing plus a Realtek NIC (r8169) took LXC 109 down twice on 2026-11-12; fix the NIC driver and drop unneeded HA resources.</li>
          <li><b>Live database stays on local disk.</b> Postgres over NFS is slow and unsafe on network blips; the NAS is for photos and backups.</li>
        </ul>
      </Section>
      <Section title="Live usage"><InfraPanel /></Section>
    </div>
  );
}

// ── Decisions ────────────────────────────────────────────────────────────────

const DECISIONS: [string, string][] = [
  ["Originals + vectors, not derived images", "Photos are stored once (sha256 in the name). A measurement is four corner points, border widths in mm and the ratios; the straightened card is recomputed when needed."],
  ["Machine first, person second, both kept", "copy_triage keeps the worker's picks next to the reviewer's. centering_measurements is append-only: an adjustment is a new row that supersedes the engine's, which is kept. Review steps keep an event log."],
  ["Versioned, reproducible engines", "Every automatic measurement carries detector_version. A new version must beat the old one against people's adjustments (Centering eval) and never touches an accepted measurement."],
  ["AI for judgement, not for measurements", "AI reads labels, picks photos and judges defects, with a confidence; centering stays deterministic. Confident AI answers act automatically, audited and reversible (Factory → auto actions)."],
  ["Collect wide, check a sample", "Caps per card + grade (40; 100 for valuable PSA 10/9) for data; AI checks and review only on a 15-copy sample per group, the rest train at their automatic weight."],
  ["Polite collection", "Only allowlisted public image CDNs, one request at a time, backoff on 429/5xx, an honest user agent. No cert-site scraping."],
  ["Reports state their limits", "Listing mix isn't a gem rate; 9 means 'not a 10'; a flat zone narrower than the measuring error can't be resolved. Every refresh is recorded so a thesis can be watched."],
  ["Live data local, bulk data on the NAS", "Postgres on local disk; photos (and soon backups) on the Synology."],
];

function Decisions() {
  return (
    <Section title="Decisions & rules" lead="The rules future changes should keep, and why.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DECISIONS.map(([t, d]) => (
          <div key={t} className="bg-surface border border-border rounded-md p-3 text-xs space-y-1">
            <div className="font-semibold">{t}</div><div className="text-muted leading-relaxed">{d}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Costs() {
  return (
    <Section title="Operating costs">
      <AICostPanel />
      <div className="text-[10px] text-muted">
        AI jobs log token usage per call; tools/ai_usage_collect.py on each agent machine uploads it hourly. Coding sessions are counted too.
      </div>
      <InfraPanel />
    </Section>
  );
}
