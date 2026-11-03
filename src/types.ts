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
