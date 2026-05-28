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
}

export interface CardDetail {
  id: number;
  game: string;
  set_code: string;
  set_name: string;
  card_name: string;
  card_number: string;
  created_at: string;
}

export interface CertRow {
  id: number;
  card_id: number;
  cert_number: string;
  grader: string;
  grade_received: number | null;
  graded_at: string | null;
  notes: string | null;
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

export interface CreateCardRequest {
  game: string;
  set_code: string;
  set_name: string;
  card_name: string;
  card_number: string;
}

export interface CreateCertRequest {
  card_id: number;
  cert_number: string;
  grader?: string;
  notes?: string;
}

export interface CreateInspectionRequest {
  centering_front_lr?: number | null;
  centering_front_tb?: number | null;
  centering_back_lr?: number | null;
  centering_back_tb?: number | null;
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
