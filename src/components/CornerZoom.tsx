import { useEffect, useRef } from "react";
import type { CornerLook, CornerGrades, CornerName, EngineCorner, Quad } from "../types";

// Four zoomed corners of the outer edge: the second look at the cut.
//
// Each tile shows ~8 mm around one corner of the quad, the quad's two edges,
// and a dashed 3 mm quarter circle touching both: on a well-placed corner it
// hugs the card's rounded cut. Click (or drag) in a tile to put the corner
// exactly there. The corner check (re-run on the current outline whenever a
// corner is let go) shows where it finds the cut as a cyan ring.
//
// Under each tile, corner grading: whitening (none / white specks / heavy)
// and shape (a clean quarter circle or off: chipped, flat, uneven cut).
// Saved with the measurement; the labels corner analytics learns from.

export const CORNERS: { key: CornerName; label: string }[] = [
  { key: "top_left", label: "top left" }, { key: "top_right", label: "top right" },
  { key: "bottom_right", label: "bottom right" }, { key: "bottom_left", label: "bottom left" },
];
const TILE = 168;
const HALF_MM = 4; // tile shows ±4 mm around the corner
const R_MM = 3; // modern card corner radius (engine median 2.97 mm)

type P = [number, number];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const len = (a: P) => Math.hypot(a[0], a[1]);

export default function CornerZoom({
  bitmap, quad, setQuad, engine, grades, setGrades, ppmm,
}: {
  bitmap: HTMLCanvasElement | null;
  quad: Quad;
  setQuad: (q: Quad) => void;
  engine: Pick<EngineCorner, "name" | "found" | "point" | "radius_mm" | "roundness_rms_mm" | "whitening">[] | undefined;
  grades: CornerGrades;
  setGrades: (g: CornerGrades) => void;
  ppmm: number; // photo px per mm
}) {
  return (
    <div className="mt-2">
      <div className="text-[10px] text-muted mb-1">
        corner check: click a tile to put the corner exactly there · dashed arc = a 3 mm card corner touching both edges (it should hug the cut) · cyan ring = where the corner check finds the cut from this outline (re-runs as you adjust)
      </div>
      <div className="grid grid-cols-2 gap-2" style={{ width: 2 * TILE + 8 }}>
        {CORNERS.map((c, i) => (
          <Tile key={c.key} i={i} label={c.label} bitmap={bitmap} quad={quad} setQuad={setQuad} ppmm={ppmm}
            engine={engine?.find((e) => e.name === c.key)} grade={grades[c.key] ?? {}}
            setGrade={(g) => setGrades({ ...grades, [c.key]: g })} />
        ))}
      </div>
    </div>
  );
}

function Tile({ i, label, bitmap, quad, setQuad, ppmm, engine, grade, setGrade }: {
  i: number; label: string; bitmap: HTMLCanvasElement | null; quad: Quad; setQuad: (q: Quad) => void; ppmm: number;
  engine?: Pick<EngineCorner, "name" | "found" | "point" | "radius_mm" | "roundness_rms_mm" | "whitening">; grade: CornerLook; setGrade: (g: CornerLook) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef(false);
  const c = quad[i] as P;
  const k = TILE / (2 * HALF_MM * ppmm); // tile px per photo px
  const toTile = (p: P): P => [(p[0] - c[0]) * k + TILE / 2, (p[1] - c[1]) * k + TILE / 2];

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !bitmap) return;
    cv.width = TILE;
    cv.height = TILE;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, TILE, TILE);
    ctx.imageSmoothingEnabled = k < 3;
    ctx.setTransform(k, 0, 0, k, TILE / 2 - c[0] * k, TILE / 2 - c[1] * k);
    ctx.drawImage(bitmap, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // the two edges from this corner
    const nA = quad[(i + 1) % 4] as P, nB = quad[(i + 3) % 4] as P;
    const ua = sub(nA, c), ub = sub(nB, c);
    const la = len(ua), lb = len(ub);
    const da: P = [ua[0] / la, ua[1] / la], db: P = [ub[0] / lb, ub[1] / lb];
    const o = toTile(c);
    ctx.setLineDash([5, 3]);
    for (const [style, w] of [["rgba(0,0,0,0.8)", 3], ["#ff3b3b", 1.25]] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(o[0] + da[0] * TILE, o[1] + da[1] * TILE); ctx.lineTo(o[0], o[1]); ctx.lineTo(o[0] + db[0] * TILE, o[1] + db[1] * TILE);
      ctx.stroke();
    }
    // a card corner of radius R touching both edges
    const r = R_MM * ppmm * k;
    const ctr: P = [o[0] + (da[0] + db[0]) * r, o[1] + (da[1] + db[1]) * r];
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = "#3fb950";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let t = 0; t <= 24; t++) {
      const th = (t / 24) * (Math.PI / 2);
      const x = ctr[0] - Math.cos(th) * da[0] * r - Math.sin(th) * db[0] * r;
      const y = ctr[1] - Math.cos(th) * da[1] * r - Math.sin(th) * db[1] * r;
      if (t) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // the engine's fitted corner
    if (engine?.found && engine.point) {
      const e = toTile(engine.point);
      if (Math.hypot(e[0] - o[0], e[1] - o[1]) > 2) {
        ctx.strokeStyle = "#39c5cf";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(e[0], e[1], 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // the corner itself
    ctx.strokeStyle = "#ffd33d";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o[0] - 5, o[1]); ctx.lineTo(o[0] + 5, o[1]);
    ctx.moveTo(o[0], o[1] - 5); ctx.lineTo(o[0], o[1] + 5);
    ctx.stroke();
  }, [bitmap, quad, i, k, c, engine]); // eslint-disable-line react-hooks/exhaustive-deps

  const place = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const tx = ((e.clientX - r.left) / r.width) * TILE, ty = ((e.clientY - r.top) / r.height) * TILE;
    const p: P = [c[0] + (tx - TILE / 2) / k, c[1] + (ty - TILE / 2) / k];
    const q = quad.map((x) => [x[0], x[1]]) as Quad;
    q[i] = p;
    setQuad(q);
  };

  const opt = (on: boolean) => `text-[9px] border rounded px-1 ${on ? "border-accent text-accent" : "border-border text-muted hover:text-[#e6edf3]"}`;
  const set = (g: Partial<CornerLook>) => setGrade({ ...grade, ...g });
  return (
    <div>
      <canvas ref={ref} style={{ width: TILE, height: TILE }} className="rounded cursor-crosshair touch-none border border-border"
        onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); place(e); }}
        onPointerMove={(e) => { if (drag.current) place(e); }}
        onPointerUp={() => { drag.current = false; }}
        aria-label={`${label} corner, zoomed`} />
      <div className="flex items-center justify-between text-[9px] text-muted">
        <span>{label}</span>
        {engine?.found && engine.point && (
          <button className="text-[9px] text-accent hover:underline" title="put the corner where the corner check finds the cut, looking from the current outline"
            onClick={() => { const q = quad.map((x) => [x[0], x[1]]) as Quad; q[i] = engine.point as P; setQuad(q); }}>
            snap to cut
          </button>
        )}
      </div>
      <div className="flex items-center gap-0.5 mt-0.5 text-[9px] text-muted">
        <span className="w-9">white</span>
        {(["none", "specks", "heavy"] as const).map((w) => (
          <button key={w} className={opt(grade.whitening === w)} onClick={() => set({ whitening: grade.whitening === w ? undefined : w })}
            title={w === "none" ? "no whitening" : w === "specks" ? "a few white dots at the cut" : "white along the cut, fraying"}>
            {w}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-0.5 mt-0.5 text-[9px] text-muted">
        <span className="w-9">cut</span>
        {(["round", "off"] as const).map((s) => (
          <button key={s} className={opt(grade.shape === s)} onClick={() => set({ shape: grade.shape === s ? undefined : s })}
            title={s === "round" ? "a clean quarter circle" : "chipped, flat spot or uneven cut"}>
            {s === "round" ? "round" : "not round"}
          </button>
        ))}
      </div>
      {engine?.found && (
        <div className="text-[9px] text-muted font-mono mt-0.5" title="engine readings for this corner (v0.7)">
          r {engine.radius_mm?.toFixed(2) ?? "—"} mm · off-round {engine.roundness_rms_mm != null ? (engine.roundness_rms_mm * 1000).toFixed(0) : "—"} µm · white {engine.whitening != null ? (engine.whitening * 100).toFixed(1) : "—"}%
        </div>
      )}
    </div>
  );
}
