import type {
  Card,
  CardDetail,
  CertRow,
  CertFullDetail,
  InspectionRow,
  StatRow,
  CreateCardRequest,
  CreateCertRequest,
  CreateInspectionRequest,
  GradedMarketData,
  GemRateData,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8084";
const TOKEN = import.meta.env.VITE_API_TOKEN ?? "";
const MARKET_BASE = import.meta.env.VITE_MARKET_API_URL ?? "https://market.futuregadgetlabs.com";

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

  createCert: (req: CreateCertRequest) => post<{ id: number; cert_number: string }>("/v1/certs", req),
  getCert: (id: number) => get<CertFullDetail>(`/v1/certs/${id}`),
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

  createInspection: (certId: number, req: CreateInspectionRequest) =>
    post<InspectionRow>(`/v1/certs/${certId}/inspections`, req),
  listInspections: (certId: number) => get<InspectionRow[]>(`/v1/certs/${certId}/inspections`),

  // Market tracker (read-only, no auth needed)
  getGradedMarket: (displayKey: string) =>
    marketGet<GradedMarketData>(`/v1/cards/${encodeURIComponent(displayKey)}/graded`),
  getGemRate: (displayKey: string) =>
    marketGet<GemRateData>(`/v1/cards/${encodeURIComponent(displayKey)}/gem-rate`),
};
