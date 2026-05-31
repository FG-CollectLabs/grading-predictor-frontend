// Ported from slab-cracker-frontend/src/autoEdge.ts
// Detects the card boundary within a slab scan image by analyzing grayscale variance.

export interface EdgeBox {
  x1: number; y1: number; x2: number; y2: number;
}

export function autoDetectCardEdge(img: HTMLImageElement): EdgeBox | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < 50 || h < 50) return null;

  const maxDim = 600;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));

  const off = document.createElement("canvas");
  off.width = sw; off.height = sh;
  const ctx = off.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;

  const gray = new Uint8ClampedArray(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    const r = data[i * 4]!; const g = data[i * 4 + 1]!; const b = data[i * 4 + 2]!;
    gray[i] = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
  }

  const rowVar = (y: number) => variance(gray.subarray(y * sw, y * sw + sw));
  const colVar = (x: number) => {
    const col = new Uint8ClampedArray(sh);
    for (let y = 0; y < sh; y++) col[y] = gray[y * sw + x]!;
    return variance(col);
  };

  const cornerThresh = Math.max(rowVar(0), rowVar(sh - 1), colVar(0), colVar(sw - 1));
  const trigger = Math.max(120, cornerThresh * 4);

  const top    = scanEdge(rowVar, 0, sh - 1, 1,  trigger);
  const bottom = scanEdge(rowVar, sh - 1, 0, -1, trigger);
  const left   = scanEdge(colVar, 0, sw - 1, 1,  trigger);
  const right  = scanEdge(colVar, sw - 1, 0, -1, trigger);

  if (top === null || bottom === null || left === null || right === null) return null;
  if (bottom - top < sh * 0.3 || right - left < sw * 0.3) return null;

  const inv = 1 / scale;
  return {
    x1: Math.round(left * inv),
    y1: Math.round(top * inv),
    x2: Math.round(right * inv),
    y2: Math.round(bottom * inv),
  };
}

function scanEdge(
  varAt: (i: number) => number,
  start: number, end: number, step: number, threshold: number,
): number | null {
  let streak = 0;
  for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
    if (varAt(i) >= threshold) {
      if (++streak >= 3) return i - step * 2;
    } else {
      streak = 0;
    }
  }
  return null;
}

function variance(arr: Uint8ClampedArray): number {
  if (arr.length === 0) return 0;
  let mean = 0;
  for (let i = 0; i < arr.length; i++) mean += arr[i]!;
  mean /= arr.length;
  let v = 0;
  for (let i = 0; i < arr.length; i++) { const d = arr[i]! - mean; v += d * d; }
  return v / arr.length;
}
