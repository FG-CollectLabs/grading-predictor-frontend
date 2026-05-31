import { useEffect, useRef, useState } from "react";

export interface CenteringResult {
  lr: number;          // 0–100: left border % of total horizontal
  tb: number;          // 0–100: top border % of total vertical
  rotationDeg: number; // card tilt in degrees: +CW, -CCW
}

interface MeasureLine {
  cx: number;      // 0–1 fraction of image width
  cy: number;      // 0–1 fraction of image height
  angleDeg: number;
}

type LineId =
  | "leftEdge" | "rightEdge" | "topEdge" | "bottomEdge"
  | "leftArt"  | "rightArt"  | "topArt"  | "bottomArt";

type Lines = Record<LineId, MeasureLine>;

const DEFAULT_LINES: Lines = {
  leftEdge:   { cx: 0.05, cy: 0.5,  angleDeg: 90 },
  rightEdge:  { cx: 0.95, cy: 0.5,  angleDeg: 90 },
  topEdge:    { cx: 0.5,  cy: 0.04, angleDeg: 0  },
  bottomEdge: { cx: 0.5,  cy: 0.96, angleDeg: 0  },
  leftArt:    { cx: 0.13, cy: 0.5,  angleDeg: 90 },
  rightArt:   { cx: 0.87, cy: 0.5,  angleDeg: 90 },
  topArt:     { cx: 0.5,  cy: 0.13, angleDeg: 0  },
  bottomArt:  { cx: 0.5,  cy: 0.87, angleDeg: 0  },
};

const LINE_IDS = Object.keys(DEFAULT_LINES) as LineId[];

const LINE_COLOR: Record<LineId, string> = {
  leftEdge: "#8b949e", rightEdge: "#8b949e", topEdge: "#8b949e", bottomEdge: "#8b949e",
  leftArt:  "#58a6ff", rightArt:  "#58a6ff", topArt:  "#58a6ff", bottomArt:  "#58a6ff",
};

// Normalized x where `line` crosses y=y_frac
function xAtY(line: MeasureLine, y_frac: number, nat: { w: number; h: number }): number {
  const rad = (line.angleDeg * Math.PI) / 180;
  const s = Math.sin(rad);
  if (Math.abs(s) < 1e-9) return line.cx;
  return line.cx + ((y_frac - line.cy) * nat.h * Math.cos(rad)) / (s * nat.w);
}

// Normalized y where `line` crosses x=x_frac
function yAtX(line: MeasureLine, x_frac: number, nat: { w: number; h: number }): number {
  const rad = (line.angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  if (Math.abs(c) < 1e-9) return line.cy;
  return line.cy + ((x_frac - line.cx) * nat.w * Math.sin(rad)) / (c * nat.h);
}

// Circular mean of angles, normalized to [-90, 90] (horizontal line tilt)
function circularMeanDeg(angles: number[]): number {
  const sx = angles.reduce((s, a) => s + Math.cos((a * Math.PI) / 180), 0);
  const sy = angles.reduce((s, a) => s + Math.sin((a * Math.PI) / 180), 0);
  let deg = (Math.atan2(sy, sx) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return Math.round(deg * 10) / 10;
}

function computeCentering(lines: Lines, nat: { w: number; h: number }): CenteringResult {
  const leftBorder  = xAtY(lines.leftArt,    0.5, nat) - xAtY(lines.leftEdge,  0.5, nat);
  const rightBorder = xAtY(lines.rightEdge,  0.5, nat) - xAtY(lines.rightArt,  0.5, nat);
  const totalLR = leftBorder + rightBorder;

  const topBorder    = yAtX(lines.topArt,     0.5, nat) - yAtX(lines.topEdge,   0.5, nat);
  const bottomBorder = yAtX(lines.bottomEdge, 0.5, nat) - yAtX(lines.bottomArt, 0.5, nat);
  const totalTB = topBorder + bottomBorder;

  return {
    lr: totalLR > 0 ? Math.max(0, Math.min(100, Math.round((leftBorder / totalLR) * 100))) : 50,
    tb: totalTB > 0 ? Math.max(0, Math.min(100, Math.round((topBorder  / totalTB) * 100))) : 50,
    rotationDeg: circularMeanDeg([lines.topArt.angleDeg, lines.bottomArt.angleDeg]),
  };
}

type DragState =
  | { type: "pan"; startPanX: number; startPanY: number; startClientX: number; startClientY: number }
  | { type: "line-center"; lineId: LineId; startCx: number; startCy: number; startMxFrac: number; startMyFrac: number }
  | { type: "line-handle"; lineId: LineId };

export function CenteringTool({
  frontImage,
  backImage,
  onDone,
  onSkip,
}: {
  frontImage?: string;
  backImage?: string;
  onDone: (front: CenteringResult, back: CenteringResult) => void;
  onSkip: () => void;
}) {
  const [side, setSide] = useState<"front" | "back">(frontImage ? "front" : "back");
  const [frontLines, setFrontLines] = useState<Lines>(() => ({ ...DEFAULT_LINES }));
  const [backLines, setBackLines] = useState<Lines>(() => ({ ...DEFAULT_LINES }));
  const [frontNat, setFrontNat] = useState({ w: 800, h: 1120 });
  const [backNat, setBackNat] = useState({ w: 800, h: 1120 });
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const outerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<DragState | null>(null);

  const nat = side === "front" ? frontNat : backNat;
  const lines = side === "front" ? frontLines : backLines;
  const setLines = side === "front" ? setFrontLines : setBackLines;
  const centering = computeCentering(lines, nat);
  const currentImage = side === "front" ? frontImage : backImage;

  function fitImage(natW: number, natH: number) {
    const outer = outerRef.current;
    if (!outer) return;
    const { width, height } = outer.getBoundingClientRect();
    const fz = Math.min((width / natW) * 0.95, (height / natH) * 0.95);
    setZoom(fz);
    setPanX((width - natW * fz) / 2);
    setPanY((height - natH * fz) / 2);
  }

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const nw = img.naturalWidth || 800;
    const nh = img.naturalHeight || 1120;
    if (side === "front") setFrontNat({ w: nw, h: nh });
    else setBackNat({ w: nw, h: nh });
    fitImage(nw, nh);
  }

  // Re-fit when switching sides (use already-loaded nat for that side)
  useEffect(() => {
    const n = side === "front" ? frontNat : backNat;
    fitImage(n.w, n.h);
  }, [side]); // eslint-disable-line react-hooks/exhaustive-deps

  function toFrac(clientX: number, clientY: number) {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      nx: (clientX - rect.left) / rect.width,
      ny: (clientY - rect.top)  / rect.height,
    };
  }

  function onBgDown(e: React.PointerEvent) {
    e.preventDefault();
    drag.current = { type: "pan", startPanX: panX, startPanY: panY, startClientX: e.clientX, startClientY: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onCenterDown(lineId: LineId, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const { nx, ny } = toFrac(e.clientX, e.clientY);
    drag.current = { type: "line-center", lineId, startCx: lines[lineId].cx, startCy: lines[lineId].cy, startMxFrac: nx, startMyFrac: ny };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onHandleDown(lineId: LineId, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { type: "line-handle", lineId };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;

    if (d.type === "pan") {
      setPanX(d.startPanX + (e.clientX - d.startClientX));
      setPanY(d.startPanY + (e.clientY - d.startClientY));
      return;
    }

    const { nx, ny } = toFrac(e.clientX, e.clientY);

    if (d.type === "line-center") {
      setLines((prev) => ({
        ...prev,
        [d.lineId]: {
          ...prev[d.lineId],
          cx: d.startCx + (nx - d.startMxFrac),
          cy: d.startCy + (ny - d.startMyFrac),
        },
      }));
      return;
    }

    if (d.type === "line-handle") {
      const line = lines[d.lineId];
      const dx_px = (nx - line.cx) * nat.w;
      const dy_px = (ny - line.cy) * nat.h;
      const angleDeg = (Math.atan2(dy_px, dx_px) * 180) / Math.PI;
      setLines((prev) => ({ ...prev, [d.lineId]: { ...prev[d.lineId], angleDeg } }));
      return;
    }
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const outer = outerRef.current;
    if (!outer) return;
    const rect = outer.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom((z) => {
      const nz = Math.max(0.05, Math.min(40, z * factor));
      const ratio = nz / z;
      setPanX((px) => cx - (cx - px) * ratio);
      setPanY((py) => cy - (cy - py) * ratio);
      return nz;
    });
  }

  function handleDone() {
    onDone(
      computeCentering(frontLines, frontNat),
      computeCentering(backLines, backNat),
    );
  }

  const SCALE = Math.max(nat.w, nat.h);
  const HANDLE_NAT = SCALE * 0.14;
  const STROKE = SCALE * 0.003;
  const CR = SCALE * 0.012; // center dot radius
  const HR = SCALE * 0.008; // handle dot radius

  const lrOff = Math.abs(centering.lr - 50) >= 5;
  const tbOff = Math.abs(centering.tb - 50) >= 5;
  const rotOff = Math.abs(centering.rotationDeg) >= 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0d1117" }}>

      {/* ── Header ── */}
      <div className="shrink-0 h-11 flex items-center gap-3 px-4 border-b border-border">
        <span className="text-sm font-semibold text-[#e6edf3]">Centering</span>
        <span className="hidden sm:block text-[10px] text-muted">
          gray = card edges &nbsp;·&nbsp; blue = artwork border &nbsp;·&nbsp;
          scroll to zoom &nbsp;·&nbsp; drag background to pan &nbsp;·&nbsp;
          drag dots to move/rotate lines
        </span>
        <div className="flex items-center gap-2 ml-auto">
          {frontImage && backImage && (
            <div className="flex gap-1">
              {(["front", "back"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={`px-3 py-1 text-xs rounded border transition-colors ${
                    side === s
                      ? "border-accent text-accent bg-accent/10"
                      : "border-border text-muted hover:border-[#8b949e]"
                  }`}
                >
                  {s === "front" ? "Front" : "Back"}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={onSkip}
            className="px-3 py-1 text-xs border border-border text-muted rounded hover:border-[#8b949e] transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleDone}
            className="bg-accent text-bg font-semibold px-4 py-1.5 rounded text-xs hover:bg-accent/90 transition-colors"
          >
            Save &amp; Continue →
          </button>
        </div>
      </div>

      {/* ── Main zoom / pan canvas ── */}
      <div
        ref={outerRef}
        className="flex-1 relative overflow-hidden"
        onWheel={onWheel}
        style={{ touchAction: "none" }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: nat.w,
            height: nat.h,
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {currentImage && (
            <img
              key={currentImage}
              src={currentImage}
              alt="scan"
              draggable={false}
              onLoad={onImgLoad}
              style={{ display: "block", width: nat.w, height: nat.h }}
            />
          )}

          <svg
            ref={svgRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: nat.w,
              height: nat.h,
              overflow: "visible",
              touchAction: "none",
            }}
            viewBox={`0 0 ${nat.w} ${nat.h}`}
            preserveAspectRatio="none"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {/* Transparent background rect for pan */}
            <rect
              x={0} y={0} width={nat.w} height={nat.h}
              fill="transparent"
              style={{ cursor: "grab" }}
              onPointerDown={onBgDown}
            />

            {LINE_IDS.map((lineId) => {
              const line = lines[lineId];
              const color = LINE_COLOR[lineId];
              const rad = (line.angleDeg * Math.PI) / 180;
              const cos = Math.cos(rad);
              const sin = Math.sin(rad);
              const cx_nat = line.cx * nat.w;
              const cy_nat = line.cy * nat.h;
              const EXT = SCALE * 4;

              const x1 = cx_nat - cos * EXT; const y1 = cy_nat - sin * EXT;
              const x2 = cx_nat + cos * EXT; const y2 = cy_nat + sin * EXT;
              const h1x = cx_nat - cos * HANDLE_NAT; const h1y = cy_nat - sin * HANDLE_NAT;
              const h2x = cx_nat + cos * HANDLE_NAT; const h2y = cy_nat + sin * HANDLE_NAT;

              return (
                <g key={lineId}>
                  {/* shadow */}
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="black" strokeWidth={STROKE * 3} strokeOpacity="0.45" style={{ pointerEvents: "none" }} />
                  {/* main */}
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={STROKE} strokeOpacity="0.9" style={{ pointerEvents: "none" }} />
                  {/* center dot — drag to translate */}
                  <circle cx={cx_nat} cy={cy_nat} r={CR} fill={color} stroke="white" strokeWidth={STROKE * 1.5} style={{ cursor: "move" }} onPointerDown={(e) => onCenterDown(lineId, e)} />
                  {/* endpoint handles — drag to rotate */}
                  <circle cx={h1x} cy={h1y} r={HR} fill="white" stroke={color} strokeWidth={STROKE * 1.5} style={{ cursor: "crosshair" }} onPointerDown={(e) => onHandleDown(lineId, e)} />
                  <circle cx={h2x} cy={h2y} r={HR} fill="white" stroke={color} strokeWidth={STROKE * 1.5} style={{ cursor: "crosshair" }} onPointerDown={(e) => onHandleDown(lineId, e)} />
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* ── Footer readout ── */}
      <div className="shrink-0 h-11 flex items-center gap-5 px-4 border-t border-border font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted uppercase tracking-widest">L / R</span>
          <span className={`font-semibold tabular-nums ${lrOff ? "text-yellow-400" : "text-green"}`}>
            {centering.lr} / {100 - centering.lr}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted uppercase tracking-widest">T / B</span>
          <span className={`font-semibold tabular-nums ${tbOff ? "text-yellow-400" : "text-green"}`}>
            {centering.tb} / {100 - centering.tb}
          </span>
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted uppercase tracking-widest">Tilt</span>
          <span className={`font-semibold tabular-nums ${rotOff ? "text-yellow-400" : "text-green"}`}>
            {centering.rotationDeg > 0 ? "+" : ""}{centering.rotationDeg}°
          </span>
          {rotOff && (
            <span className="text-[10px] text-muted">
              {centering.rotationDeg > 0 ? "CW" : "CCW"}
            </span>
          )}
        </div>
        <div className="ml-auto text-[10px] text-muted">
          {Math.round(zoom * 100)}%
        </div>
      </div>
    </div>
  );
}
