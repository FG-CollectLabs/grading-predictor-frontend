import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, imageUrl } from "../api";
import type { CenteringMeasurement, InnerMM, Quad } from "../types";

// Review / adjust one photo's centering measurement.
//
// Left: the photo with the detected outer edge (cut line). Drag a corner, or
// select it and nudge 1 photo pixel with the arrow keys / buttons.
// Right: the card straightened from those corners (computed here, in the
// browser) with the four inner-border lines; same drag / 1-pixel nudges.
// Both panels zoom (mouse wheel, + / -, or jump to a corner / side) and pan
// (drag empty space).
// Ratios update live. "Accept" keeps the engine's numbers; any change saves
// an adjustment, a new measurement linked to the automatic one, which is kept.

const CARD_W = 63; // mm
const CARD_H = 88;
const PPMM = 12; // rectified preview resolution (px per mm); lines are continuous mm
const DRAG_PPMM = 3; // cheaper preview while dragging a corner
const PHOTO_W = 440;
const PHOTO_H = 560;
const RECT_W = 400;
const RECT_H = 560;
const DASH = [6, 4];

const TAGS: { value: string; label: string }[] = [
  { value: "outer_edge_wrong", label: "outer edge wrong" },
  { value: "slab_edge_picked", label: "slab edge picked" },
  { value: "inner_border_wrong", label: "inner border wrong" },
  { value: "full_art_border_unclear", label: "full-art border unclear" },
  { value: "copyright_text", label: "copyright text" },
  { value: "glare", label: "glare / reflection" },
  { value: "photo_too_small", label: "photo too small" },
  { value: "card_cut_off", label: "card cut off" },
  { value: "wrong_photo", label: "wrong photo" },
  { value: "other", label: "other" },
];

type Side = keyof InnerMM;

/** The current measurement of a side: the accepted one, else the newest proposed. */
export function currentMeasurement(ms: CenteringMeasurement[]): CenteringMeasurement | null {
  return ms.find((m) => m.status === "accepted") ?? ms.find((m) => m.status === "proposed") ?? ms[0] ?? null;
}

export function provenance(m: CenteringMeasurement, all: CenteringMeasurement[]): string {
  if (m.placed_by === "auto") return `auto v${m.detector_version}`;
  const base = all.find((x) => x.id === m.supersedes);
  const who = m.placed_by.replace(/^user:/, "");
  return base ? `adjusted by ${who} from auto v${base.detector_version}` : `placed by ${who}`;
}

export function ratioText(pct: number | null | undefined): string {
  if (pct == null) return "—";
  const a = Math.round(pct * 10) / 10;
  return `${a}/${Math.round((100 - a) * 10) / 10}`;
}

// ── homography (rectified px → photo px) ─────────────────────────────────────

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
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
  return M.map((row, i) => row[n] / row[i]);
}

/** H with [x y 1] ~ H [u v 1], mapping the rectangle (0,0)-(W,H) onto quad (TL TR BR BL). */
function homography(W: number, H: number, q: Quad): number[] {
  const src = [[0, 0], [W, 0], [W, H], [0, H]];
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i];
    const [x, y] = q[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  return [...solve(A, b), 1];
}

function warp(src: ImageData, q: Quad, ppmm: number): ImageData {
  const W = Math.round(CARD_W * ppmm);
  const H = Math.round(CARD_H * ppmm);
  const h = homography(W, H, q);
  const out = new ImageData(W, H);
  const s = src.data;
  const sw = src.width;
  const sh = src.height;
  const o = out.data;
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const z = h[6] * u + h[7] * v + h[8];
      const x = (h[0] * u + h[1] * v + h[2]) / z;
      const y = (h[3] * u + h[4] * v + h[5]) / z;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const i = (v * W + u) * 4;
      if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) {
        o[i] = 255; o[i + 1] = 0; o[i + 2] = 255; o[i + 3] = 255; // outside the photo: magenta
        continue;
      }
      const fx = x - x0;
      const fy = y - y0;
      const a = (y0 * sw + x0) * 4;
      const b2 = a + 4;
      const c = a + sw * 4;
      const d = c + 4;
      for (let k = 0; k < 3; k++) {
        o[i + k] = (s[a + k] * (1 - fx) + s[b2 + k] * fx) * (1 - fy) + (s[c + k] * (1 - fx) + s[d + k] * fx) * fy;
      }
      o[i + 3] = 255;
    }
  }
  return out;
}

// ── view transform: content units (photo px, or mm) ↔ canvas px ─────────────

type View = { z: number; cx: number; cy: number }; // zoom (1 = fit) and content point at the centre

function viewK(fit: number, v: View) {
  return fit * v.z;
}
function toScreen(fit: number, v: View, W: number, H: number, x: number, y: number) {
  const k = viewK(fit, v);
  return [(x - v.cx) * k + W / 2, (y - v.cy) * k + H / 2];
}
function toContent(fit: number, v: View, W: number, H: number, sx: number, sy: number) {
  const k = viewK(fit, v);
  return [(sx - W / 2) / k + v.cx, (sy - H / 2) / k + v.cy];
}
function zoomAt(fit: number, v: View, W: number, H: number, sx: number, sy: number, factor: number): View {
  const z = Math.max(1, Math.min(40, v.z * factor));
  const [px, py] = toContent(fit, v, W, H, sx, sy);
  const k = fit * z;
  return { z, cx: px - (sx - W / 2) / k, cy: py - (sy - H / 2) / k };
}

const CORNER_NAMES = ["TL", "TR", "BR", "BL"];
const SIDES: Side[] = ["left", "right", "top", "bottom"];

// ── component ────────────────────────────────────────────────────────────────

export default function CenteringEditor({
  copyId, side, imagePath, measurements, onSaved,
}: {
  copyId: number;
  side: "front" | "back";
  imagePath: string | null;
  measurements: CenteringMeasurement[];
  onSaved: (ms: CenteringMeasurement[]) => void;
}) {
  const current = currentMeasurement(measurements);
  const [src, setSrc] = useState<ImageData | null>(null);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [inner, setInner] = useState<InnerMM | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragCorner, setDragCorner] = useState<number | null>(null);
  const [selCorner, setSelCorner] = useState<number | null>(null);
  const [dragLine, setDragLine] = useState<Side | null>(null);
  const [selLine, setSelLine] = useState<Side | null>(null);
  const [pv, setPv] = useState<View>({ z: 1, cx: 0, cy: 0 }); // photo view
  const [rv, setRv] = useState<View>({ z: 1, cx: CARD_W / 2, cy: CARD_H / 2 }); // rectified view (mm)
  const pan = useRef<{ which: "photo" | "rect"; sx: number; sy: number; v: View } | null>(null);

  const photoRef = useRef<HTMLCanvasElement>(null);
  const rectRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<HTMLCanvasElement | null>(null);

  // the wheel zooms the canvas, not the page (React's onWheel is passive)
  useEffect(() => {
    const stop = (e: WheelEvent) => e.preventDefault();
    const els = [photoRef.current, rectRef.current].filter(Boolean) as HTMLCanvasElement[];
    els.forEach((el) => el.addEventListener("wheel", stop, { passive: false }));
    return () => els.forEach((el) => el.removeEventListener("wheel", stop));
  }, [src]);

  // reset when the measurement changes
  useEffect(() => {
    setQuad(current?.outer_quad ? (current.outer_quad.map((p) => [p[0], p[1]]) as Quad) : null);
    setInner(current?.inner_mm ? { ...current.inner_mm } : null);
    setTags(current?.tags ?? []);
    setNote(current?.note ?? "");
    setMsg(null);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // load the full-resolution photo's pixels
  useEffect(() => {
    if (!imagePath) return;
    setSrc(null);
    setImgErr(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      bitmapRef.current = c;
      try {
        setSrc(ctx.getImageData(0, 0, c.width, c.height));
      } catch {
        setImgErr("Can't read photo pixels (CORS).");
      }
      setPv({ z: 1, cx: c.width / 2, cy: c.height / 2 });
      setQuad((q) => {
        if (q) return q;
        const h = c.height * 0.8;
        const w = (h * CARD_W) / CARD_H;
        const x = (c.width - w) / 2;
        const y = (c.height - h) / 2;
        return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      });
      setInner((v) => v ?? { left: 3, right: 3, top: 3, bottom: 3 });
    };
    img.onerror = () => setImgErr("Photo failed to load.");
    // separate URL from the page's <img> of the same photo, so a cached
    // non-CORS copy is never reused for this CORS (pixel-reading) request
    img.src = `${imageUrl(imagePath)}?px=1`;
  }, [imagePath]);

  const photoFit = src ? Math.min(PHOTO_W / src.width, PHOTO_H / src.height) : 1;
  const rectFit = Math.min(RECT_W / CARD_W, RECT_H / CARD_H); // canvas px per mm at zoom 1
  // photo pixels per mm of card: one "pixel" nudge on the inner lines
  const srcPpmm = useMemo(() => {
    if (!quad) return 10;
    const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const w = (d(quad[0], quad[1]) + d(quad[3], quad[2])) / 2;
    const h = (d(quad[0], quad[3]) + d(quad[1], quad[2])) / 2;
    return Math.max(1, (w / CARD_W + h / CARD_H) / 2);
  }, [quad]);

  // draw the photo + quad
  useEffect(() => {
    const cv = photoRef.current;
    if (!cv || !src || !bitmapRef.current || !quad) return;
    cv.width = PHOTO_W;
    cv.height = PHOTO_H;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, PHOTO_W, PHOTO_H);
    const k = viewK(photoFit, pv);
    ctx.imageSmoothingEnabled = pv.z < 4;
    ctx.setTransform(k, 0, 0, k, PHOTO_W / 2 - pv.cx * k, PHOTO_H / 2 - pv.cy * k);
    ctx.drawImage(bitmapRef.current, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const pts = quad.map(([x, y]) => toScreen(photoFit, pv, PHOTO_W, PHOTO_H, x, y));
    ctx.setLineDash(DASH);
    for (const [style, width] of [["rgba(0,0,0,0.8)", 3], ["#ff3b3b", 1.25]] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
    }
    ctx.setLineDash([]);
    pts.forEach(([x, y], i) => {
      const sel = i === selCorner || i === dragCorner;
      ctx.strokeStyle = sel ? "#ffd33d" : "#ff3b3b";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, sel ? 7 : 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath(); // crosshair: the exact point
      ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y);
      ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
      ctx.stroke();
    });
  }, [src, quad, pv, photoFit, selCorner, dragCorner]);

  // the straightened card
  const rectImg = useMemo(() => {
    if (!src || !quad) return null;
    return warp(src, quad, dragCorner === null ? PPMM : DRAG_PPMM);
  }, [src, quad, dragCorner]);
  const rectBitmap = useMemo(() => {
    if (!rectImg) return null;
    const tmp = document.createElement("canvas");
    tmp.width = rectImg.width;
    tmp.height = rectImg.height;
    tmp.getContext("2d")!.putImageData(rectImg, 0, 0);
    return tmp;
  }, [rectImg]);

  useEffect(() => {
    const cv = rectRef.current;
    if (!cv || !rectBitmap || !inner) return;
    cv.width = RECT_W;
    cv.height = RECT_H;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, RECT_W, RECT_H);
    const k = viewK(rectFit, rv); // canvas px per mm
    const ppmm = rectBitmap.width / CARD_W;
    ctx.imageSmoothingEnabled = rv.z < 3;
    ctx.setTransform(k / ppmm, 0, 0, k / ppmm, RECT_W / 2 - rv.cx * k, RECT_H / 2 - rv.cy * k);
    ctx.drawImage(rectBitmap, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const S = (x: number, y: number) => toScreen(rectFit, rv, RECT_W, RECT_H, x, y);
    const seg: Record<Side, [number, number, number, number]> = {
      left: [inner.left, -5, inner.left, CARD_H + 5],
      right: [CARD_W - inner.right, -5, CARD_W - inner.right, CARD_H + 5],
      top: [-5, inner.top, CARD_W + 5, inner.top],
      bottom: [-5, CARD_H - inner.bottom, CARD_W + 5, CARD_H - inner.bottom],
    };
    ctx.setLineDash(DASH);
    for (const s of SIDES) {
      const [x1, y1, x2, y2] = seg[s];
      const [a, b] = S(x1, y1);
      const [c, d] = S(x2, y2);
      const sel = s === selLine || s === dragLine;
      for (const [style, width] of [["rgba(0,0,0,0.8)", 3], [sel ? "#ffd33d" : "#3fff6a", 1.25]] as const) {
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a, b);
        ctx.lineTo(c, d);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }, [rectBitmap, inner, selLine, dragLine, rv, rectFit]);

  // ── interaction: photo ─────────────────────────────────────────────────────
  const local = (e: React.PointerEvent | React.WheelEvent, el: HTMLCanvasElement) => {
    const r = el.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * el.width, ((e.clientY - r.top) / r.height) * el.height];
  };
  const onPhotoDown = (e: React.PointerEvent) => {
    if (!quad || !src) return;
    const [sx, sy] = local(e, photoRef.current!);
    let best = -1;
    let bd = 12;
    quad.forEach(([x, y], i) => {
      const [qx, qy] = toScreen(photoFit, pv, PHOTO_W, PHOTO_H, x, y);
      const d = Math.hypot(qx - sx, qy - sy);
      if (d < bd) { bd = d; best = i; }
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (best >= 0) {
      setDragCorner(best);
      setSelCorner(best);
    } else {
      pan.current = { which: "photo", sx, sy, v: pv };
    }
    photoRef.current?.focus();
  };
  const onPhotoMove = (e: React.PointerEvent) => {
    const [sx, sy] = local(e, photoRef.current!);
    if (dragCorner !== null && quad) {
      const [x, y] = toContent(photoFit, pv, PHOTO_W, PHOTO_H, sx, sy);
      const q = quad.map((p) => [p[0], p[1]]) as Quad;
      q[dragCorner] = [Math.round(x * 4) / 4, Math.round(y * 4) / 4];
      setQuad(q);
    } else if (pan.current?.which === "photo") {
      const k = viewK(photoFit, pan.current.v);
      setPv({ ...pan.current.v, cx: pan.current.v.cx - (sx - pan.current.sx) / k, cy: pan.current.v.cy - (sy - pan.current.sy) / k });
    }
  };
  const onPhotoUp = () => {
    setDragCorner(null);
    pan.current = null;
  };
  const onPhotoWheel = (e: React.WheelEvent) => {
    if (!src) return;
    const [sx, sy] = local(e, photoRef.current!);
    setPv(zoomAt(photoFit, pv, PHOTO_W, PHOTO_H, sx, sy, e.deltaY < 0 ? 1.25 : 0.8));
  };
  const nudgeCorner = (dx: number, dy: number) => {
    if (selCorner === null || !quad) return;
    const q = quad.map((p) => [p[0], p[1]]) as Quad;
    q[selCorner] = [q[selCorner][0] + dx, q[selCorner][1] + dy];
    setQuad(q);
  };
  const focusCorner = (i: number) => {
    if (!quad) return;
    setSelCorner(i);
    setPv({ z: 10, cx: quad[i][0], cy: quad[i][1] });
    photoRef.current?.focus();
  };

  // ── interaction: rectified ─────────────────────────────────────────────────
  const onRectDown = (e: React.PointerEvent) => {
    if (!inner) return;
    const [sx, sy] = local(e, rectRef.current!);
    const [x, y] = toContent(rectFit, rv, RECT_W, RECT_H, sx, sy);
    const k = viewK(rectFit, rv);
    const d: [Side, number][] = [
      ["left", Math.abs(x - inner.left) * k],
      ["right", Math.abs(CARD_W - inner.right - x) * k],
      ["top", Math.abs(y - inner.top) * k],
      ["bottom", Math.abs(CARD_H - inner.bottom - y) * k],
    ];
    d.sort((a, b) => a[1] - b[1]);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (d[0][1] < 8) {
      setDragLine(d[0][0]);
      setSelLine(d[0][0]);
    } else {
      pan.current = { which: "rect", sx, sy, v: rv };
    }
    rectRef.current?.focus();
  };
  const onRectMove = (e: React.PointerEvent) => {
    const [sx, sy] = local(e, rectRef.current!);
    if (dragLine && inner) {
      const [x, y] = toContent(rectFit, rv, RECT_W, RECT_H, sx, sy);
      const v = { left: x, right: CARD_W - x, top: y, bottom: CARD_H - y }[dragLine];
      setInner({ ...inner, [dragLine]: Math.max(0.01, Math.min(15, Math.round(v * 1000) / 1000)) });
    } else if (pan.current?.which === "rect") {
      const k = viewK(rectFit, pan.current.v);
      setRv({ ...pan.current.v, cx: pan.current.v.cx - (sx - pan.current.sx) / k, cy: pan.current.v.cy - (sy - pan.current.sy) / k });
    }
  };
  const onRectUp = () => {
    setDragLine(null);
    pan.current = null;
  };
  const onRectWheel = (e: React.WheelEvent) => {
    const [sx, sy] = local(e, rectRef.current!);
    setRv(zoomAt(rectFit, rv, RECT_W, RECT_H, sx, sy, e.deltaY < 0 ? 1.25 : 0.8));
  };
  /** Move the selected inner line by n photo pixels, in screen direction (+1 = right/down). */
  const nudgeLine = (screenDir: number) => {
    if (!selLine || !inner) return;
    const sign = selLine === "left" || selLine === "top" ? 1 : -1;
    const v = inner[selLine] + (sign * screenDir) / srcPpmm;
    setInner({ ...inner, [selLine]: Math.max(0.01, Math.min(15, Math.round(v * 1000) / 1000)) });
  };
  const focusSide = (s: Side) => {
    if (!inner) return;
    setSelLine(s);
    const c = {
      left: [inner.left, CARD_H / 2], right: [CARD_W - inner.right, CARD_H / 2],
      top: [CARD_W / 2, inner.top], bottom: [CARD_W / 2, CARD_H - inner.bottom],
    }[s];
    setRv({ z: 8, cx: c[0], cy: c[1] });
    rectRef.current?.focus();
  };

  const arrow = (e: React.KeyboardEvent, f: (dx: number, dy: number) => void) => {
    const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!(e.key in d)) return;
    e.preventDefault();
    e.stopPropagation();
    const n = e.shiftKey ? 10 : 1;
    f(d[e.key][0] * n, d[e.key][1] * n);
  };

  // ── derived numbers ────────────────────────────────────────────────────────
  const lr = inner ? (100 * inner.left) / (inner.left + inner.right) : null;
  const tb = inner ? (100 * inner.top) / (inner.top + inner.bottom) : null;
  const changed = useMemo(() => {
    if (!current?.outer_quad || !current.inner_mm || !quad || !inner) return !!quad;
    const dq = quad.some((p, i) => Math.hypot(p[0] - current.outer_quad![i][0], p[1] - current.outer_quad![i][1]) > 0.2);
    const di = SIDES.some((k) => Math.abs(inner[k] - current.inner_mm![k]) > 0.002);
    return dq || di;
  }, [quad, inner, current]);

  const save = useCallback(
    async (action: "accept" | "adjust" | "reject") => {
      if (!current) return;
      setSaving(true);
      setMsg(null);
      try {
        const res = await api.postCentering(copyId, {
          action,
          base_id: current.id,
          outer_quad: action === "adjust" ? quad! : undefined,
          inner_mm: action === "adjust" ? inner! : undefined,
          tags,
          note,
        });
        onSaved(res.measurements);
        setMsg(action === "adjust" ? "Adjustment saved." : action === "accept" ? "Accepted." : "Marked unmeasurable.");
      } catch (e) {
        setMsg(String(e));
      } finally {
        setSaving(false);
      }
    },
    [current, copyId, quad, inner, tags, note, onSaved],
  );

  if (!imagePath) return <div className="text-xs text-muted">No {side} photo stored yet.</div>;

  const btn = "text-[10px] border border-border rounded px-1.5 py-0.5 text-muted hover:text-accent hover:border-accent/50";
  const selBtn = "text-[10px] border rounded px-1.5 py-0.5 border-yellow text-yellow";

  return (
    <div className="bg-surface border border-border rounded-md p-3">
      <div className="flex items-center justify-between mb-2 text-xs">
        <span className="uppercase tracking-widest text-muted text-[10px]">{side} centering</span>
        {current ? (
          <span className="text-muted">
            {provenance(current, measurements)} · <span className={current.status === "accepted" ? "text-green" : current.status === "rejected" ? "text-red-400" : "text-yellow"}>{current.status}</span>
          </span>
        ) : (
          <span className="text-muted">not measured yet (the engine will pick it up)</span>
        )}
      </div>
      {imgErr && <div className="text-red-400 text-xs mb-2">{imgErr}</div>}
      <div className="flex flex-wrap gap-3 items-start">
        <div style={{ width: PHOTO_W }}>
          <canvas
            ref={photoRef}
            tabIndex={0}
            style={{ width: PHOTO_W, height: PHOTO_H }}
            className="rounded cursor-crosshair touch-none outline-none focus:ring-1 focus:ring-accent"
            onPointerDown={onPhotoDown}
            onPointerMove={onPhotoMove}
            onPointerUp={onPhotoUp}
            onWheel={onPhotoWheel}
            onKeyDown={(e) => arrow(e, nudgeCorner)}
          />
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <span className="text-[10px] text-muted mr-1">outer edge:</span>
            {CORNER_NAMES.map((n, i) => (
              <button key={n} className={selCorner === i ? selBtn : btn} onClick={() => focusCorner(i)} title="zoom to this corner and select it">{n}</button>
            ))}
            <button className={btn} onClick={() => src && setPv({ z: 1, cx: src.width / 2, cy: src.height / 2 })}>fit</button>
            <button className={btn} onClick={() => setPv({ ...pv, z: Math.min(40, pv.z * 1.5) })}>+</button>
            <button className={btn} onClick={() => setPv({ ...pv, z: Math.max(1, pv.z / 1.5) })}>−</button>
            <Nudge disabled={selCorner === null} onNudge={nudgeCorner} />
          </div>
          <div className="text-[10px] text-muted mt-0.5">
            drag a corner onto the cut edge · wheel = zoom, drag empty space = pan · arrows = 1 px (Shift 10)
          </div>
        </div>
        <div style={{ width: RECT_W }}>
          <canvas
            ref={rectRef}
            tabIndex={0}
            style={{ width: RECT_W, height: RECT_H }}
            className="rounded cursor-move outline-none focus:ring-1 focus:ring-accent touch-none"
            onPointerDown={onRectDown}
            onPointerMove={onRectMove}
            onPointerUp={onRectUp}
            onWheel={onRectWheel}
            onKeyDown={(e) => arrow(e, (dx, dy) => nudgeLine(selLine === "left" || selLine === "right" ? dx : dy))}
          />
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <span className="text-[10px] text-muted mr-1">inner border:</span>
            {SIDES.map((s) => (
              <button key={s} className={selLine === s ? selBtn : btn} onClick={() => focusSide(s)} title="zoom to this side and select its line">{s}</button>
            ))}
            <button className={btn} onClick={() => setRv({ z: 1, cx: CARD_W / 2, cy: CARD_H / 2 })}>fit</button>
            <button className={btn} onClick={() => setRv({ ...rv, z: Math.min(40, rv.z * 1.5) })}>+</button>
            <button className={btn} onClick={() => setRv({ ...rv, z: Math.max(1, rv.z / 1.5) })}>−</button>
            <Nudge disabled={!selLine} axis={selLine === "top" || selLine === "bottom" ? "y" : "x"}
              onNudge={(dx, dy) => nudgeLine(selLine === "left" || selLine === "right" ? dx : dy)} />
          </div>
          <div className="text-[10px] text-muted mt-0.5">
            drag a green line onto the inner border · 1 nudge = 1 photo pixel ({(1 / srcPpmm).toFixed(3)} mm)
          </div>
        </div>
        <div className="w-56 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-bg border border-border rounded px-2 py-1.5">
              <div className="text-sm font-semibold">{ratioText(lr)}</div>
              <div className="text-[10px] text-muted">left / right{current?.lr_err_pp != null && !changed ? ` ±${current.lr_err_pp}` : ""}</div>
            </div>
            <div className="bg-bg border border-border rounded px-2 py-1.5">
              <div className="text-sm font-semibold">{ratioText(tb)}</div>
              <div className="text-[10px] text-muted">top / bottom{current?.tb_err_pp != null && !changed ? ` ±${current.tb_err_pp}` : ""}</div>
            </div>
          </div>
          {inner && (
            <div className="text-[10px] text-muted font-mono">
              borders mm · L {inner.left.toFixed(2)} R {inner.right.toFixed(2)} T {inner.top.toFixed(2)} B {inner.bottom.toFixed(2)}
            </div>
          )}
          {current && current.flags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {current.flags.map((f) => (
                <span key={f} className="text-[9px] text-orange-300 border border-orange-300/30 rounded px-1">{f.replace(/_/g, " ")}</span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {TAGS.map((t) => {
              const on = tags.includes(t.value);
              return (
                <button
                  key={t.value}
                  onClick={() => setTags(on ? tags.filter((x) => x !== t.value) : [...tags, t.value])}
                  className={`text-[10px] rounded px-1.5 py-0.5 border ${on ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:text-[#e6edf3]"}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="note (what the engine got wrong)"
            className="w-full bg-bg border border-border rounded px-2 py-1 text-xs outline-none focus:border-accent"
          />
          <div className="flex flex-col gap-1.5">
            <button
              disabled={!current || saving || !quad || !inner}
              onClick={() => save(changed ? "adjust" : "accept")}
              className="bg-accent text-bg font-semibold px-3 py-1.5 rounded text-xs hover:bg-accent/90 disabled:opacity-40"
            >
              {changed ? "Save adjustment" : "Accept"}
            </button>
            {changed && current?.outer_quad && (
              <button
                onClick={() => {
                  setQuad(current.outer_quad!.map((p) => [p[0], p[1]]) as Quad);
                  setInner(current.inner_mm ? { ...current.inner_mm } : inner);
                }}
                className="text-xs border border-border text-muted rounded px-2 py-1 hover:text-[#e6edf3]"
              >
                Reset to {current.placed_by === "auto" ? "engine" : "saved"}
              </button>
            )}
            <button
              disabled={!current || saving}
              onClick={() => save("reject")}
              className="text-xs border border-red-400/40 text-red-400 rounded px-2 py-1 hover:bg-red-500/10 disabled:opacity-40"
            >
              Can't measure this photo
            </button>
          </div>
          {msg && <div className="text-xs text-green">{msg}</div>}
        </div>
      </div>
    </div>
  );
}

function Nudge({ disabled, onNudge, axis }: { disabled: boolean; onNudge: (dx: number, dy: number) => void; axis?: "x" | "y" }) {
  const b = "text-[10px] border border-border rounded w-5 h-5 text-muted hover:text-accent disabled:opacity-30";
  return (
    <span className="inline-flex gap-0.5 ml-1" title="1 pixel nudges">
      {axis !== "y" && <button className={b} disabled={disabled} onClick={() => onNudge(-1, 0)}>←</button>}
      {axis !== "x" && <button className={b} disabled={disabled} onClick={() => onNudge(0, -1)}>↑</button>}
      {axis !== "x" && <button className={b} disabled={disabled} onClick={() => onNudge(0, 1)}>↓</button>}
      {axis !== "y" && <button className={b} disabled={disabled} onClick={() => onNudge(1, 0)}>→</button>}
    </span>
  );
}
