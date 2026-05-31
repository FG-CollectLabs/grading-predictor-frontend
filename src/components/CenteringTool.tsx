import { useEffect, useRef, useState } from "react";

export interface CenteringResult {
  lr: number; // left-border % of total horizontal border (0–100)
  tb: number; // top-border % of total vertical border (0–100)
}

interface MeasureLine {
  cx: number;      // 0–1 fraction of image width
  cy: number;      // 0–1 fraction of image height
  angleDeg: number; // angle in screen-pixel space (0=→, 90=↓)
}

type LineId =
  | "leftEdge" | "rightEdge" | "topEdge" | "bottomEdge"
  | "leftArt"  | "rightArt"  | "topArt"  | "bottomArt";

type Lines = Record<LineId, MeasureLine>;

// PSA slab defaults — card occupies ~90% of scan, artwork inner border ~15% in from card edges
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

interface DragState {
  lineId: LineId;
  mode: "center" | "handle";
  startCx: number;
  startCy: number;
  startMxFrac: number;
  startMyFrac: number;
}

// Compute the normalized-x position where `line` crosses y=y_frac (0–1)
function xAtY(line: MeasureLine, y_frac: number, nat: { w: number; h: number }): number {
  const rad = (line.angleDeg * Math.PI) / 180;
  const s = Math.sin(rad);
  if (Math.abs(s) < 1e-9) return line.cx;
  const dy_nat = (y_frac - line.cy) * nat.h;
  const dx_nat = (dy_nat * Math.cos(rad)) / s;
  return line.cx + dx_nat / nat.w;
}

// Compute the normalized-y position where `line` crosses x=x_frac (0–1)
function yAtX(line: MeasureLine, x_frac: number, nat: { w: number; h: number }): number {
  const rad = (line.angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  if (Math.abs(c) < 1e-9) return line.cy;
  const dx_nat = (x_frac - line.cx) * nat.w;
  const dy_nat = (dx_nat * Math.sin(rad)) / c;
  return line.cy + dy_nat / nat.h;
}

function computeCentering(lines: Lines, nat: { w: number; h: number }): CenteringResult {
  const leftBorder  = xAtY(lines.leftArt,    0.5, nat) - xAtY(lines.leftEdge,   0.5, nat);
  const rightBorder = xAtY(lines.rightEdge,  0.5, nat) - xAtY(lines.rightArt,   0.5, nat);
  const totalLR = leftBorder + rightBorder;

  const topBorder    = yAtX(lines.topArt,     0.5, nat) - yAtX(lines.topEdge,    0.5, nat);
  const bottomBorder = yAtX(lines.bottomEdge, 0.5, nat) - yAtX(lines.bottomArt,  0.5, nat);
  const totalTB = topBorder + bottomBorder;

  return {
    lr: totalLR > 0 ? Math.max(0, Math.min(100, Math.round((leftBorder  / totalLR) * 100))) : 50,
    tb: totalTB > 0 ? Math.max(0, Math.min(100, Math.round((topBorder   / totalTB) * 100))) : 50,
  };
}

export function CenteringTool({
  imageUrl,
  onChange,
}: {
  imageUrl: string;
  onChange: (result: CenteringResult) => void;
}) {
  const [lines, setLines] = useState<Lines>(() => ({ ...DEFAULT_LINES }));
  const [nat, setNat] = useState({ w: 800, h: 1120 }); // updated on image load
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<DragState | null>(null);

  // Keep a stable ref so useEffect deps stay clean
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const centering = computeCentering(lines, nat);

  useEffect(() => {
    onChangeRef.current(centering);
  }, [centering.lr, centering.tb]); // eslint-disable-line react-hooks/exhaustive-deps

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    setNat({ w: img.naturalWidth, h: img.naturalHeight });
  }

  // Convert a pointer event to normalized (0–1) image fraction coords
  function toFrac(e: React.PointerEvent): { nx: number; ny: number } {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      nx: (e.clientX - rect.left)  / rect.width,
      ny: (e.clientY - rect.top) / rect.height,
    };
  }

  function onCenterDown(lineId: LineId, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const { nx, ny } = toFrac(e);
    drag.current = {
      lineId, mode: "center",
      startCx: lines[lineId].cx, startCy: lines[lineId].cy,
      startMxFrac: nx, startMyFrac: ny,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onHandleDown(lineId: LineId, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const { nx, ny } = toFrac(e);
    drag.current = {
      lineId, mode: "handle",
      startCx: lines[lineId].cx, startCy: lines[lineId].cy,
      startMxFrac: nx, startMyFrac: ny,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const { nx, ny } = toFrac(e);
    const d = drag.current;

    setLines((prev) => {
      const line = prev[d.lineId];
      if (d.mode === "center") {
        return {
          ...prev,
          [d.lineId]: {
            ...line,
            cx: d.startCx + (nx - d.startMxFrac),
            cy: d.startCy + (ny - d.startMyFrac),
          },
        };
      } else {
        // Rotate: compute angle from center to mouse in screen-pixel space
        const dx_px = (nx - line.cx) * nat.w;
        const dy_px = (ny - line.cy) * nat.h;
        const angleDeg = (Math.atan2(dy_px, dx_px) * 180) / Math.PI;
        return { ...prev, [d.lineId]: { ...line, angleDeg } };
      }
    });
  }

  function onPointerUp() {
    drag.current = null;
  }

  // Derived render constants in natural-pixel space
  const HANDLE_NAT = Math.max(nat.w, nat.h) * 0.14; // handle arm length in natural px
  const STROKE = Math.max(nat.w, nat.h) * 0.003;     // line stroke width
  const CENTER_R = Math.max(nat.w, nat.h) * 0.012;   // center circle radius
  const HANDLE_R = Math.max(nat.w, nat.h) * 0.008;   // endpoint circle radius

  const lrOff = Math.abs(centering.lr - 50) >= 5;
  const tbOff = Math.abs(centering.tb - 50) >= 5;

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-muted uppercase tracking-widest">
        Centering &mdash; <span className="normal-case not-italic text-[#e6edf3]">gray = card edges &nbsp;·&nbsp; blue = artwork border</span>
      </div>
      <div className="relative select-none" style={{ touchAction: "none" }}>
        <img
          src={imageUrl}
          alt="scan"
          className="block w-full"
          draggable={false}
          onLoad={onImgLoad}
        />
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${nat.w} ${nat.h}`}
          preserveAspectRatio="none"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          style={{ touchAction: "none", overflow: "visible" }}
        >
          {LINE_IDS.map((lineId) => {
            const line = lines[lineId];
            const color = LINE_COLOR[lineId];
            const rad = (line.angleDeg * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            // Natural-px center
            const cx_nat = line.cx * nat.w;
            const cy_nat = line.cy * nat.h;
            const EXT = Math.max(nat.w, nat.h) * 3;

            // Line endpoints (extending well beyond image)
            const x1 = cx_nat - cos * EXT;
            const y1 = cy_nat - sin * EXT;
            const x2 = cx_nat + cos * EXT;
            const y2 = cy_nat + sin * EXT;

            // Endpoint handle positions
            const h1x = cx_nat - cos * HANDLE_NAT;
            const h1y = cy_nat - sin * HANDLE_NAT;
            const h2x = cx_nat + cos * HANDLE_NAT;
            const h2y = cy_nat + sin * HANDLE_NAT;

            return (
              <g key={lineId}>
                {/* Shadow for contrast on light backgrounds */}
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke="black" strokeWidth={STROKE * 2.5} strokeOpacity="0.35"
                  style={{ pointerEvents: "none" }}
                />
                {/* Main line */}
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={color} strokeWidth={STROKE} strokeOpacity="0.95"
                  style={{ pointerEvents: "none" }}
                />

                {/* Center translate handle */}
                <circle
                  cx={cx_nat} cy={cy_nat} r={CENTER_R}
                  fill={color} stroke="white" strokeWidth={STROKE * 1.5}
                  style={{ cursor: "move" }}
                  onPointerDown={(e) => onCenterDown(lineId, e)}
                />

                {/* Rotation handles */}
                <circle
                  cx={h1x} cy={h1y} r={HANDLE_R}
                  fill="white" stroke={color} strokeWidth={STROKE * 1.5}
                  style={{ cursor: "crosshair" }}
                  onPointerDown={(e) => onHandleDown(lineId, e)}
                />
                <circle
                  cx={h2x} cy={h2y} r={HANDLE_R}
                  fill="white" stroke={color} strokeWidth={STROKE * 1.5}
                  style={{ cursor: "crosshair" }}
                  onPointerDown={(e) => onHandleDown(lineId, e)}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Live centering readout */}
      <div className="flex items-center gap-4 text-xs font-mono bg-bg border border-border rounded px-3 py-2">
        <span className="text-muted">L/R</span>
        <span className={`font-semibold ${lrOff ? "text-yellow-400" : "text-green"}`}>
          {centering.lr} / {100 - centering.lr}
        </span>
        <span className="text-border">|</span>
        <span className="text-muted">T/B</span>
        <span className={`font-semibold ${tbOff ? "text-yellow-400" : "text-green"}`}>
          {centering.tb} / {100 - centering.tb}
        </span>
        {(lrOff || tbOff) && (
          <span className="text-yellow-400 text-[10px] ml-1">off-center</span>
        )}
      </div>
    </div>
  );
}
