import { useCallback, useEffect, useMemo, useState } from "react";
import { api, imageUrl } from "../api";
import type { BatchDetail, BatchLayout, LayoutSide, Pt } from "../types";

// Mark a batch's cards by hand, for scans the sheet finder can't read
// (toploaders, sleeves, a sheet protector): say how many cards there are,
// whether each page shows fronts or backs, and draw a box along each card's
// edge numbered so front N pairs with back N. "Measure" runs the edge and
// border detection inside the boxes.
//
// Starts from the saved layout, else from what the automatic run found (its
// pairing numbers, so a fixed-up automatic result is a few clicks).

type Box = { card: number; quad: Pt[] };
type PageEd = { page: number; label: string; preview: string; size: [number, number]; side: LayoutSide; boxes: Box[] };
type Drag =
  | { kind: "new"; page: number; from: Pt; to: Pt }
  | { kind: "corner"; page: number; idx: number; corner: number }
  | { kind: "move"; page: number; idx: number; last: Pt };

const pageOf = (path: string | null | undefined) => {
  const m = path?.match(/-p(\d+)-/);
  return m ? Number(m[1]) : null;
};

export function initial(d: BatchDetail): { cards: number; pages: PageEd[] } {
  const pages = new Map<number, PageEd>();
  for (const p of d.batch.pages ?? []) {
    if (p.preview) pages.set(p.page, { page: p.page, label: p.label, preview: p.preview, size: p.size, side: p.side === "back" ? "back" : p.side === "front" ? "front" : "skip", boxes: [] });
  }
  // older runs: the sheets' previews are the pages
  for (const s of d.sheets) {
    for (const side of ["front", "back"] as const) {
      const prev = side === "front" ? s.front_preview : s.back_preview;
      const size = side === "front" ? s.front_size : s.back_size;
      const n = pageOf(prev);
      if (prev && size && n != null && !pages.has(n)) pages.set(n, { page: n, label: `page ${n}`, preview: prev, size, side, boxes: [] });
    }
  }
  const lay = d.batch.layout;
  if (lay) {
    for (const lp of lay.pages) {
      const p = pages.get(lp.page);
      if (p) { p.side = lp.side; p.boxes = lp.boxes.map((b) => ({ card: b.card, quad: b.quad.map((q) => [q[0], q[1]] as Pt) })); }
    }
    return { cards: lay.cards, pages: [...pages.values()].sort((a, b) => a.page - b.page) };
  }
  // from the automatic run: number cards across sheets in order
  const sheetBase = new Map<number, number>();
  let base = 0;
  for (const s of [...d.sheets].sort((a, b) => a.sheet_no - b.sheet_no)) {
    sheetBase.set(s.sheet_no, base);
    base += d.cards.filter((c) => c.sheet_no === s.sheet_no).length;
  }
  for (const c of d.cards) {
    const s = d.sheets.find((x) => x.sheet_no === c.sheet_no);
    if (!s) continue;
    const no = (sheetBase.get(c.sheet_no) ?? 0) + c.pos;
    for (const side of ["front", "back"] as const) {
      const n = pageOf(side === "front" ? s.front_preview : s.back_preview);
      const q = c[side]?.quad;
      const p = n != null ? pages.get(n) : undefined;
      if (p && q?.length === 4) p.boxes.push({ card: no, quad: q.map((x) => [x[0], x[1]] as Pt) });
    }
  }
  return { cards: Math.max(base, 1), pages: [...pages.values()].sort((a, b) => a.page - b.page) };
}

function rectQuad(a: Pt, b: Pt): Pt[] {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

export default function BatchLayoutEditor({ d, onClose, onSaved }: { d: BatchDetail; onClose: () => void; onSaved: () => void }) {
  const init = useMemo(() => initial(d), [d]);
  const [cards, setCards] = useState(init.cards);
  const [pages, setPages] = useState<PageEd[]>(init.pages);
  const [width, setWidth] = useState(720);
  const [sel, setSel] = useState<{ page: number; idx: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setPage = useCallback((n: number, f: (p: PageEd) => PageEd) => setPages((ps) => ps.map((p) => (p.page === n ? f(p) : p))), []);

  const used = (side: LayoutSide, except?: { page: number; idx: number }) =>
    new Set(pages.filter((p) => p.side === side).flatMap((p) => p.boxes.filter((_, i) => !(except && except.page === p.page && except.idx === i)).map((b) => b.card)));
  const nextFree = (side: LayoutSide) => {
    const u = used(side);
    for (let i = 1; i <= cards; i++) if (!u.has(i)) return i;
    return cards + 1;
  };

  const status = useMemo(() => {
    const out: Record<"front" | "back", { have: number; missing: number[]; dup: number[] }> = {
      front: { have: 0, missing: [], dup: [] }, back: { have: 0, missing: [], dup: [] },
    };
    for (const side of ["front", "back"] as const) {
      const nums = pages.filter((p) => p.side === side).flatMap((p) => p.boxes.map((b) => b.card));
      const seen = new Set<number>();
      for (const n of nums) { if (seen.has(n)) out[side].dup.push(n); seen.add(n); }
      out[side].have = seen.size;
      for (let i = 1; i <= cards; i++) if (!seen.has(i)) out[side].missing.push(i);
    }
    return out;
  }, [pages, cards]);
  const over = pages.some((p) => p.side !== "skip" && p.boxes.some((b) => b.card > cards));
  const valid = !over && status.front.dup.length === 0 && status.back.dup.length === 0 &&
    pages.some((p) => p.side !== "skip" && p.boxes.length > 0);

  // Delete / Backspace removes the selected box
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!sel || !(e.key === "Delete" || e.key === "Backspace")) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "SELECT") return;
      e.preventDefault();
      setPage(sel.page, (p) => ({ ...p, boxes: p.boxes.filter((_, i) => i !== sel.idx) }));
      setSel(null);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [sel, setPage]);

  const save = async (start: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const layout: BatchLayout = {
        cards,
        pages: pages.map((p) => ({ page: p.page, side: p.side, boxes: p.side === "skip" ? [] : p.boxes.map((b) => ({ card: b.card, quad: b.quad.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as Pt) })) })),
      };
      await api.putBatchLayout(d.batch.id, layout, start);
      onSaved();
      if (start) onClose();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };
  const backToAuto = async () => {
    setBusy(true);
    try {
      await api.deleteBatchLayout(d.batch.id);
      await api.startBatch(d.batch.id);
      onSaved();
      onClose();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const sideLine = (side: "front" | "back") => {
    const s = status[side];
    return (
      <span className={s.have === cards && !s.dup.length ? "text-green" : "text-yellow"}>
        {side}s {s.have}/{cards}
        {s.missing.length > 0 && s.missing.length <= 12 && <span className="text-muted"> (missing {s.missing.join(", ")})</span>}
        {s.dup.length > 0 && <span className="text-red-400"> · {s.dup.join(", ")} twice</span>}
      </span>
    );
  };

  return (
    <div className="border border-accent/40 rounded-md p-3 space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold text-sm">Mark cards by hand</span>
        <label className="flex items-center gap-1">cards
          <input type="number" min={1} max={200} value={cards} onChange={(e) => setCards(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
            className="w-14 bg-surface border border-border rounded px-1" />
        </label>
        {sideLine("front")}
        {sideLine("back")}
        <label className="text-muted ml-auto">view{" "}
          <select value={width} onChange={(e) => setWidth(Number(e.target.value))} className="bg-surface border border-border rounded px-1">
            <option value={560}>small</option><option value={720}>medium</option><option value={1000}>large</option><option value={1400}>full</option>
          </select>
        </label>
      </div>
      <p className="text-muted max-w-3xl">
        For each page say whether it shows fronts or backs. Drag on the page to draw a box <b>along the card's own edge</b> (not the
        toploader or sleeve; within a couple of mm), then give it the card's number: a back gets the same number as its front.
        Click a box to renumber it, drag it or its corners to move it, Delete to remove it. "Measure" finds the exact edge and
        inner border inside each box. Through toploaders and sleeves the inner border is less reliable: check those in Examine.
      </p>
      {pages.length === 0 && <div className="text-yellow">No page previews yet: press re-measure once, then come back.</div>}
      <div className="space-y-4">
        {pages.map((p) => {
          const k = width / p.size[0];
          const H = p.size[1] * k;
          const toPage = (e: React.PointerEvent<SVGSVGElement>): Pt => {
            const r = e.currentTarget.getBoundingClientRect();
            return [(e.clientX - r.left) / k, (e.clientY - r.top) / k];
          };
          return (
            <div key={p.page} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">page {p.page}</span>
                <span className="text-muted">{p.label}</span>
                {(["front", "back", "skip"] as LayoutSide[]).map((s) => (
                  <button key={s} onClick={() => setPage(p.page, (x) => ({ ...x, side: s }))}
                    className={`px-2 py-0.5 rounded border ${p.side === s ? "border-accent text-accent" : "border-border text-muted"}`}>{s === "skip" ? "not cards" : `${s}s`}</button>
                ))}
                <span className="text-muted">{p.boxes.length} boxes</span>
                {p.boxes.length > 0 && <button className="text-muted hover:text-red-400" onClick={() => { setPage(p.page, (x) => ({ ...x, boxes: [] })); setSel(null); }}>clear</button>}
              </div>
              <div className="overflow-x-auto">
                <div className={`relative ${p.side === "skip" ? "opacity-40" : ""}`} style={{ width, height: H }}>
                  <img src={imageUrl(p.preview)} alt="" className="absolute inset-0 w-full h-full select-none" draggable={false} />
                  <svg width={width} height={H} className="absolute inset-0 touch-none" style={{ cursor: p.side === "skip" ? "default" : "crosshair" }}
                    onPointerDown={(e) => {
                      if (p.side === "skip" || e.target !== e.currentTarget) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const pt = toPage(e);
                      setSel(null);
                      setDrag({ kind: "new", page: p.page, from: pt, to: pt });
                    }}
                    onPointerMove={(e) => {
                      if (!drag || drag.page !== p.page) return;
                      const pt = toPage(e);
                      if (drag.kind === "new") setDrag({ ...drag, to: pt });
                      else if (drag.kind === "corner") setPage(p.page, (x) => ({ ...x, boxes: x.boxes.map((b, i) => i !== drag.idx ? b : { ...b, quad: b.quad.map((q, j) => (j === drag.corner ? pt : q)) }) }));
                      else {
                        const dx = pt[0] - drag.last[0], dy = pt[1] - drag.last[1];
                        setPage(p.page, (x) => ({ ...x, boxes: x.boxes.map((b, i) => i !== drag.idx ? b : { ...b, quad: b.quad.map(([qx, qy]) => [qx + dx, qy + dy] as Pt) }) }));
                        setDrag({ ...drag, last: pt });
                      }
                    }}
                    onPointerUp={() => {
                      if (drag?.kind === "new" && drag.page === p.page) {
                        const q = rectQuad(drag.from, drag.to);
                        if ((q[1][0] - q[0][0]) * k > 15 && (q[2][1] - q[1][1]) * k > 15) {
                          const card = nextFree(p.side);
                          setPage(p.page, (x) => ({ ...x, boxes: [...x.boxes, { card, quad: q }] }));
                          setSel({ page: p.page, idx: p.boxes.length });
                        }
                      }
                      setDrag(null);
                    }}>
                    {p.boxes.map((b, i) => {
                      const on = sel?.page === p.page && sel.idx === i;
                      const pts = b.quad.map(([x, y]) => `${x * k},${y * k}`).join(" ");
                      const cx = b.quad.reduce((s, q) => s + q[0], 0) / 4 * k, cy = b.quad.reduce((s, q) => s + q[1], 0) / 4 * k;
                      const bad = b.card > cards || (p.side !== "skip" && status[p.side].dup.includes(b.card));
                      const col = bad ? "#f85149" : on ? "#58a6ff" : p.side === "back" ? "#bc8cff" : "#3fb950";
                      return (
                        <g key={i}>
                          <polygon points={pts} fill={on ? "rgba(88,166,255,0.12)" : "rgba(0,0,0,0.001)"} stroke={col} strokeWidth={on ? 2 : 1.5}
                            style={{ cursor: "move" }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
                              const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                              setSel({ page: p.page, idx: i });
                              setDrag({ kind: "move", page: p.page, idx: i, last: [(e.clientX - r.left) / k, (e.clientY - r.top) / k] });
                            }} />
                          <circle cx={cx} cy={cy} r={13} fill="#0d1117" stroke={col} pointerEvents="none" />
                          <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fill="#e6edf3" pointerEvents="none">{b.card}</text>
                          {on && b.quad.map(([x, y], j) => (
                            <circle key={j} cx={x * k} cy={y * k} r={6} fill="#58a6ff" stroke="#0d1117" style={{ cursor: "nwse-resize" }}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
                                setDrag({ kind: "corner", page: p.page, idx: i, corner: j });
                              }} />
                          ))}
                        </g>
                      );
                    })}
                    {drag?.kind === "new" && drag.page === p.page && (
                      <polygon points={rectQuad(drag.from, drag.to).map(([x, y]) => `${x * k},${y * k}`).join(" ")} fill="none" stroke="#58a6ff" strokeDasharray="5 3" />
                    )}
                  </svg>
                </div>
              </div>
              {sel?.page === p.page && p.boxes[sel.idx] && (
                <div className="flex items-center gap-2">
                  <span>box {sel.idx + 1}: card</span>
                  <select value={p.boxes[sel.idx].card} className="bg-surface border border-border rounded px-1"
                    onChange={(e) => {
                      const to = Number(e.target.value);
                      const from = p.boxes[sel.idx].card;
                      // the number is taken on this side: the other box gets this one's old number
                      setPages((ps) => ps.map((x) => x.side !== p.side ? x : {
                        ...x, boxes: x.boxes.map((b, i) => (x.page === p.page && i === sel.idx) ? { ...b, card: to } : b.card === to ? { ...b, card: from } : b),
                      }));
                    }}>
                    {Array.from({ length: Math.max(cards, p.boxes[sel.idx].card) }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n}{used(p.side, sel).has(n) ? " (swap)" : ""}</option>
                    ))}
                  </select>
                  <button className="text-red-400" onClick={() => { setPage(p.page, (x) => ({ ...x, boxes: x.boxes.filter((_, i) => i !== sel.idx) })); setSel(null); }}>delete</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {err && <div className="text-red-400">{err}</div>}
      <div className="flex flex-wrap gap-2 items-center">
        <button disabled={!valid || busy} onClick={() => save(true)}
          className="bg-accent text-bg font-semibold px-3 py-1.5 rounded disabled:opacity-40">Measure with these boxes</button>
        <button disabled={!valid || busy} onClick={() => save(false)} className="border border-border rounded px-2 py-1 text-muted hover:text-accent disabled:opacity-40">save without measuring</button>
        {d.batch.layout && <button disabled={busy} onClick={backToAuto} className="border border-border rounded px-2 py-1 text-muted hover:text-accent">back to automatic</button>}
        <button onClick={onClose} className="text-muted hover:text-[#e6edf3] ml-auto">close</button>
        {!valid && <span className="text-yellow">{over ? "a box's number is above the card count" : "fix the numbers drawn twice, or draw at least one box"}</span>}
      </div>
    </div>
  );
}
