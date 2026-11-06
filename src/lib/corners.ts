// Corner check in the browser: a port of the engine's
// vision/centering/corners.py fit_corners (same constants, same steps), so
// the editor can re-run it on the outline a person is adjusting. The engine
// stays the source of truth: readings stored with a measurement come from
// the Python version (worker), this one only drives the live view.
// Kept in step by scripts/corners-parity (scores both on the same photos).

export type Pt = [number, number];
export type Quad4 = [Pt, Pt, Pt, Pt] | number[][];

export interface CornerFitJS {
  name: "top_left" | "top_right" | "bottom_right" | "bottom_left";
  found: boolean;
  point: Pt | null;
  shift_mm: number;
  arc: number;
  quad_arc: number;
  radius_mm: number | null;
  arc_radius_mm: number | null;
  roundness_rms_mm: number | null;
  whitening: number | null;
  white_spots: number | null;
  flags: string[];
}

const CARD_W = 63, CARD_H = 88;
const WIN_OUT = 4.0, WIN_IN = 10.0, EDGE_FROM = 4.6, EDGE_TO = 9.5, SEARCH = 3.5;
const RADII: number[] = [];
for (let r = 1.8; r < 4.21; r += 0.15) RADII.push(+r.toFixed(4));
const ARC_MIN = 0.45, PRIOR_MM = 2.0, MIN_PPMM = 6.0;
const CORNERS: [Pt, Pt][] = [[[0, 0], [1, 1]], [[CARD_W, 0], [-1, 1]], [[CARD_W, CARD_H], [-1, -1]], [[0, CARD_H], [1, -1]]];
const NAMES = ["top_left", "top_right", "bottom_right", "bottom_left"] as const;
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

// ── homography (card mm -> photo px), like cv2.getPerspectiveTransform ─────
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function perspective(src: Pt[], dst: Pt[]): number[] {
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}
const mul3 = (a: number[], b: number[]) => {
  const o = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return o;
};

// ── colour: 8-bit sRGB -> OpenCV-scaled Lab (L*255/100, a+128, b+128), rounded
const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
const fLab = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
function lab8(r: number, g: number, b: number): [number, number, number] {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const X = (0.412453 * R + 0.35758 * G + 0.180423 * B) / 0.950456;
  const Y = 0.212671 * R + 0.71516 * G + 0.072169 * B;
  const Z = (0.019334 * R + 0.119193 * G + 0.950227 * B) / 1.088754;
  const fy = fLab(Y);
  const L = Y > 0.008856 ? 116 * fy - 16 : 903.3 * Y;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return [clamp((L * 255) / 100), clamp(500 * (fLab(X) - fy) + 128), clamp(200 * (fy - fLab(Z)) + 128)];
}

type Img = { data: Uint8ClampedArray | Uint8Array; width: number; height: number }; // RGBA

/** The corner's window in the top-left frame at s px/mm: Lab planes (3 x n x n). */
function localPatch(img: Img, quad: Pt[], ci: number, s: number) {
  const H = perspective([[0, 0], [CARD_W, 0], [CARD_W, CARD_H], [0, CARD_H]], quad);
  const [[cx, cy], [dx, dy]] = CORNERS[ci];
  const n = Math.round((WIN_OUT + WIN_IN) * s);
  const A = [dx / s, 0, cx - dx * WIN_OUT, 0, dy / s, cy - dy * WIN_OUT, 0, 0, 1];
  const P = mul3(H, A);
  const lab = [new Float32Array(n * n), new Float32Array(n * n), new Float32Array(n * n)];
  const { width: W, height: Hh, data } = img;
  const px = (x: number, y: number, c: number) => data[(Math.min(Hh - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4 + c];
  for (let v = 0; v < n; v++) {
    for (let u = 0; u < n; u++) {
      const w = P[6] * u + P[7] * v + P[8];
      const x = (P[0] * u + P[1] * v + P[2]) / w, y = (P[3] * u + P[4] * v + P[5]) / w;
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const rgb = [0, 1, 2].map((c) => Math.round(
        (px(x0, y0, c) * (1 - fx) + px(x0 + 1, y0, c) * fx) * (1 - fy) + (px(x0, y0 + 1, c) * (1 - fx) + px(x0 + 1, y0 + 1, c) * fx) * fy));
      const L = lab8(rgb[0], rgb[1], rgb[2]);
      lab[0][v * n + u] = L[0]; lab[1][v * n + u] = L[1]; lab[2][v * n + u] = L[2];
    }
  }
  const toPhoto = (a: number, b: number): Pt => {
    const u = (a + WIN_OUT) * s, v = (b + WIN_OUT) * s, w = P[6] * u + P[7] * v + P[8];
    return [(P[0] * u + P[1] * v + P[2]) / w, (P[3] * u + P[4] * v + P[5]) / w];
  };
  return { lab, n, toPhoto };
}

// reflect-101 index, OpenCV's default border for blur and Sobel
const r101 = (i: number, n: number) => (i < 0 ? -i : i >= n ? 2 * n - 2 - i : i);

function gaussian(src: Float32Array, n: number, sigma: number): Float32Array {
  const ks = (Math.round(sigma * 4 * 2 + 1) | 1), h = (ks - 1) / 2;
  const k = new Float32Array(ks);
  let sum = 0;
  for (let i = 0; i < ks; i++) { k[i] = Math.exp(-((i - h) ** 2) / (2 * sigma * sigma)); sum += k[i]; }
  for (let i = 0; i < ks; i++) k[i] /= sum;
  const tmp = new Float32Array(n * n), out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let a = 0; for (let i = 0; i < ks; i++) a += k[i] * src[y * n + r101(x + i - h, n)]; tmp[y * n + x] = a;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let a = 0; for (let i = 0; i < ks; i++) a += k[i] * tmp[r101(y + i - h, n) * n + x]; out[y * n + x] = a;
  }
  return out;
}

function sobel(src: Float32Array, n: number, dx: boolean): Float32Array {
  const out = new Float32Array(n * n);
  const g = (x: number, y: number) => src[r101(y, n) * n + r101(x, n)];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    out[y * n + x] = dx
      ? (g(x + 1, y - 1) - g(x - 1, y - 1)) + 2 * (g(x + 1, y) - g(x - 1, y)) + (g(x + 1, y + 1) - g(x - 1, y + 1))
      : (g(x - 1, y + 1) - g(x - 1, y - 1)) + 2 * (g(x, y + 1) - g(x, y - 1)) + (g(x + 1, y + 1) - g(x + 1, y - 1));
  }
  return out;
}

type Grad = { gx: Float32Array[]; gy: Float32Array[]; n: number };
function gradients(lab: Float32Array[], n: number, s: number): Grad {
  const sig = Math.max(0.6, 0.06 * s), w = [1.0, 1.6, 1.6];
  const sm = lab.map((c) => gaussian(c, n, sig));
  return {
    gx: sm.map((c, i) => sobel(c, n, true).map((v) => v * w[i])),
    gy: sm.map((c, i) => sobel(c, n, false).map((v) => v * w[i])),
    n,
  };
}

// bilinear sample with replicated border (cv2.remap INTER_LINEAR, BORDER_REPLICATE)
function bil(p: Float32Array, n: number, x: number, y: number) {
  const cl = (v: number) => Math.min(n - 1, Math.max(0, v));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const a = p[cl(y0) * n + cl(x0)], b = p[cl(y0) * n + cl(x0 + 1)], c = p[cl(y0 + 1) * n + cl(x0)], d = p[cl(y0 + 1) * n + cl(x0 + 1)];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

function edgeCandidates(g: Float32Array[], n: number, s: number, horizontal: boolean, k = 4): [number, number][] {
  const lo = Math.floor((WIN_OUT + EDGE_FROM) * s), hi = Math.floor((WIN_OUT + EDGE_TO) * s);
  const prof0: number[] = [];
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = lo; j < Math.min(hi, n); j++) {
      const idx = horizontal ? i * n + j : j * n + i;
      sum += Math.abs(g[0][idx]) + Math.abs(g[1][idx]) + Math.abs(g[2][idx]); cnt++;
    }
    prof0.push(cnt ? sum / cnt : 0);
  }
  const a0 = Math.floor((WIN_OUT - SEARCH) * s), a1 = Math.floor((WIN_OUT + SEARCH) * s);
  const start = Math.max(0, a0);
  const prof = prof0.slice(start, a1);
  const out: [number, number][] = [];
  for (let i = 1; i < prof.length - 1; i++) {
    if (prof[i] >= prof[i - 1] && prof[i] >= prof[i + 1]) {
      const d = prof[i - 1] - 2 * prof[i] + prof[i + 1];
      const off = i + (d < 0 ? (0.5 * (prof[i - 1] - prof[i + 1])) / d : 0);
      out.push([(start + off) / s - WIN_OUT, prof[i]]);
    }
  }
  out.sort((x, y) => y[1] - x[1]);
  const top = out.length ? out[0][1] : 0;
  return out.slice(0, k).filter((o) => o[1] >= 0.25 * top);
}

const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y), m = (a.length - 1) / 2; return (a[Math.floor(m)] + a[Math.ceil(m)]) / 2; };
const percentile = (v: number[], q: number) => { const a = [...v].sort((x, y) => x - y), i = (a.length - 1) * q, f = Math.floor(i); return a[f] + (a[Math.min(a.length - 1, f + 1)] - a[f]) * (i - f); };

function arcSupport(G: Grad, s: number, a0: number, b0: number, R: number, ref: number) {
  const ca = a0 + R, cb = b0 + R, vals: number[] = [];
  for (let i = 0; i < 21; i++) {
    const th = ((195 + (60 * i) / 20) * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th);
    const x = (ca + R * c + WIN_OUT) * s, y = (cb + R * sn + WIN_OUT) * s;
    let r = 0;
    for (let ch = 0; ch < 3; ch++) r += Math.abs(bil(G.gx[ch], G.n, x, y) * c + bil(G.gy[ch], G.n, x, y) * sn);
    vals.push(r);
  }
  return median(vals) / Math.max(ref, 1e-6);
}

function cutPoints(G: Grad, s: number, a0: number, b0: number, R: number): Pt[] {
  const ca = a0 + R, cb = b0 + R, pts: Pt[] = [];
  const m = Math.floor(1.2 * s * 4) + 1;
  for (let i = 0; i < 33; i++) {
    const t = ((185 + (80 * i) / 32) * Math.PI) / 180, c = Math.cos(t), sn = Math.sin(t);
    let best = -1, bi = 0;
    for (let j = 0; j < m; j++) {
      const rr = R - 0.6 + (1.2 * j) / (m - 1);
      const x = (ca + rr * c + WIN_OUT) * s, y = (cb + rr * sn + WIN_OUT) * s;
      let v = 0;
      for (let ch = 0; ch < 3; ch++) v += Math.abs(bil(G.gx[ch], G.n, x, y) * c + bil(G.gy[ch], G.n, x, y) * sn);
      if (v > best) { best = v; bi = j; }
    }
    const rr = R - 0.6 + (1.2 * bi) / (m - 1);
    pts.push([ca + rr * c, cb + rr * sn]);
  }
  return pts;
}

function fitQuarter(p: Pt[], a0: number, b0: number): [number, number[]] {
  let best: [number, number, number[]] | null = null;
  for (let k = 0; k <= 300; k++) {
    const R = 1.5 + k * 0.01;
    const res = p.map(([x, y]) => Math.hypot(x - (a0 + R), y - (b0 + R)) - R);
    const e = res.reduce((a, v) => a + v * v, 0) / res.length;
    if (!best || e < best[0]) best = [e, R, res];
  }
  return [best![1], best![2]];
}

function whitening(lab: Float32Array[], n: number, s: number, a0: number, b0: number, R: number): [number | null, number | null] {
  const band: number[] = [], ref: number[] = [];
  for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) {
    const a = u / s - WIN_OUT - a0, b = v / s - WIN_OUT - b0;
    const d = a < R && b < R ? R - Math.hypot(R - a, R - b) : Math.min(a, b);
    if (!(a < R + 2.5 && b < R + 2.5)) continue;
    if (d > 0.1 && d < 0.5) band.push(v * n + u);
    else if (d > 0.8 && d < 1.5) ref.push(v * n + u);
  }
  if (band.length < 30 || ref.length < 30) return [null, null];
  const L = lab[0], refL = ref.map((i) => L[i]);
  const rl = median(refL), spread = Math.max(percentile(refL, 0.9) - percentile(refL, 0.1), 6.0);
  const white = new Uint8Array(n * n);
  let cnt = 0;
  for (const i of band) if (L[i] > rl + 2.5 * spread && L[i] > 170) { white[i] = 1; cnt++; }
  // 8-connected components
  let comps = 0;
  const seen = new Uint8Array(n * n), stack: number[] = [];
  for (const i of band) {
    if (!white[i] || seen[i]) continue;
    comps++; seen[i] = 1; stack.push(i);
    while (stack.length) {
      const j = stack.pop()!, x = j % n, y = (j / n) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const k = yy * n + xx;
        if (white[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
  }
  return [cnt / band.length, comps];
}

/** Check each corner of the outer quad (photo px, TL TR BR BL). */
export function fitCorners(img: Img, quadIn: Quad4): CornerFitJS[] {
  const quad = quadIn.map((p) => [p[0], p[1]] as Pt);
  const d = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const ppmm = (d(quad[3], quad[0]) + d(quad[2], quad[1])) / 2 / CARD_H;
  const s = Math.min(20, Math.max(MIN_PPMM, ppmm));
  const out: CornerFitJS[] = [];
  for (let ci = 0; ci < 4; ci++) {
    const cf: CornerFitJS = { name: NAMES[ci], found: false, point: null, shift_mm: 0, arc: 0, quad_arc: 0, radius_mm: null,
      arc_radius_mm: null, roundness_rms_mm: null, whitening: null, white_spots: null, flags: [] };
    if (ppmm < MIN_PPMM) { cf.flags.push("low_resolution"); out.push(cf); continue; }
    const { lab, n, toPhoto } = localPatch(img, quad, ci, s);
    const G = gradients(lab, n, s);
    const tops = edgeCandidates(G.gy, n, s, true), lefts = edgeCandidates(G.gx, n, s, false);
    if (!tops.length || !lefts.length) { cf.flags.push("no_edges"); out.push(cf); continue; }
    let best: [number, number, number, number, number] | null = null;
    for (const [b0, sb] of tops) for (const [a0, sa] of lefts) {
      const ref = 0.5 * (sa + sb);
      let arc = -Infinity, R = RADII[0];
      for (const r of RADII) { const v = arcSupport(G, s, a0, b0, r, ref); if (v > arc) { arc = v; R = r; } }
      const prior = Math.exp(-0.5 * (Math.hypot(a0, b0) / PRIOR_MM) ** 2);
      const score = Math.sqrt(sa * sb) * Math.min(arc, 1.2) * (0.5 + 0.5 * prior);
      if (!best || score > best[0]) best = [score, a0, b0, arc, R];
    }
    const ref0 = (tops[0][1] + lefts[0][1]) / 2;
    cf.quad_arc = round(Math.max(...RADII.map((r) => arcSupport(G, s, 0, 0, r, ref0))), 3);
    const [, a0, b0, arc, R] = best!;
    cf.arc = round(arc, 3);
    cf.arc_radius_mm = round(R, 3);
    cf.found = arc >= ARC_MIN;
    if (!cf.found) cf.flags.push("no_arc");
    const p = toPhoto(a0, b0);
    cf.point = [round(p[0], 2), round(p[1], 2)];
    cf.shift_mm = round(Math.hypot(a0, b0), 3);
    if (cf.found) {
      const [r, res] = fitQuarter(cutPoints(G, s, a0, b0, R), a0, b0);
      cf.radius_mm = round(r, 3);
      cf.roundness_rms_mm = round(Math.sqrt(res.reduce((a, v) => a + v * v, 0) / res.length), 3);
      const [w, k] = whitening(lab, n, s, a0, b0, R);
      cf.whitening = w == null ? null : round(w, 4);
      cf.white_spots = k;
    }
    out.push(cf);
  }
  return out;
}
