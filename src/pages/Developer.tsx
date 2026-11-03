// Developer tab: how the grading predictor is put together. Static on
// purpose: it documents the design; live numbers are on the Factory tab.

type Box = { title: string; where: string; lines: string[]; tone?: "ext" | "store" | "worker" | "api" | "ui" };

const TONE: Record<NonNullable<Box["tone"]>, string> = {
  ext: "border-border",
  store: "border-yellow/50",
  worker: "border-purple/60",
  api: "border-accent/60",
  ui: "border-green/50",
};

function B({ b }: { b: Box }) {
  return (
    <div className={`bg-surface border rounded-md p-3 ${TONE[b.tone ?? "ext"]}`}>
      <div className="text-sm font-semibold">{b.title}</div>
      <div className="text-[10px] text-muted mb-1">{b.where}</div>
      <ul className="text-[11px] text-muted space-y-0.5 list-disc pl-4">
        {b.lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-[10px] text-muted py-1">
      <span className="text-accent">↓</span>{label}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-widest text-muted mb-3">{title}</h2>
      {children}
    </section>
  );
}

export default function Developer() {
  return (
    <div className="space-y-10 max-w-6xl">
      <div>
        <h1 className="text-lg font-semibold">Architecture</h1>
        <p className="text-muted text-xs mt-1 max-w-3xl">
          The grading predictor turns graded copies found on marketplaces into a measured dataset (photos, cert, centering
          now; defects later) so we can see where grades actually break and estimate true gem rates for raw cards.
          Machines do each step first; a person reviews what they flag. Repos: grading-predictor-backend (Go API +
          Python vision workers) and grading-predictor-frontend (this site).
        </p>
      </div>

      <Section title="System map">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <B b={{ title: "Market tracker", where: "market-tracker-backend (separate app)", tone: "ext", lines: [
            "GET /v1/tracked/catalog: every tracked card",
            "GET /v1/graded-copies/feed: graded eBay + Fanatics listings (cursor, token)",
            "scrapes listings; we only read its feed",
          ] }} />
          <B b={{ title: "Marketplaces", where: "eBay image CDN, Fanatics vault CDN", tone: "ext", lines: [
            "listing photos (eBay s-l1600, Fanatics 'large' scans)",
            "fetched politely: allowlisted hosts, one shared rate limit, honest user agent",
          ] }} />
          <B b={{ title: "Catalog images", where: "PriceCharting / tcgdex", tone: "ext", lines: [
            "the card's own front: reference for matching",
            "cards without one learn it from a reviewed copy",
          ] }} />
        </div>
        <Arrow label="catalog sync (6 h) + feed poll · photo downloads" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <B b={{ title: "Grading API", where: "Go · container grading-predictor-backend · LXC 109 :8084 · grading-api.futuregadgetlabs.com", tone: "api", lines: [
            "ingester: catalog sync, feed → copies + photo candidates",
            "copies / review / centering endpoints, factory stats",
            "serves stored photos (/v1/images); writes need the admin token",
          ] }} />
          <B b={{ title: "Triage worker", where: "Python + OpenCV + zxing · container grading-vision", tone: "worker", lines: [
            "stage 2: label listing photos, pick front + back, read cert",
            "balanced queue: round-robin over each card's grades",
            "reviewer corrections jump the queue",
          ] }} />
          <B b={{ title: "Centering worker", where: "Python + OpenCV · container grading-centering", tone: "worker", lines: [
            "stage 3: outer edge, rectify, inner border, ratios",
            "every row stamped with the engine version",
            "re-measures replaced photos and newly seedable fronts",
          ] }} />
        </div>
        <Arrow label="reads / writes" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <B b={{ title: "Postgres", where: "grading_predictor · LXC 102 (pg-slab-cracker)", tone: "store", lines: [
            "cards, certifications (= copies), cert_images",
            "feed_photos, copy_triage, centering_measurements",
            "migrations applied by hand (no goose table)",
          ] }} />
          <B b={{ title: "Photo storage", where: "Synology NAS → NFS on proxmox3 → bind mount into LXC 109", tone: "store", lines: [
            "/volume1/grading-photos (200 GB quota), backup off",
            "copies/<id>/<side>-<sha>.jpg, refs/<card>.img",
            "workers refuse to write unless the NAS marker file exists",
          ] }} />
          <B b={{ title: "This site", where: "React + Vite · GitHub Pages · grading.futuregadgetlabs.com", tone: "ui", lines: [
            "Analytics: cards → copies",
            "Factory: stage counts, queues, review + centering editor",
            "the centering editor straightens cards in the browser",
          ] }} />
        </div>
      </Section>

      <Section title="The pipeline (one graded copy)">
        <ol className="space-y-2 text-xs">
          {[
            ["Listing", "The feed gives grader, grade, title, cert # when the listing has it, and every photo URL. One copy per listing (stable id ebay:<item> / fanatics:<uuid>); at most 40 copies per card and grade are processed."],
            ["Photo triage", "Each photo's thumbnail is matched (SIFT + RANSAC homography) against the card's catalog image and a card back (English and Japanese backs differ). The homography says whether the whole card is in frame and how big. Best front and back are downloaded full size. Certs come from PSA/CGC QR codes and label barcodes; DataBar is ignored (holo foil produces phantom reads). Fanatics: fixed order, no matching needed. Unsure → flagged for review."],
            ["Centering", "Seed the card outline by matching the catalog image (front) or card back. Snap each side to a straight edge, keeping up to three candidates per side; pick the combination that's card-shaped (63 x 88 mm) and the inner one (a slab's well is ~1 mm bigger all round). Straighten, find the border-to-print transition on each side, compute left/right and top/bottom with a ± from the fit."],
            ["Review", "Triage: confirm or re-pick front/back, fix the cert, mark unusable. Centering: drag corners and border lines (zoom, 1-pixel nudges), accept, adjust or mark unmeasurable, tag why."],
            ["Later", "Defects (surface, corners, edges), then the backtest: centering and defects vs PSA 10/9 outcome per card."],
          ].map(([t, d], i) => (
            <li key={t} className="bg-surface border border-border rounded-md p-3">
              <span className="text-accent font-mono mr-2">{i + 1}</span>
              <span className="font-semibold">{t}</span>
              <div className="text-[11px] text-muted mt-1">{d}</div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Data rules">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-muted">
          <div className="bg-surface border border-border rounded-md p-3 space-y-1">
            <div className="text-xs text-[#e6edf3] font-semibold">Originals + vectors, not derived images</div>
            <div>Photos are stored once (sha256 in the name). A measurement is the four corner points, the border widths in mm and the ratios; the straightened card is recomputed from those whenever it's needed.</div>
          </div>
          <div className="bg-surface border border-border rounded-md p-3 space-y-1">
            <div className="text-xs text-[#e6edf3] font-semibold">Machine first, person second, both kept</div>
            <div>copy_triage keeps the worker's picks (auto_*) next to the reviewer's (forced_*). centering_measurements is append-only: an adjustment is a new row (placed_by user:…, supersedes the engine's row, same engine version). The pairs are the tuning data.</div>
          </div>
          <div className="bg-surface border border-border rounded-md p-3 space-y-1">
            <div className="text-xs text-[#e6edf3] font-semibold">Versioned engines</div>
            <div>Every automatic measurement carries detector_version. A new version measures the same photos again as new rows and must beat the previous version against the human adjustments; it never touches an accepted or adjusted measurement.</div>
          </div>
          <div className="bg-surface border border-border rounded-md p-3 space-y-1">
            <div className="text-xs text-[#e6edf3] font-semibold">Polite collection</div>
            <div>Only public image CDNs on an allowlist, one request at a time with a fixed interval, backoff on 429/5xx, an honest user agent. No cert-site scraping (PSA/CGC lookups are done by hand when needed).</div>
          </div>
        </div>
      </Section>

      <Section title="Deploying">
        <div className="text-[11px] text-muted space-y-1 bg-surface border border-border rounded-md p-3">
          <div>Frontend: merge to master → GitHub Pages builds and publishes.</div>
          <div>Backend + workers: no CI yet. Merge, apply the migration on LXC 102 as postgres, copy the source to LXC 109 (git archive), rebuild the two images and restart grading-predictor-backend, grading-vision and grading-centering.</div>
          <div>Health: /v1/ingest/status and the Factory tab (each worker reports running or why it paused).</div>
        </div>
      </Section>
    </div>
  );
}
