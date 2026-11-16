import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { ConditionFindings, ConditionReview, Severity, StepDecision } from "../types";

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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getCondition(copyId).then((r) => {
      const a = r.reviews.find((x) => x.placed_by.startsWith("ai:")) ?? null;
      const m = r.reviews.find((x) => x.placed_by.startsWith("user:")) ?? null;
      setAi(a);
      setMine(m);
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
      const r = await api.postCondition(copyId, { by: "user", findings, note: note.trim() || undefined });
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
            <a href={api.inspectUrl(copyId, side, version)} target="_blank" rel="noreferrer" className="text-[10px] text-muted hover:text-accent">whole sheet ↗</a>
          </div>
          <div className={kind === "corners" ? "grid gap-2 md:grid-cols-2" : "space-y-2"}>
            {PARTS[kind].map((p) => (
              <PartRow key={p} kind={kind} side={side} part={p} src={api.inspectPartUrl(copyId, side, p, version)}
                values={grid[side]?.[kind]?.[p] ?? {}} ai={ai?.findings?.[side]?.[kind]?.[p]} set={(iss, v) => set(side, p, iss, v)} />
            ))}
          </div>
        </div>
      ))}
      <div className="text-[10px] text-muted">Underlined: the AI's call where yours differs. "unsure" = the photo can't show it.</div>
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
function PartRow({ kind, side, part, src, values, ai, set }: {
  kind: "corners" | "edges"; side: "front" | "back"; part: string; src: string;
  values: Record<string, string>; ai?: Record<string, string>; set: (issue: string, v: Severity) => void;
}) {
  const [zoom, setZoom] = useState(false);
  const aiFlags = Object.entries(ai ?? {}).filter(([, v]) => v !== "none");
  const mineFlags = Object.values(values).filter((v) => v !== "none").length;
  const corner = kind === "corners";
  const img = corner ? (
    <img src={src} alt={`${side} ${label(part)}`} onClick={() => setZoom(!zoom)} title="click to enlarge"
      className={`rounded bg-bg cursor-zoom-in ${zoom ? "w-[420px] max-w-full" : "w-40 h-40 object-contain"}`}
      onError={(e) => { (e.target as HTMLImageElement).alt = "no measured outline for this side yet"; }} />
  ) : (
    <a href={src} target="_blank" rel="noreferrer" title="open full size">
      <img src={src} alt={`${side} ${label(part)} edge`} className="w-full rounded bg-bg"
        onError={(e) => { (e.target as HTMLImageElement).alt = "no measured outline for this side yet"; }} />
    </a>
  );
  return (
    <div className={`bg-surface border rounded p-2 ${mineFlags ? "border-yellow/50" : "border-border"} ${corner ? "flex gap-3 items-start" : "space-y-2"}`}>
      {img}
      <div className="space-y-1.5 min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-semibold">{side} · {label(part)}</span>
          <span className="text-[10px] text-muted">
            AI: {ai ? (aiFlags.length ? aiFlags.map(([k, v]) => `${k.replace("_", " ")} ${v}`).join(", ") : "clean") : "not checked"}
          </span>
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
