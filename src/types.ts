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
export type CertCategory = "raw" | "psa9" | "psa10" | "cgc9" | "cgc10" | "bgs9" | "bgs9pt5" | "bgs10";
export type CertPurpose = "analytics" | "grading_tracker" | "buy_and_grade" | "crack_and_regrade";

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
  cert_number: string;
  grader?: string;
  notes?: string;
  category?: CertCategory;
  purpose?: CertPurpose;
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
