import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import AuthImg, { openAuthImage } from "./AuthImg";
import { OverlayToggle, useOverlays } from "../lib/overlays";
import type { ConditionMark, ConditionFindings, ConditionReview, Severity, StepDecision } from "../types";

// Steps 6 / 7: corners or edges. Both sides' inspection sheets (cut along the
// current outlines), the AI check's findings, and a grid to confirm or
// correct them. Saved as your condition review (the labels later tuning
// learns from) and the step decision.

const PARTS = {
  corners: ["top_left", "top_right", "bottom_right", "bottom_left"],
  edges: ["top", "right", "bottom", "left"],
} as const;
const ISSUES = {
  corners: [["whitening", "whitening"], ["softening", "soft / rounded"], ["ding_bend", "ding / bend"], ["foil_chip", "foil chip"]],
  edges: [["whitening", "whitening / chips"], ["rough_cut", "rough cut"], ["dent", "dent"], ["layer_split", "layer split"], ["ink", "ink / touch-up"]],
} as const;
const SEV: Severity[] = ["none", "minor", "major", "unsure"];
const SEV_CLS: Record<Severity, string> = {
  none: "border-border text-muted", minor: "border-yellow text-yellow", major: "border-red-400 text-red-400", unsure: "border-purple text-purple",
};
const label = (p: string) => p.replace("_", " ");

export default function ConditionStep({ kind, copyId, version, onDone }: {
  kind: "corners" | "edges"; copyId: number; version: string;
  onDone: (d: StepDecision, info: Record<string, unknown>) => unknown;
}) {
  const [ai, setAi] = useState<ConditionReview | null>(null);
  const [mine, setMine] = useState<ConditionReview | null>(null);
  const [grid, setGrid] = useState<ConditionFindings>({});
  const [note, setNote] = useState("");
  const [marks, setMarks] = useState<ConditionMark[]>([]); // yours: circles on the tiles
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getCondition(copyId).then((r) => {
      const a = r.reviews.find((x) => x.placed_by.startsWith("ai:")) ?? null;
      const m = r.reviews.find((x) => x.placed_by.startsWith("user:")) ?? null;
      setAi(a);
      setMine(m);
      setMarks((m?.marks ?? []).filter((x) => x.kind === kind));
      const base = (m?.findings?.front?.[kind] || m?.findings?.back?.[kind]) ? m : a;
      const g: ConditionFindings = {};
      for (const side of ["front", "back"] as const) {
        g[side] = { [kind]: {} };
        for (const p of PARTS[kind]) {
          g[side]![kind]![p] = {};
          for (const [iss] of ISSUES[kind]) g[side]![kind]![p][iss] = base?.findings?.[side]?.[kind]?.[p]?.[iss] ?? "none";
        }
      }
      setGrid(g);
    }).catch((e: unknown) => setErr(String(e)));
  }, [copyId, kind]);

  const flagged = useMemo(() => {
    let n = 0;
    for (const side of ["front", "back"] as const)
      for (const p of PARTS[kind]) for (const [iss] of ISSUES[kind]) if ((grid[side]?.[kind]?.[p]?.[iss] ?? "none") !== "none") n++;
    return n;
  }, [grid, kind]);

  // same as the AI's call?
  const agrees = useMemo(() => {
    if (!ai) return false;
    for (const side of ["front", "back"] as const)
      for (const p of PARTS[kind]) for (const [iss] of ISSUES[kind])
        if ((grid[side]?.[kind]?.[p]?.[iss] ?? "none") !== (ai.findings?.[side]?.[kind]?.[p]?.[iss] ?? "none")) return false;
    return true;
  }, [grid, ai, kind]);

  const set = (side: "front" | "back", p: string, iss: string, v: Severity) =>
    setGrid((g) => ({ ...g, [side]: { ...g[side], [kind]: { ...g[side]?.[kind], [p]: { ...g[side]?.[kind]?.[p], [iss]: v } } } }));

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const findings: ConditionFindings = {};
      for (const side of ["front", "back"] as const) findings[side] = { [kind]: grid[side]?.[kind] ?? {} };
      // the other kind's circles from your last review are kept
      const other = (mine?.marks ?? []).filter((x) => x.kind !== kind);
      const r = await api.postCondition(copyId, { by: "user", findings, note: note.trim() || undefined, marks: [...other, ...marks] });
      await onDone(agrees ? "approved" : "fixed", { condition_review: r.id, flagged });
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-xs">
      <div className="text-muted">
        {kind === "corners"
          ? "Each corner, front and back: whitening, a softened or rounded tip, dings / bends, foil chipping. Slab plastic, rails and glare aren't damage."
          : "Each edge between the corners (card below the strip): whitening or chips, a rough cut, dents, layer splits, ink. Slab plastic and glare aren't damage."}
      </div>
      <div className="bg-surface border border-border rounded p-2 space-y-1">
        <div className="flex flex-wrap gap-2 items-baseline">
          <span className="font-semibold">AI check</span>
          {ai ? (
            <span className="text-muted">
              {(kind === "corners" ? ai.corners_clean : ai.edges_clean) ? "clean" : "flagged something"} · confidence {ai.confidence?.toFixed(2) ?? "—"}
              {ai.photo_ok === false && <span className="text-yellow"> · photos too poor to judge</span>}
              {ai.note && <> · “{ai.note}”</>}
            </span>
          ) : <span className="text-muted">not looked yet (the hourly corner & edge job); judge it yourself below</span>}
          {mine && <span className="text-green ml-auto">you reviewed this {new Date(mine.created_at).toLocaleDateString()}</span>}
        </div>
      </div>
      {(["front", "back"] as const).map((side) => (
        <div key={side} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-muted">{side}</span>
            <button onClick={() => openAuthImage(api.inspectUrl(copyId, side, version))} className="text-[10px] text-muted hover:text-accent">whole sheet ↗</button>
            {side === "front" && <OverlayToggle className="ml-auto" />}
          </div>
          <div className={kind === "corners" ? "grid gap-2 md:grid-cols-2" : "space-y-2"}>
            {PARTS[kind].map((p) => (
              <PartRow key={p} kind={kind} side={side} part={p} src={api.inspectPartUrl(copyId, side, p, version)}
                values={grid[side]?.[kind]?.[p] ?? {}} ai={ai?.findings?.[side]?.[kind]?.[p]} set={(iss, v) => set(side, p, iss, v)}
                aiMarks={(ai?.marks ?? []).filter((m) => m.side === side && m.kind === kind && m.part === p)}
                myMarks={marks.filter((m) => m.side === side && m.part === p)}
                addMark={(m) => setMarks((ms) => [...ms, { ...m, side, kind, part: p }])}
                removeMark={(m) => setMarks((ms) => ms.filter((x) => x !== m))} />
            ))}
          </div>
        </div>
      ))}
      <div className="text-[10px] text-muted">
        Underlined: the AI's call where yours differs. "unsure" = the photo can't show it. Circles: <span className="text-orange-300">dashed = the AI's</span>,
        <span className="text-sky-300"> solid = yours</span> (click "+ circle", then the spot; click your circle to remove it; click the AI's to keep it as yours).
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="note (optional): e.g. whitening on the back top-left, only visible at full size"
        className="w-full bg-bg border border-border rounded px-2 py-1 outline-none focus:border-accent" />
      <div className="flex items-center gap-2">
        <button disabled={busy} onClick={save} className="bg-accent text-bg font-semibold px-3 py-1.5 rounded hover:bg-accent/90 disabled:opacity-40">
          {flagged === 0 ? `${kind === "corners" ? "Corners" : "Edges"} are clean → next` : `Save ${flagged} issue${flagged === 1 ? "" : "s"} → next`}
        </button>
        {ai && <span className="text-[10px] text-muted">{agrees ? "same as the AI's call" : "differs from the AI's call (saved as a correction)"}</span>}
        {err && <span className="text-red-400">{err}</span>}
      </div>
    </div>
  );
}

// one corner or edge: its close-up next to the AI's call and yours
function PartRow({ kind, side, part, src, values, ai, set, aiMarks, myMarks, addMark, removeMark }: {
  kind: "corners" | "edges"; side: "front" | "back"; part: string; src: string;
  values: Record<string, string>; ai?: Record<string, string>; set: (issue: string, v: Severity) => void;
  aiMarks: ConditionMark[]; myMarks: ConditionMark[];
  addMark: (m: Omit<ConditionMark, "side" | "kind" | "part">) => void; removeMark: (m: ConditionMark) => void;
}) {
  const [zoom, setZoom] = useState(false);
  const [adding, setAdding] = useState(false);
  const [size, setSize] = useState<[number, number] | null>(null);
  const [show] = useOverlays();
  // the issue a new circle is for: the first you've flagged here, else the first issue
  const flaggedIssue = Object.entries(values).find(([, v]) => v !== "none")?.[0] ?? ISSUES[kind][0][0];
  const place = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    addMark({ issue: flaggedIssue, severity: values[flaggedIssue] && values[flaggedIssue] !== "none" ? values[flaggedIssue] : undefined,
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      r: kind === "corners" ? 0.08 : 0.02 });
    setAdding(false);
  };
  const overlay = (w: number, h: number) => show && size && (aiMarks.length > 0 || myMarks.length > 0) && (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
      {aiMarks.map((m, i) => (
        <circle key={`a${i}`} cx={m.x * w} cy={m.y * h} r={m.r * w} fill="none" stroke="#fb923c" strokeWidth={Math.max(1.5, w / 160)}
          strokeDasharray={`${w / 40} ${w / 60}`} className="pointer-events-auto cursor-pointer"
          onClick={(e) => { e.stopPropagation(); addMark({ issue: m.issue, severity: m.severity, x: m.x, y: m.y, r: m.r }); }}>
          <title>AI: {m.issue?.replace(/_/g, " ")} {m.severity} (click to keep as yours)</title>
        </circle>
      ))}
      {myMarks.map((m, i) => (
        <circle key={`m${i}`} cx={m.x * w} cy={m.y * h} r={m.r * w} fill="none" stroke="#38bdf8" strokeWidth={Math.max(1.5, w / 140)}
          className="pointer-events-auto cursor-pointer" onClick={(e) => { e.stopPropagation(); removeMark(m); }}>
          <title>yours: {m.issue?.replace(/_/g, " ")} {m.severity ?? ""} (click to remove)</title>
        </circle>
      ))}
    </svg>
  );
  const aiFlags = Object.entries(ai ?? {}).filter(([, v]) => v !== "none");
  const mineFlags = Object.values(values).filter((v) => v !== "none").length;
  const corner = kind === "corners";
  const none = "no measured outline for this side yet";
  const onImg = (el: HTMLImageElement) => setSize([el.naturalWidth, el.naturalHeight]);
  const img = corner ? (
    <div className={`relative inline-block shrink-0 ${adding ? "cursor-crosshair" : ""}`}
      onClick={adding ? place : undefined}>
      <AuthImg src={src} alt={`${side} ${label(part)}`} onClick={adding ? undefined : () => setZoom(!zoom)} title={adding ? "click the spot" : "click to enlarge"} fallback={none}
        onLoad={onImg} className={`rounded bg-bg block ${adding ? "" : "cursor-zoom-in"} ${zoom ? "w-[420px] max-w-full" : "w-40 h-40 object-contain"}`} />
      {size && overlay(size[0], size[1])}
    </div>
  ) : (
    <div className={`relative w-full ${adding ? "cursor-crosshair" : ""}`} onClick={adding ? place : () => openAuthImage(src)}
      title={adding ? "click the spot" : "open full size"}>
      <AuthImg src={src} alt={`${side} ${label(part)} edge`} className="w-full min-h-[24px] rounded bg-bg block" fallback={none} onLoad={onImg} />
      {size && overlay(size[0], size[1])}
    </div>
  );
  return (
    <div className={`bg-surface border rounded p-2 ${mineFlags ? "border-yellow/50" : "border-border"} ${corner ? "flex gap-3 items-start" : "space-y-2"}`}>
      {img}
      <div className="space-y-1.5 min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-semibold">{side} · {label(part)}</span>
          <span className="text-[10px] text-muted">
            AI: {ai ? (aiFlags.length ? aiFlags.map(([k, v]) => `${k.replace("_", " ")} ${v}`).join(", ") : "clean") : "not checked"}
            {aiFlags.length > 0 && aiMarks.length === 0 && ai ? " (no circle: checked before circles existed, or not placed)" : ""}
          </span>
          <button type="button" onClick={() => setAdding(!adding)}
            className={`ml-auto text-[10px] border rounded px-1.5 ${adding ? "border-sky-400 text-sky-300" : "border-border text-muted hover:text-accent"}`}>
            {adding ? "click the spot…" : "+ circle"}</button>
        </div>
        <div className={corner ? "space-y-1" : "flex flex-wrap gap-x-4 gap-y-1"}>
          {ISSUES[kind].map(([iss, l]) => {
            const v = (values[iss] ?? "none") as Severity;
            const aiV = ai?.[iss];
            return (
              <div key={iss} className="flex items-center gap-1">
                <span className="text-[10px] text-muted w-24 shrink-0">{l}</span>
                {SEV.map((sv) => (
                  <button key={sv} onClick={() => set(iss, sv)} title={aiV ? `AI said ${aiV}` : undefined}
                    className={`border rounded px-1 text-[9px] ${v === sv ? SEV_CLS[sv] + " bg-bg" : "border-transparent text-border hover:text-muted"} ${aiV === sv && v !== sv ? "underline" : ""}`}>
                    {sv === "none" ? "ok" : sv}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
