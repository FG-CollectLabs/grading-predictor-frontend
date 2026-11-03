import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, imageUrl } from "../api";
import type { CenteringMeasurement, InnerMM, Quad } from "../types";

// Review / adjust one photo's centering measurement.
//
// Left: the photo with the detected outer edge (cut line). Drag the corners.
// Right: the card straightened from those corners (computed here, in the
// browser) with the four inner-border lines. Drag a line, or click it and
// nudge with the arrow keys (0.05 mm; Shift = 0.25 mm).
// Ratios update live. "Accept" keeps the engine's numbers; any change saves
// an adjustment, a new measurement linked to the automatic one, which is kept.

const CARD_W = 63; // mm
const CARD_H = 88;
const PPMM = 8; // rectified preview resolution (px per mm); lines are continuous mm
const DRAG_PPMM = 3; // cheaper preview while dragging a corner

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
  const [dragLine, setDragLine] = useState<Side | null>(null);
  const [selLine, setSelLine] = useState<Side | null>(null);

  const photoRef = useRef<HTMLCanvasElement>(null);
  const rectRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<HTMLCanvasElement | null>(null);

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
      // no measurement yet: start from a centred card-shaped box
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

  const view = useMemo(() => {
    if (!src) return null;
    const maxW = 420;
    const maxH = 560;
    const s = Math.min(maxW / src.width, maxH / src.height, 1);
    return { s, w: Math.round(src.width * s), h: Math.round(src.height * s) };
  }, [src]);

  // draw the photo + quad
  useEffect(() => {
    const cv = photoRef.current;
    if (!cv || !view || !bitmapRef.current || !quad) return;
    cv.width = view.w;
    cv.height = view.h;
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(bitmapRef.current, 0, 0, view.w, view.h);
    ctx.strokeStyle = "#ff3b3b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    quad.forEach(([x, y], i) => (i ? ctx.lineTo(x * view.s, y * view.s) : ctx.moveTo(x * view.s, y * view.s)));
    ctx.closePath();
    ctx.stroke();
    quad.forEach(([x, y], i) => {
      ctx.fillStyle = dragCorner === i ? "#58a6ff" : "#ff3b3b";
      ctx.beginPath();
      ctx.arc(x * view.s, y * view.s, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [view, quad, dragCorner]);

  // loupe while dragging a corner: 6x around it
  useEffect(() => {
    const cv = loupeRef.current;
    if (!cv || dragCorner === null || !quad || !bitmapRef.current) return;
    const ctx = cv.getContext("2d")!;
    const [x, y] = quad[dragCorner];
    const r = 20;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(bitmapRef.current, x - r, y - r, 2 * r, 2 * r, 0, 0, cv.width, cv.height);
    ctx.strokeStyle = "#58a6ff";
    ctx.beginPath();
    ctx.moveTo(cv.width / 2, 0); ctx.lineTo(cv.width / 2, cv.height);
    ctx.moveTo(0, cv.height / 2); ctx.lineTo(cv.width, cv.height / 2);
    ctx.stroke();
  }, [dragCorner, quad]);

  // the straightened card
  const rectImg = useMemo(() => {
    if (!src || !quad) return null;
    return warp(src, quad, dragCorner === null ? PPMM : DRAG_PPMM);
  }, [src, quad, dragCorner]);

  const rectScale = 360 / CARD_W; // display px per mm
  useEffect(() => {
    const cv = rectRef.current;
    if (!cv || !rectImg || !inner) return;
    cv.width = Math.round(CARD_W * rectScale);
    cv.height = Math.round(CARD_H * rectScale);
    const ctx = cv.getContext("2d")!;
    const tmp = document.createElement("canvas");
    tmp.width = rectImg.width;
    tmp.height = rectImg.height;
    tmp.getContext("2d")!.putImageData(rectImg, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, cv.width, cv.height);
    const W = cv.width;
    const H = cv.height;
    const line = (s: Side, x1: number, y1: number, x2: number, y2: number) => {
      // dark halo first so the line reads on any artwork
      for (const [style, width] of [["rgba(0,0,0,0.75)", 3.5], [s === selLine || s === dragLine ? "#ffd33d" : "#3fff6a", 1.5]] as const) {
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    };
    line("left", inner.left * rectScale, 0, inner.left * rectScale, H);
    line("right", W - inner.right * rectScale, 0, W - inner.right * rectScale, H);
    line("top", 0, inner.top * rectScale, W, inner.top * rectScale);
    line("bottom", 0, H - inner.bottom * rectScale, W, H - inner.bottom * rectScale);
  }, [rectImg, inner, selLine, dragLine, rectScale]);

  // ── interaction ────────────────────────────────────────────────────────────
  const photoXY = (e: React.PointerEvent) => {
    const r = photoRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / view!.s, (e.clientY - r.top) / view!.s];
  };
  const onPhotoDown = (e: React.PointerEvent) => {
    if (!quad || !view) return;
    const [x, y] = photoXY(e);
    let best = -1;
    let bd = 14 / view.s;
    quad.forEach(([qx, qy], i) => {
      const d = Math.hypot(qx - x, qy - y);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) {
      setDragCorner(best);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onPhotoMove = (e: React.PointerEvent) => {
    if (dragCorner === null || !quad) return;
    const [x, y] = photoXY(e);
    const q = quad.map((p) => [p[0], p[1]]) as Quad;
    q[dragCorner] = [x, y];
    setQuad(q);
  };

  const rectMM = (e: React.PointerEvent) => {
    const r = rectRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * CARD_W, ((e.clientY - r.top) / r.height) * CARD_H];
  };
  const onRectDown = (e: React.PointerEvent) => {
    if (!inner) return;
    const [x, y] = rectMM(e);
    const d: [Side, number][] = [
      ["left", Math.abs(x - inner.left)],
      ["right", Math.abs(CARD_W - inner.right - x)],
      ["top", Math.abs(y - inner.top)],
      ["bottom", Math.abs(CARD_H - inner.bottom - y)],
    ];
    d.sort((a, b) => a[1] - b[1]);
    if (d[0][1] < 1.5) {
      setDragLine(d[0][0]);
      setSelLine(d[0][0]);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onRectMove = (e: React.PointerEvent) => {
    if (!dragLine || !inner) return;
    const [x, y] = rectMM(e);
    const v = { left: x, right: CARD_W - x, top: y, bottom: CARD_H - y }[dragLine];
    setInner({ ...inner, [dragLine]: Math.max(0.05, Math.min(15, Math.round(v * 100) / 100)) });
  };
  const onRectKey = (e: React.KeyboardEvent) => {
    if (!selLine || !inner) return;
    const step = e.shiftKey ? 0.25 : 0.05;
    const dir: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 };
    if (!(e.key in dir)) return;
    e.preventDefault();
    e.stopPropagation();
    // move the line on screen in the arrow's direction
    const sign = selLine === "left" || selLine === "top" ? 1 : -1;
    const v = inner[selLine] + sign * dir[e.key] * step;
    setInner({ ...inner, [selLine]: Math.max(0.05, Math.min(15, Math.round(v * 100) / 100)) });
  };

  // ── derived numbers ────────────────────────────────────────────────────────
  const lr = inner ? (100 * inner.left) / (inner.left + inner.right) : null;
  const tb = inner ? (100 * inner.top) / (inner.top + inner.bottom) : null;
  const changed = useMemo(() => {
    if (!current?.outer_quad || !current.inner_mm || !quad || !inner) return !!quad;
    const dq = quad.some((p, i) => Math.hypot(p[0] - current.outer_quad![i][0], p[1] - current.outer_quad![i][1]) > 0.5);
    const di = (Object.keys(inner) as Side[]).some((k) => Math.abs(inner[k] - current.inner_mm![k]) > 0.005);
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
        <div className="relative">
          <canvas
            ref={photoRef}
            className="rounded cursor-crosshair touch-none"
            onPointerDown={onPhotoDown}
            onPointerMove={onPhotoMove}
            onPointerUp={() => setDragCorner(null)}
          />
          {dragCorner !== null && (
            <canvas ref={loupeRef} width={160} height={160} className="absolute top-1 right-1 border border-accent rounded pointer-events-none" />
          )}
          <div className="text-[10px] text-muted mt-1">drag the red corners onto the card's cut edge</div>
        </div>
        <div>
          <canvas
            ref={rectRef}
            tabIndex={0}
            className="rounded cursor-move outline-none focus:ring-1 focus:ring-accent touch-none"
            onPointerDown={onRectDown}
            onPointerMove={onRectMove}
            onPointerUp={() => setDragLine(null)}
            onKeyDown={onRectKey}
          />
          <div className="text-[10px] text-muted mt-1">drag a green line onto the inner border; click it, then arrow keys to nudge</div>
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
            placeholder="note"
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
