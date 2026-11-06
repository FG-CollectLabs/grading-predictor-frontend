import type {
  CenteringAnalytics, CenteringOdds, CardHit, SettingValue,
  Card,
  CardDetail,
  CertRow,
  CertFullDetail,
  CertCategory,
  CertPurpose,
  InspectionRow,
  StatRow,
  CreateCardRequest,
  CreateCertRequest,
  CreateInspectionRequest,
  GradedMarketData,
  GemRateData,
  CopiesSummary,
  CopyList,
  CopyDetail,
  ReviewRequest,
  CenteringMeasurement,
  CenteringAction,
  IngestStatus,
  FactoryStats,
  AIUsageSummary,
  StationStats,
  RefQueueItem,
  TemplateTask,
  AIJob,
  SetSummary,
  SetCard,
  CardAnalytics,
  Prediction,
  ReviewSteps,
  ReviewEvent,
  StepId,
  StepDecision,
  InfraSummary,
  Setting,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8084";
const TOKEN = import.meta.env.VITE_API_TOKEN ?? "";
const MARKET_BASE = import.meta.env.VITE_MARKET_API_URL ?? "https://market.futuregadgetlabs.com";

/** URL of a stored photo (a path under the API's image directory). */
export function imageUrl(path: string): string {
  const base = import.meta.env.VITE_GCS_PUBLIC_BASE || `${BASE}/v1/images`;
  return `${base}/${path}`;
}

function authHeaders(): HeadersInit {
  return TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `POST ${path}: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `PATCH ${path}: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function marketGet<T>(path: string): Promise<T> {
  const res = await fetch(`${MARKET_BASE}${path}`);
  if (!res.ok) throw new Error(`market GET ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  listCards: () => get<Card[]>("/v1/cards"),
  getCard: (id: number) => get<CardDetail>(`/v1/cards/${id}`),
  getCardStats: (id: number) => get<StatRow[]>(`/v1/cards/${id}/stats`),
  listCertsForCard: (id: number) => get<CertRow[]>(`/v1/cards/${id}/certs`),
  createCard: (req: CreateCardRequest) => post<CardDetail>("/v1/cards", req),
  patchCard: (id: number, req: CreateCardRequest) => patch<CardDetail>(`/v1/cards/${id}`, req),
  getSettings: () => get<{ settings: Setting[] }>(`/v1/settings`),
  saveSettings: (changes: Record<string, SettingValue | null>) => patch<{ settings: Setting[] }>(`/v1/settings`, changes),
  deleteCard: async (id: number) => {
    const res = await fetch(`${BASE}/v1/cards/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`DELETE /v1/cards/${id}: ${res.status}`);
  },
  uploadCardImage: async (cardId: number, file: File) => {
    const form = new FormData();
    form.append("image", file);
    const res = await fetch(`${BASE}/v1/cards/${cardId}/image`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) throw new Error(`card image upload: ${res.status}`);
    return res.json();
  },

  checkCertNumber: (certNumber: string) =>
    get<{ exists: boolean; cert_id?: number; card_id?: number; grader?: string; category?: string }>(`/v1/certs/check?cert_number=${encodeURIComponent(certNumber)}`),
  createCert: (req: CreateCertRequest) => post<{ id: number; cert_number: string }>("/v1/certs", req),
  /** The card linked to a market-tracker display_key, or null when none is. */
  getCardByMarketKey: async (key: string): Promise<CardDetail | null> => {
    const res = await fetch(`${BASE}/v1/cards/by-market-key?key=${encodeURIComponent(key)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET by-market-key: ${res.status}`);
    return res.json() as Promise<CardDetail>;
  },
  getCopies: (cardId: number) => get<CopiesSummary>(`/v1/cards/${cardId}/copies`),
  getCert: (id: number) => get<CertFullDetail>(`/v1/certs/${id}`),
  deleteCert: async (id: number) => {
    const res = await fetch(`${BASE}/v1/certs/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`DELETE /v1/certs/${id}: ${res.status}`);
  },
  patchCert: (id: number, req: {
    cert_number: string; grader: string; notes: string;
    category: string; purpose: string;
    grade_received?: number | null; graded_at?: string;
  }) => patch<{ id: number; cert_number: string; grader: string; notes: string | null; category: CertCategory; purpose: CertPurpose; grade_received: number | null; graded_at: string | null }>(`/v1/certs/${id}`, req),

  setCertGrade: (id: number, grade: number, graded_at?: string) =>
    patch<{ id: number }>(`/v1/certs/${id}/grade`, { grade, graded_at }),

  uploadCertImage: async (certId: number, side: "front" | "back", file: File) => {
    const form = new FormData();
    form.append("side", side);
    form.append("image", file);
    const res = await fetch(`${BASE}/v1/certs/${certId}/images`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) throw new Error(`image upload: ${res.status}`);
    return res.json();
  },

  /** A grader's scan by its address (PSA's scan host only; fetched by the API at full size). */
  uploadCertImageFromUrl: (certId: number, side: "front" | "back", url: string) =>
    post<unknown>(`/v1/certs/${certId}/images/from-url`, { side, url }),

  createInspection: (certId: number, req: CreateInspectionRequest) =>
    post<InspectionRow>(`/v1/certs/${certId}/inspections`, req),
  listInspections: (certId: number) => get<InspectionRow[]>(`/v1/certs/${certId}/inspections`),

  getIngestStatus: () => get<IngestStatus>("/v1/ingest/status"),
  getFactory: () => get<FactoryStats>("/v1/factory"),
  getSets: (language: string) =>
    get<{ sets: SetSummary[]; languages: Record<string, number>; eras: string[]; as_of: string }>(`/v1/analytics/sets?game=pokemon${language ? `&language=${language}` : ""}`),
  getSetCards: (code: string, language: string) =>
    get<{ cards: SetCard[] }>(`/v1/analytics/sets/${encodeURIComponent(code)}/cards?language=${language}`),
  getCardAnalytics: (id: number) => get<CardAnalytics>(`/v1/analytics/cards/${id}`),
  getCenteringAnalytics: (p: URLSearchParams) => get<CenteringAnalytics>(`/v1/analytics/centering?${p.toString()}`),
  searchCards: (q: string) => get<{ cards: CardHit[] }>(`/v1/analytics/card-search?q=${encodeURIComponent(q)}`),
  getCenteringOdds: (p: URLSearchParams) => get<CenteringOdds>(`/v1/analytics/centering/odds?${p.toString()}`),
  getPrediction: (copyId: number) => get<Prediction>(`/v1/predict/${copyId}`),
  predict: async (cardId: number, front: File, back: File) => {
    const form = new FormData();
    form.append("card_id", String(cardId));
    form.append("front", front);
    form.append("back", back);
    const res = await fetch(`${BASE}/v1/predict`, { method: "POST", headers: authHeaders(), body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message ?? `predict: ${res.status}`);
    }
    return res.json() as Promise<{ copy_id: number; status: string }>;
  },
  getAIJobs: () => get<{ jobs: AIJob[] }>("/v1/ai-jobs"),
  getInfra: () => get<InfraSummary>("/v1/infra"),
  getTemplateQueue: (offset = 0, limit = 50) =>
    get<{ items: TemplateTask[]; total: number; as_of: string }>(`/v1/template-queue?limit=${limit}&offset=${offset}`),
  getReferenceQueue: (state: "missing" | "to_confirm", offset = 0) =>
    get<{ items: RefQueueItem[]; total: number }>(`/v1/reference-queue?state=${state}&limit=50&offset=${offset}`),
  setReference: (cardId: number, body: { confirm?: boolean; reject?: boolean }) =>
    post<{ result: string; requeued: number }>(`/v1/cards/${cardId}/reference`, body),
  uploadReference: async (cardId: number, file: File) => {
    const form = new FormData();
    form.append("image", file);
    const res = await fetch(`${BASE}/v1/cards/${cardId}/reference`, { method: "POST", headers: authHeaders(), body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message ?? `upload: ${res.status}`);
    }
    return res.json() as Promise<{ result: string; requeued: number }>;
  },
  getStations: (fresh = false) => get<{ stations: StationStats[]; as_of?: string }>(`/v1/factory/stations${fresh ? "?fresh=1" : ""}`),
  /** One decision for many copies at a station (same records as reviewing them one by one). */
  bulkReview: (req: { station: string; action: "approve" | "reject" | "remove"; ids: number[]; note?: string; reason?: string }) =>
    post<{ result: string; done: number; skipped: number }>("/v1/copies/bulk-review", req),
  getAIUsage: (days = 45) => get<AIUsageSummary>(`/v1/ai-usage?days=${days}`),
  listCopies: (params: URLSearchParams) => get<CopyList>(`/v1/copies?${params.toString()}`),
  getCopy: (id: number) => get<CopyDetail>(`/v1/copies/${id}`),
  reviewCopy: (id: number, req: ReviewRequest) => post<CopyDetail>(`/v1/copies/${id}/review`, req),
  gradeCorrection: (id: number, g: { grader: string; grade: number; grade_label: string; note: string }) =>
    post<ReviewSteps>(`/v1/copies/${id}/grade-correction`, g),
  reevaluate: (id: number, note = "") => post<{ result: string; cleared_steps: number }>(`/v1/copies/${id}/reevaluate`, { note }),
  getSteps: (id: number) => get<ReviewSteps>(`/v1/copies/${id}/steps`),
  postStep: (id: number, req: { step: StepId; decision: StepDecision; note?: string; tags?: string[]; payload?: Record<string, unknown> }) =>
    post<ReviewSteps>(`/v1/copies/${id}/steps`, req),
  getReviewHistory: (limit = 100, offset = 0) => get<{ events: ReviewEvent[] }>(`/v1/review-history?limit=${limit}&offset=${offset}`),
  getCentering: (id: number) => get<{ measurements: CenteringMeasurement[] }>(`/v1/copies/${id}/centering`),
  postCentering: (id: number, req: CenteringAction) =>
    post<{ id: number; measurements: CenteringMeasurement[] }>(`/v1/copies/${id}/centering`, req),

  // Market tracker (read-only, no auth needed)
  getGradedMarket: (displayKey: string) =>
    marketGet<GradedMarketData>(`/v1/cards/${encodeURIComponent(displayKey)}/graded`),
  getGemRate: (displayKey: string) =>
    marketGet<GemRateData>(`/v1/cards/${encodeURIComponent(displayKey)}/gem-rate`),
};
