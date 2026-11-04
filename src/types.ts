export interface Card {
  id: number;
  game: string;
  set_code: string;
  set_name: string;
  card_name: string;
  card_number: string;
  created_at: string;
  cert_count: number;
  psa10_count: number;
  psa9_count: number;
  image_url: string | null;
  market_display_key: string | null;
}

export interface CardDetail {
  id: number;
  game: string;
  set_code: string;
  set_name: string;
  card_name: string;
  card_number: string;
  created_at: string;
  image_url: string | null;
  market_display_key: string | null;
}

export interface CertRow {
  id: number;
  card_id: number;
  cert_number: string;
  grader: string;
  grade_received: number | null;
  graded_at: string | null;
  notes: string | null;
  category: CertCategory;
  purpose: CertPurpose;
  created_at: string;
  grade: number | null;
  grade_label: GradeLabel | null;
  source: CopySource;
  source_ref: string | null;
  front_image: string | null;
  back_image: string | null;
  centering_front_lr: number | null;
  centering_front_tb: number | null;
  centering_back_lr: number | null;
  centering_back_tb: number | null;
  surface_front: SurfaceGrade | null;
  surface_back: SurfaceGrade | null;
  corner_tl: CornerGrade | null;
  corner_tr: CornerGrade | null;
  corner_bl: CornerGrade | null;
  corner_br: CornerGrade | null;
  edge_top: EdgeGrade | null;
  edge_bottom: EdgeGrade | null;
  edge_left: EdgeGrade | null;
  edge_right: EdgeGrade | null;
  inspection_source: "manual" | "auto" | null;
}

export interface InspectionRow {
  id: number;
  cert_id: number;
  centering_front_lr: number | null;
  centering_front_tb: number | null;
  centering_front_rotation: number | null;
  centering_back_lr: number | null;
  centering_back_tb: number | null;
  centering_back_rotation: number | null;
  surface_front: SurfaceGrade | null;
  surface_back: SurfaceGrade | null;
  corner_tl: CornerGrade | null;
  corner_tr: CornerGrade | null;
  corner_bl: CornerGrade | null;
  corner_br: CornerGrade | null;
  edge_top: EdgeGrade | null;
  edge_bottom: EdgeGrade | null;
  edge_left: EdgeGrade | null;
  edge_right: EdgeGrade | null;
  notes: string | null;
  source: "manual" | "auto";
  created_at: string;
  corners_defective_cut: number | null;
  corners_major_whitening: number | null;
  corners_minor_whitening: number | null;
  corners_micro_whitening: number | null;
  edges_whitening: number | null;
  surface_dead_pixels: number | null;
  surface_dimples: number | null;
  surface_print_lines: number | null;
}

export interface StatRow {
  centering_bucket: "centered" | "near_centered" | "off_center";
  surface_front: string;
  surface_back: string;
  grade_received: number | null;
  count: number;
}

export type SurfaceGrade = "clean" | "light_scratch" | "heavy_scratch" | "print_line" | "print_dot";
export type CornerGrade = "sharp" | "light_wear" | "heavy_wear";
export type EdgeGrade = "clean" | "light_wear" | "heavy_wear" | "nick";
export type CertCategory = "raw" | "psa9" | "psa10" | "cgc9" | "cgc10" | "bgs9" | "bgs9pt5" | "bgs10" | "graded";
export type GradeLabel = "pristine" | "black_label" | "flawless";
export type CopySource = "manual" | "owned" | "ebay" | "fanatics" | "consigner" | "other";
export type CertPurpose = "analytics" | "grading_tracker" | "buy_and_grade" | "crack_and_regrade" | "backtest";

export interface CertFullDetail {
  id: number;
  card_id: number;
  cert_number: string;
  grader: string;
  grade_received: number | null;
  graded_at: string | null;
  notes: string | null;
  category: CertCategory;
  purpose: CertPurpose;
  created_at: string;
  grade: number | null;
  grade_label: GradeLabel | null;
  source: CopySource;
  source_ref: string | null;
  front_image: string | null;
  back_image: string | null;
}

export interface CreateCardRequest {
  game: string;
  set_code: string;
  set_name: string;
  card_name: string;
  card_number: string;
  image_url?: string;
  market_display_key?: string;
}

export interface CreateCertRequest {
  card_id: number;
  cert_number?: string;
  grader?: string;
  notes?: string;
  category?: CertCategory;
  purpose?: CertPurpose;
  grade?: number | null;
  grade_label?: GradeLabel | null;
  source?: CopySource;
  source_ref?: string | null;
  regrade_of?: number | null;
}

export interface CopyGradeCount {
  grader: string;
  grade: number | null;
  grade_label: GradeLabel | null;
  copies: number;
  both_photos: number;
}

export interface CopiesSummary {
  card_id: number;
  copies: number;
  both_photos: number;
  by_grade: CopyGradeCount[];
}

export interface CreateInspectionRequest {
  centering_front_lr?: number | null;
  centering_front_tb?: number | null;
  centering_front_rotation?: number | null;
  centering_back_lr?: number | null;
  centering_back_tb?: number | null;
  centering_back_rotation?: number | null;
  surface_front?: SurfaceGrade | null;
  surface_back?: SurfaceGrade | null;
  corner_tl?: CornerGrade | null;
  corner_tr?: CornerGrade | null;
  corner_bl?: CornerGrade | null;
  corner_br?: CornerGrade | null;
  edge_top?: EdgeGrade | null;
  edge_bottom?: EdgeGrade | null;
  edge_left?: EdgeGrade | null;
  edge_right?: EdgeGrade | null;
  notes?: string;
  source?: "manual" | "auto";
  corners_defective_cut?: number | null;
  corners_major_whitening?: number | null;
  corners_minor_whitening?: number | null;
  corners_micro_whitening?: number | null;
  edges_whitening?: number | null;
  surface_dead_pixels?: number | null;
  surface_dimples?: number | null;
  surface_print_lines?: number | null;
}

// Market tracker types (from market.futuregadgetlabs.com)
export interface GradedSnapshot {
  company: string;
  grade: string;
  data_source: string;
  week_start_date: string;
  market_price_cents: number | null;
  last_sale_cents: number | null;
  pop_count: number | null;
  pop_total: number | null;
  gem_rate_pct: number | null;
}

export interface GradedMarketData {
  display_key: string;
  snapshots: GradedSnapshot[];
}

export interface GemRateRow {
  company: string;
  grade: string;
  pop_count: number | null;
  pop_total: number | null;
  gem_rate_pct: number | null;
  week: string;
}

export interface GemRateData {
  display_key: string;
  gem_rates: GemRateRow[];
}

// ── Copies browser / triage review ───────────────────────────────────────────

export type TriageStatus = "pending" | "working" | "done" | "needs_ai" | "failed" | "skipped";
export type ReviewVerdict = "ok" | "fixed" | "unusable";

export interface CopyRow {
  id: number;
  card_id: number;
  card_name: string;
  set_name: string;
  card_number: string;
  language: string | null;
  grader: string;
  grade: number | null;
  grade_label: GradeLabel | null;
  cert_number: string;
  source: string;
  source_ref: string | null;
  source_title: string | null;
  triage_status: TriageStatus | null;
  cert_source: "feed" | "qr" | "barcode" | "ai" | "manual" | null;
  flags: string[];
  needs_review: boolean;
  verdict: ReviewVerdict | null;
  reviewed_at: string | null;
  front_image: string | null;
  back_image: string | null;
  updated_at: string;
  front_centering: CenteringBrief | null;
  back_centering: CenteringBrief | null;
}

export interface CopyList {
  items: CopyRow[];
  total: number;
  counts?: { needs_review: number; unreviewed: number; reviewed: number; both_photos: number };
}

export interface CopyPhoto {
  position: number;
  url: string;
  thumb_url: string;
  status: string;
  label: "front" | "back" | "closeup" | "other" | null;
  score: number | null;
  side: "front" | "back" | null;
}

export interface CopyTriage {
  status: TriageStatus;
  front_pos: number | null;
  back_pos: number | null;
  auto_front_pos: number | null;
  auto_back_pos: number | null;
  forced_front_pos: number | null;
  forced_back_pos: number | null;
  cert_source: string | null;
  detail: { flags?: string[]; photos?: Record<string, { label: string; score: number; front_inliers: number; back_inliers: number } | null>; codes?: { fmt: string; text: string }[]; error?: string } | null;
  attempts: number;
  verdict: ReviewVerdict | null;
  review_tags: string[];
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string;
}

export interface CopyDetail extends CopyRow {
  /** state per factory station: queued | high | medium | low | reviewed | removed | n/a | upstream */
  stations?: Record<string, string>;
  photos: CopyPhoto[];
  triage: CopyTriage | null;
  card: CardDetail;
}

export interface ReviewRequest {
  verdict: ReviewVerdict;
  front_pos?: number;
  back_pos?: number;
  cert_number?: string;
  tags: string[];
  note: string;
}

// ── Centering (pipeline stage 2) ─────────────────────────────────────────────

export type Quad = [[number, number], [number, number], [number, number], [number, number]];
export type InnerMM = { left: number; right: number; top: number; bottom: number };

export interface CenteringMeasurement {
  id: number;
  image_id: number;
  side: "front" | "back";
  image_sha256: string | null;
  supersedes: number | null;
  outer_quad: Quad | null;
  px_per_mm: number | null;
  inner_mm: InnerMM | null;
  lr_left_pct: number | null;
  tb_top_pct: number | null;
  lr_err_pp: number | null;
  tb_err_pp: number | null;
  rotation_deg: number | null;
  placed_by: string;
  detector_version: string;
  status: "proposed" | "accepted" | "superseded" | "rejected";
  flags: string[];
  tags: string[];
  note: string | null;
  created_at: string;
}

export interface CenteringBrief {
  lr: number | null;
  tb: number | null;
  status: "proposed" | "accepted";
  placed_by: string;
  version: string;
}

export interface CenteringAction {
  action: "accept" | "adjust" | "reject";
  base_id: number;
  outer_quad?: Quad;
  inner_mm?: InnerMM;
  tags: string[];
  note: string;
}

// ── Factory / ingest status ──────────────────────────────────────────────────

export interface IngestStatus {
  enabled: boolean;
  feed_configured?: boolean;
  triage?: Record<string, number>;
  triage_paused?: string;
  triage_last_run?: string;
  centering?: Record<string, number>;
  centering_paused?: string;
  centering_last_run?: string;
  cards_synced?: number;
  catalog_synced_at?: string;
  feed_last_run?: string;
  feed_copies?: number;
  photos?: Record<string, number>;
  photo_bytes?: number;
  photo_budget_bytes?: number;
  free_bytes?: number;
}

export interface VersionFeedback {
  version: string;
  auto: number;
  accepted_as_is: number;
  adjusted: number;
  rejected: number;
  tags: Record<string, number>;
  side_err_mm: Record<"left" | "right" | "top" | "bottom", number | null>;
  outer_err_px: number | null;
  lr_err_pp: number | null;
  tb_err_pp: number | null;
  within_1pp: number | null;
}

export interface FactoryStats {
  listings: { copies: number; feed_copies: number; with_cert: number; cert_sources: Record<string, number>; by_source: Record<string, number> };
  triage: { status: Record<string, number>; needs_review: number; reviewed: Record<string, number>; both_photos: number };
  centering: {
    status: Record<string, number>; current: Record<string, number>; unseeded: number; versions: string[] | null;
    back_templates?: string[]; front_templates?: number;
  };
  feedback: VersionFeedback[];
}

// ── AI operating cost ────────────────────────────────────────────────────────

export interface AIUsageRow {
  day: string;
  machine: string;
  account: string;
  workspace: string;
  model: string;
  purpose: string;   // repo a coding session worked in, or job:<name> for pipeline jobs
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_write_5m: number;
  cache_write_1h: number;
  cache_read: number;
  api_cost_usd: number;
}

export interface AIUsageSummary {
  rows: AIUsageRow[];
  subscription_usd_monthly: number;
  month_to_date_api_usd: number;
  last_30_days_api_usd: number;
  month_start: string;
  days_in_month: number;
  day_of_month: number;
  last_updated: string | null;
}

// ── Step-by-step review ──────────────────────────────────────────────────────

export type StepId = "card" | "listing" | "cert" | "photos" | "front_outer" | "front_inner" | "back_outer" | "back_inner" | "corners" | "edges" | "complete";
export type StepDecision = "approved" | "fixed" | "rejected" | "skipped";

export interface ReviewStepState {
  step: StepId;
  decision: StepDecision;
  note: string | null;
  tags: string[];
  decided_by: string;
  decided_at: string;
}

export interface ReviewEvent {
  id: number;
  cert_id: number;
  step: StepId;
  decision: StepDecision;
  note: string | null;
  tags: string[];
  payload: Record<string, unknown> | null;
  decided_by: string;
  created_at: string;
  card_name?: string;
  grader?: string;
  grade?: number | null;
  front_image?: string | null;
}

export interface ReviewSteps {
  order: StepId[];
  steps: ReviewStepState[];
  events: ReviewEvent[];
}

// ── Factory stations ─────────────────────────────────────────────────────────

export type StationId = "card" | "grade" | "cert" | "photos" | "front" | "back";
export type StationState = "upstream" | "queued" | "high" | "medium" | "low" | "reviewed" | "removed" | "n/a";

export interface StationStats {
  id: StationId;
  label: string;
  states: Partial<Record<StationState, number>>;
  added_per_day: number;
  processed_per_day: number;
  reviewed_per_day: number;
}
