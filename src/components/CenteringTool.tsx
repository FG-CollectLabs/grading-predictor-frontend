import { useRef, useState } from "react";
import { autoDetectCardEdge } from "../utils/autoEdge";

export interface CenteringResult {
  lr: number;          // 0–100: left border % of total horizontal
  tb: number;          // 0–100: top border % of total vertical
  rotationDeg: number; // card tilt: +CW, -CCW
}

interface MeasureLine {
  cx: number; cy: number; angleDeg: number;
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

function xAtY(line: MeasureLine, y_frac: number, nat: { w: number; h: number }): number {
  const rad = (line.angleDeg * Math.PI) / 180;
  const s = Math.sin(rad);
  if (Math.abs(s) < 1e-9) return line.cx;
  return line.cx + ((y_frac - line.cy) * nat.h * Math.cos(rad)) / (s * nat.w);
}

function yAtX(line: MeasureLine, x_frac: number, nat: { w: number; h: number }): number {
  const rad = (line.angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  if (Math.abs(c) < 1e-9) return line.cy;
  return line.cy + ((x_frac - line.cx) * nat.w * Math.sin(rad)) / (c * nat.h);
}

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

interface CropBox { x1: number; y1: number; x2: number; y2: number; }
type CropCorner = "tl" | "tr" | "bl" | "br";

type DragState =
  | { type: "pan";         startPanX: number; startPanY: number; startClientX: number; startClientY: number }
  | { type: "line-center"; lineId: LineId; startCx: number; startCy: number; startMxFrac: number; startMyFrac: number }
  | { type: "line-handle"; lineId: LineId }
  | { type: "crop-corner"; which: CropCorner; startBox: CropBox; startNx: number; startNy: number }
  | { type: "crop-body";   startBox: CropBox; startNx: number; startNy: number };

export function CenteringTool({
  frontImage,
  backImage,
  onDone,
  onSkip,
  doneLabel = "Save & Continue →",
}: {
  frontImage?: string;
  backImage?: string;
  onDone: (front: CenteringResult, back: CenteringResult) => void;
  onSkip: () => void;
  doneLabel?: string;
}) {
  const [mode, setMode] = useState<"crop" | "lines">("crop");
  const [side, setSide] = useState<"front" | "back">(frontImage ? "front" : "back");

  // Crop boxes (0–1 fractions of original image)
  const [frontCrop, setFrontCrop] = useState<CropBox>({ x1: 0.05, y1: 0.05, x2: 0.95, y2: 0.95 });
  const [backCrop,  setBackCrop]  = useState<CropBox>({ x1: 0.05, y1: 0.05, x2: 0.95, y2: 0.95 });
  const [frontCropped, setFrontCropped] = useState<string | null>(null);
  const [backCropped,  setBackCropped]  = useState<string | null>(null);

  // Natural dimensions: "orig" = original scan, "work" = post-crop working image
  const [origFrontNat, setOrigFrontNat] = useState({ w: 800, h: 1120 });
  const [origBackNat,  setOrigBackNat]  = useState({ w: 800, h: 1120 });
  const [frontNat, setFrontNat] = useState({ w: 800, h: 1120 });
  const [backNat,  setBackNat]  = useState({ w: 800, h: 1120 });

  // Centering measurement lines
  const [frontLines, setFrontLines] = useState<Lines>(() => ({ ...DEFAULT_LINES }));
  const [backLines,  setBackLines]  = useState<Lines>(() => ({ ...DEFAULT_LINES }));

  // Viewport transform
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const outerRef = useRef<HTMLDivElement>(null);
  const svgRef   = useRef<SVGSVGElement>(null);
  const drag     = useRef<DragState | null>(null);

  // ── Derived aliases ───────────────────────────────────────────────────────
  const origNat = side === "front" ? origFrontNat : origBackNat;
  const workNat = side === "front" ? frontNat  : backNat;
  const nat     = mode === "crop" ? origNat : workNat;
  const lines   = side === "front" ? frontLines : backLines;
  const setLines = side === "front" ? setFrontLines : setBackLines;
  const crop     = side === "front" ? frontCrop  : backCrop;
  const setCrop  = side === "front" ? setFrontCrop : setBackCrop;

  const origImage    = side === "front" ? frontImage    : backImage;
  const croppedImage = side === "front" ? frontCropped  : backCropped;
  const currentImage = mode === "crop" ? origImage : (croppedImage ?? origImage);

  const centering = computeCentering(lines, nat);
  const hasBoth   = !!(frontImage && backImage);

  // ── Layout helpers ────────────────────────────────────────────────────────
  function fitImage(nw: number, nh: number) {
    const outer = outerRef.current;
    if (!outer) return;
    const { width, height } = outer.getBoundingClientRect();
    const fz = Math.min((width / nw) * 0.95, (height / nh) * 0.95);
    setZoom(fz);
    setPanX((width  - nw * fz) / 2);
    setPanY((height - nh * fz) / 2);
  }

  function zoomAt(factor: number, cx?: number, cy?: number) {
    const outer = outerRef.current;
    if (!outer) return;
    const rect = outer.getBoundingClientRect();
    const pcx = cx ?? rect.width  / 2;
    const pcy = cy ?? rect.height / 2;
    setZoom((z) => {
      const nz = Math.max(0.05, Math.min(40, z * factor));
      const ratio = nz / z;
      setPanX((px) => pcx - (pcx - px) * ratio);
      setPanY((py) => pcy - (pcy - py) * ratio);
      return nz;
    });
  }

  // ── Image load ────────────────────────────────────────────────────────────
  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const nw  = img.naturalWidth  || 800;
    const nh  = img.naturalHeight || 1120;

    if (mode === "crop") {
      if (side === "front") setOrigFrontNat({ w: nw, h: nh });
      else                  setOrigBackNat({ w: nw, h: nh });

      const box = autoDetectCardEdge(img);
      if (box) {
        const detected = {
          x1: Math.max(0, box.x1 / nw),
          y1: Math.max(0, box.y1 / nh),
          x2: Math.min(1, box.x2 / nw),
          y2: Math.min(1, box.y2 / nh),
        };
        if (side === "front") setFrontCrop(detected);
        else                  setBackCrop(detected);
      }
    } else {
      if (side === "front") setFrontNat({ w: nw, h: nh });
      else                  setBackNat({ w: nw, h: nh });
    }

    fitImage(nw, nh);
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────
  function toFrac(clientX: number, clientY: number) {
    const rect = svgRef.current!.getBoundingClientRect();
    return { nx: (clientX - rect.left) / rect.width, ny: (clientY - rect.top) / rect.height };
  }

  // ── Pointer handlers ──────────────────────────────────────────────────────
  function onBgDown(e: React.PointerEvent) {
    e.preventDefault();
    drag.current = { type: "pan", startPanX: panX, startPanY: panY, startClientX: e.clientX, startClientY: e.clientY };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onCenterDown(lineId: LineId, e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    const { nx, ny } = toFrac(e.clientX, e.clientY);
    drag.current = { type: "line-center", lineId, startCx: lines[lineId].cx, startCy: lines[lineId].cy, startMxFrac: nx, startMyFrac: ny };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onHandleDown(lineId: LineId, e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    drag.current = { type: "line-handle", lineId };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onCropCornerDown(which: CropCorner, e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    const { nx, ny } = toFrac(e.clientX, e.clientY);
    drag.current = { type: "crop-corner", which, startBox: { ...crop }, startNx: nx, startNy: ny };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onCropBodyDown(e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    const { nx, ny } = toFrac(e.clientX, e.clientY);
    drag.current = { type: "crop-body", startBox: { ...crop }, startNx: nx, startNy: ny };
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
        [d.lineId]: { ...prev[d.lineId], cx: d.startCx + (nx - d.startMxFrac), cy: d.startCy + (ny - d.startMyFrac) },
      }));
      return;
    }

    if (d.type === "line-handle") {
      const line = lines[d.lineId];
      const angleDeg = (Math.atan2((ny - line.cy) * nat.h, (nx - line.cx) * nat.w) * 180) / Math.PI;
      setLines((prev) => ({ ...prev, [d.lineId]: { ...prev[d.lineId], angleDeg } }));
      return;
    }

    if (d.type === "crop-corner") {
      const dx = nx - d.startNx; const dy = ny - d.startNy;
      const MIN = 0.05;
      const b = { ...d.startBox };
      if (d.which === "tl") { b.x1 = Math.max(0, Math.min(b.x2 - MIN, b.x1 + dx)); b.y1 = Math.max(0, Math.min(b.y2 - MIN, b.y1 + dy)); }
      if (d.which === "tr") { b.x2 = Math.min(1, Math.max(b.x1 + MIN, b.x2 + dx)); b.y1 = Math.max(0, Math.min(b.y2 - MIN, b.y1 + dy)); }
      if (d.which === "bl") { b.x1 = Math.max(0, Math.min(b.x2 - MIN, b.x1 + dx)); b.y2 = Math.min(1, Math.max(b.y1 + MIN, b.y2 + dy)); }
      if (d.which === "br") { b.x2 = Math.min(1, Math.max(b.x1 + MIN, b.x2 + dx)); b.y2 = Math.min(1, Math.max(b.y1 + MIN, b.y2 + dy)); }
      setCrop(b);
      return;
    }

    if (d.type === "crop-body") {
      const dx = nx - d.startNx; const dy = ny - d.startNy;
      const w = d.startBox.x2 - d.startBox.x1; const h = d.startBox.y2 - d.startBox.y1;
      const x1 = Math.max(0, Math.min(1 - w, d.startBox.x1 + dx));
      const y1 = Math.max(0, Math.min(1 - h, d.startBox.y1 + dy));
      setCrop({ x1, y1, x2: x1 + w, y2: y1 + h });
      return;
    }
  }

  function onPointerUp() { drag.current = null; }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const outer = outerRef.current;
    if (!outer) return;
    const rect = outer.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
  }

  // ── Crop application ──────────────────────────────────────────────────────
  async function applyCrop() {
    const advanceAfter = () => {
      // After cropping front, auto-advance to crop back if it hasn't been cropped yet.
      // onImgLoad for the back image will call fitImage, so don't call it here.
      if (side === "front" && backImage && !backCropped) {
        setSide("back");
      } else {
        setMode("lines");
      }
    };

    if (!origImage) { advanceAfter(); return; }
    const img = new Image();
    img.src = origImage;
    if (!img.complete) await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); });

    const nw = img.naturalWidth; const nh = img.naturalHeight;
    const cx = Math.max(0, Math.round(crop.x1 * nw));
    const cy = Math.max(0, Math.round(crop.y1 * nh));
    const cw = Math.min(nw - cx, Math.round((crop.x2 - crop.x1) * nw));
    const ch = Math.min(nh - cy, Math.round((crop.y2 - crop.y1) * nh));
    if (cw < 4 || ch < 4) { advanceAfter(); return; }

    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    canvas.getContext("2d")!.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
    const url = canvas.toDataURL("image/jpeg", 0.95);

    if (side === "front") {
      setFrontCropped(url);
      setFrontNat({ w: cw, h: ch });
      if (backImage && !backCropped) {
        setSide("back"); // onImgLoad handles fitImage
        return;
      }
    } else {
      setBackCropped(url);
      setBackNat({ w: cw, h: ch });
    }

    fitImage(cw, ch);
    setMode("lines");
  }

  function handleDone() {
    onDone(computeCentering(frontLines, frontNat), computeCentering(backLines, backNat));
  }

  // ── Render constants (all in natural-px space, /zoom = fixed screen size) ─
  const SCALE      = Math.max(nat.w, nat.h);
  const STROKE     = 1   / zoom;
  const SHADOW     = 3   / zoom;
  const CENTER_R   = 10  / zoom;
  const HANDLE_R   = 7   / zoom;
  const CROP_R     = 8   / zoom;
  const HANDLE_ARM = 150 / zoom;   // always 150px from center
  const EXT        = SCALE * 4;   // extend well past image edges

  const lrOff  = Math.abs(centering.lr  - 50) >= 5;
  const tbOff  = Math.abs(centering.tb  - 50) >= 5;
  const rotOff = Math.abs(centering.rotationDeg) >= 1;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0d1117" }}>

      {/* Header */}
      <div className="shrink-0 h-11 flex items-center gap-2 px-4 border-b border-border">
        <span className="text-sm font-semibold text-[#e6edf3]">
          {mode === "crop" ? "Crop to Card" : "Centering"}
        </span>
        <span className="hidden sm:block text-[10px] text-muted">
          {mode === "crop"
            ? "auto-detected · drag corners to adjust · scroll to zoom"
            : "gray = card edges · blue = artwork · drag dots · scroll to zoom"}
        </span>

        {hasBoth && (
          <div className="flex gap-1 ml-2">
            {(["front", "back"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                  side === s ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:border-[#8b949e]"
                }`}
              >
                {s === "front" ? "Front" : "Back"}
                {s === "front" && frontCropped && mode === "lines" ? " ✓" : ""}
                {s === "back"  && backCropped  && mode === "lines" ? " ✓" : ""}
              </button>
            ))}
          </div>
        )}

        {/* Zoom controls */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => zoomAt(1.3)} className="w-7 h-7 flex items-center justify-center border border-border text-muted rounded hover:border-[#8b949e] text-base font-bold leading-none transition-colors">+</button>
          <button onClick={() => zoomAt(1/1.3)} className="w-7 h-7 flex items-center justify-center border border-border text-muted rounded hover:border-[#8b949e] text-base font-bold leading-none transition-colors">−</button>
          <button onClick={() => fitImage(nat.w, nat.h)} className="px-2 py-1 text-[10px] border border-border text-muted rounded hover:border-[#8b949e] transition-colors">Fit</button>
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        {mode === "crop" ? (
          <>
            <button onClick={() => setMode("lines")} className="px-3 py-1 text-xs border border-border text-muted rounded hover:border-[#8b949e] transition-colors">Skip crop</button>
            <button onClick={applyCrop} className="bg-accent text-bg font-semibold px-4 py-1.5 rounded text-xs hover:bg-accent/90 transition-colors">
              {side === "front" && backImage && !backCropped ? "Crop Front → Back" : "Apply Crop →"}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setMode("crop")} className="px-3 py-1 text-xs border border-border text-muted rounded hover:border-[#8b949e] transition-colors">Re-crop</button>
            <button onClick={onSkip} className="px-3 py-1 text-xs border border-border text-muted rounded hover:border-[#8b949e] transition-colors">Skip</button>
            <button onClick={handleDone} className="bg-accent text-bg font-semibold px-4 py-1.5 rounded text-xs hover:bg-accent/90 transition-colors">{doneLabel}</button>
          </>
        )}
      </div>

      {/* Main canvas */}
      <div
        ref={outerRef}
        className="flex-1 relative overflow-hidden"
        onWheel={onWheel}
        style={{ touchAction: "none" }}
      >
        <div style={{
          position: "absolute", left: 0, top: 0,
          width: nat.w, height: nat.h,
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}>
          {currentImage && (
            <img
              key={`${mode}-${side}`}
              src={currentImage}
              alt="scan"
              draggable={false}
              onLoad={onImgLoad}
              style={{ display: "block", width: nat.w, height: nat.h }}
            />
          )}

          <svg
            ref={svgRef}
            style={{ position: "absolute", top: 0, left: 0, width: nat.w, height: nat.h, overflow: "visible", touchAction: "none" }}
            viewBox={`0 0 ${nat.w} ${nat.h}`}
            preserveAspectRatio="none"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            {/* Background pan target */}
            <rect x={0} y={0} width={nat.w} height={nat.h} fill="transparent" style={{ cursor: "grab" }} onPointerDown={onBgDown} />

            {/* ── Crop mode overlay ── */}
            {mode === "crop" && (() => {
              const bx = crop.x1 * nat.w; const by = crop.y1 * nat.h;
              const bw = (crop.x2 - crop.x1) * nat.w; const bh = (crop.y2 - crop.y1) * nat.h;
              const corners: { id: CropCorner; cx: number; cy: number }[] = [
                { id: "tl", cx: bx,      cy: by      },
                { id: "tr", cx: bx + bw, cy: by      },
                { id: "bl", cx: bx,      cy: by + bh },
                { id: "br", cx: bx + bw, cy: by + bh },
              ];
              return (
                <>
                  {/* Dark vignette outside crop box */}
                  <path
                    d={`M 0 0 H ${nat.w} V ${nat.h} H 0 Z M ${bx} ${by} H ${bx + bw} V ${by + bh} H ${bx} Z`}
                    fill="rgba(0,0,0,0.55)" fillRule="evenodd"
                    style={{ pointerEvents: "none" }}
                  />
                  {/* Dashed border */}
                  <rect x={bx} y={by} width={bw} height={bh}
                    fill="transparent" stroke="white" strokeWidth={STROKE}
                    strokeDasharray={`${6/zoom} ${4/zoom}`}
                    style={{ pointerEvents: "none" }}
                  />
                  {/* Body drag (move) */}
                  <rect x={bx + CROP_R} y={by + CROP_R}
                    width={Math.max(0, bw - CROP_R * 2)} height={Math.max(0, bh - CROP_R * 2)}
                    fill="transparent" style={{ cursor: "move" }} onPointerDown={onCropBodyDown}
                  />
                  {/* Corner handles */}
                  {corners.map(({ id, cx: hx, cy: hy }) => (
                    <circle key={id} cx={hx} cy={hy} r={CROP_R}
                      fill="white" stroke="#58a6ff" strokeWidth={STROKE * 1.5}
                      style={{ cursor: id === "tl" || id === "br" ? "nwse-resize" : "nesw-resize" }}
                      onPointerDown={(e) => onCropCornerDown(id, e)}
                    />
                  ))}
                </>
              );
            })()}

            {/* ── Lines mode overlay ── */}
            {mode === "lines" && LINE_IDS.map((lineId) => {
              const line = lines[lineId];
              const color = LINE_COLOR[lineId];
              const rad = (line.angleDeg * Math.PI) / 180;
              const cos = Math.cos(rad); const sin = Math.sin(rad);
              const cx_nat = line.cx * nat.w; const cy_nat = line.cy * nat.h;
              const x1 = cx_nat - cos * EXT; const y1 = cy_nat - sin * EXT;
              const x2 = cx_nat + cos * EXT; const y2 = cy_nat + sin * EXT;
              const h1x = cx_nat - cos * HANDLE_ARM; const h1y = cy_nat - sin * HANDLE_ARM;
              const h2x = cx_nat + cos * HANDLE_ARM; const h2y = cy_nat + sin * HANDLE_ARM;

              return (
                <g key={lineId}>
                  {/* Shadow for visibility on light backgrounds */}
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="black" strokeWidth={SHADOW} strokeOpacity="0.5" style={{ pointerEvents: "none" }} />
                  {/* Main 1px line */}
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={STROKE} strokeOpacity="0.95" style={{ pointerEvents: "none" }} />
                  {/* Center dot — translate */}
                  <circle cx={cx_nat} cy={cy_nat} r={CENTER_R} fill={color} stroke="white" strokeWidth={STROKE * 1.5} style={{ cursor: "move" }} onPointerDown={(e) => onCenterDown(lineId, e)} />
                  {/* Endpoint handles — rotate */}
                  <circle cx={h1x} cy={h1y} r={HANDLE_R} fill="white" stroke={color} strokeWidth={STROKE * 1.5} style={{ cursor: "crosshair" }} onPointerDown={(e) => onHandleDown(lineId, e)} />
                  <circle cx={h2x} cy={h2y} r={HANDLE_R} fill="white" stroke={color} strokeWidth={STROKE * 1.5} style={{ cursor: "crosshair" }} onPointerDown={(e) => onHandleDown(lineId, e)} />
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Footer readout */}
      <div className="shrink-0 h-11 flex items-center gap-4 px-4 border-t border-border font-mono text-xs">
        {mode === "lines" ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted uppercase tracking-widest">L/R</span>
              <span className={`font-semibold tabular-nums ${lrOff ? "text-yellow-400" : "text-green"}`}>{centering.lr} / {100 - centering.lr}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted uppercase tracking-widest">T/B</span>
              <span className={`font-semibold tabular-nums ${tbOff ? "text-yellow-400" : "text-green"}`}>{centering.tb} / {100 - centering.tb}</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted uppercase tracking-widest">Tilt</span>
              <span className={`font-semibold tabular-nums ${rotOff ? "text-yellow-400" : "text-green"}`}>
                {centering.rotationDeg > 0 ? "+" : ""}{centering.rotationDeg}°
              </span>
              {rotOff && <span className="text-[10px] text-muted">{centering.rotationDeg > 0 ? "CW" : "CCW"}</span>}
            </div>
          </>
        ) : (
          <span className="text-[10px] text-muted">
            Crop to the card edge, then apply — centering lines will be set on the cropped image
          </span>
        )}
        <div className="ml-auto text-[10px] text-muted">{Math.round(zoom * 100)}%</div>
      </div>
    </div>
  );
}
