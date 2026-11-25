import { useEffect, useState } from "react";
import { api } from "../api";
import { currentMeasurement } from "./CenteringEditor";
import type { CenteringMeasurement, ConditionReview, CopyDetail } from "../types";

// The copy's readings at a glance, under its name: centering per side,
// corners, edges, surface, each with who stands behind it: you, the AI, the
// engine alone (not reviewed), or flagged for a person.

type Trust = "human" | "ai" | "flagged" | "auto" | "none";
const TRUST: Record<Trust, [string, string]> = {
  human: ["you ✓", "text-emerald-300 border-emerald-700"],
  ai: ["AI checked", "text-sky-300 border-sky-700"],
  flagged: ["needs review", "text-red-300 border-red-700"],
  auto: ["not reviewed", "text-muted border-border"],
  none: ["not checked", "text-muted border-border"],
};

// outline / border doubts (same as the API's centering check)
const DOUBTS = ["ai_fix_failed", "check_outer_edge_lr", "check_outer_edge_tb", "template_frame_outside_cut", "template_no_match", "cut_not_card_shaped"];

function centeringTrust(m: CenteringMeasurement | null, station?: string): Trust {
  if (!m) return "none";
  if (m.status === "accepted" || m.placed_by.startsWith("user")) return "human";
  const f = new Set(m.flags);
  if (m.status === "rejected" || DOUBTS.some((d) => f.has(d)) || (f.has("ai_outline_off") && !f.has("ai_outline_fixed")) || station === "low") return "flagged";
  if (f.has("ai_outline_ok") || f.has("ai_outline_fixed")) return "ai";
  return "auto";
}

const ratio = (v: number | null | undefined) => (v == null ? "–" : `${v.toFixed(1)}/${(100 - v).toFixed(1)}`);
const off = (v: number | null | undefined) => (v == null ? 0 : Math.abs(v - 50));
// PSA 10 front tolerance is about 55/45: green inside 53/47, amber to 55/45, red beyond
const tone = (v: number | null | undefined) => (v == null ? "text-muted" : off(v) <= 3 ? "text-emerald-300" : off(v) <= 5 ? "text-amber-300" : "text-red-300");

function Badge({ t, title }: { t: Trust; title?: string }) {
  const [l, c] = TRUST[t];
  return <span title={title} className={`text-[10px] border rounded px-1.5 py-px whitespace-nowrap ${c}`}>{l}</span>;
}

function Tile({ title, trust, trustTitle, children }: { title: string; trust: Trust; trustTitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-bg/40 px-3 py-2 min-w-[150px]">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wide text-muted">{title}</span>
        <span className="ml-auto"><Badge t={trust} title={trustTitle} /></span>
      </div>
      {children}
    </div>
  );
}

// corners / edges from the condition reviews: yours win over the AI's
function conditionOf(reviews: ConditionReview[] | null, kind: "corners" | "edges", station?: string) {
  if (!reviews) return { trust: "none" as Trust, text: "…", n: 0 };
  const mine = reviews.find((r) => r.placed_by.startsWith("user:"));
  const ai = reviews.find((r) => r.placed_by.startsWith("ai:"));
  const r = mine ?? ai;
  if (!r) return { trust: (station === "low" ? "flagged" : "none") as Trust, text: "not checked yet", n: 0 };
  let n = 0;
  const parts: string[] = [];
  for (const side of ["front", "back"] as const) {
    const byPart = r.findings?.[side]?.[kind] ?? {};
    for (const [part, issues] of Object.entries(byPart)) {
      for (const [iss, sev] of Object.entries(issues ?? {})) {
        if (sev && sev !== "none") { n++; parts.push(`${side} ${part.replace(/_/g, " ")}: ${iss.replace(/_/g, " ")} (${sev})`); }
      }
    }
  }
  const clean = kind === "corners" ? r.corners_clean : r.edges_clean;
  const trust: Trust = mine ? "human" : station === "low" ? "flagged" : "ai";
  const text = n === 0 && clean !== false ? "clean" : `${n || ""} issue${n === 1 ? "" : "s"}`.trim();
  return { trust, text, n, detail: parts };
}

export default function CopySummary({ copy, centering }: { copy: CopyDetail; centering: CenteringMeasurement[] }) {
  const [reviews, setReviews] = useState<ConditionReview[] | null>(null);
  useEffect(() => {
    api.getCondition(copy.id).then((r) => setReviews(r.reviews)).catch(() => setReviews([]));
  }, [copy.id, centering]);
  const side = (s: "front" | "back") => currentMeasurement(centering.filter((m) => m.side === s));
  const fm = side("front"), bm = side("back");
  const ft = centeringTrust(fm, copy.stations?.front), bt = centeringTrust(bm, copy.stations?.back);
  const order: Trust[] = ["flagged", "none", "auto", "ai", "human"];
  const worst = order.find((t) => t === ft || t === bt) ?? "none";
  const corners = conditionOf(reviews, "corners", copy.stations?.corners);
  const edges = conditionOf(reviews, "edges", copy.stations?.edges);
  const CRow = ({ label, m, t }: { label: string; m: CenteringMeasurement | null; t: Trust }) => (
    <div className="flex items-baseline gap-2 text-sm font-mono">
      <span className="text-[10px] text-muted w-9">{label}</span>
      {m && m.status !== "rejected" ? (
        <>
          <span className={tone(m.lr_left_pct)} title="left / right">{ratio(m.lr_left_pct)}</span>
          <span className="text-muted text-[10px]">L/R</span>
          <span className={tone(m.tb_top_pct)} title="top / bottom">{ratio(m.tb_top_pct)}</span>
          <span className="text-muted text-[10px]">T/B</span>
        </>
      ) : <span className="text-muted text-xs">{m ? "can't measure" : "not measured yet"}</span>}
      <span className="ml-auto"><Badge t={t} title={m?.flags.length ? m.flags.join(", ") : undefined} /></span>
    </div>
  );
  return (
    <div className="flex flex-wrap gap-2 w-full">
      <Tile title="Centering" trust={worst} trustTitle="the less trusted of the two sides">
        <CRow label="front" m={fm} t={ft} />
        <CRow label="back" m={bm} t={bt} />
      </Tile>
      <Tile title="Corners" trust={corners.trust} trustTitle={corners.detail?.join("\n")}>
        <div className={`text-sm ${corners.n ? "text-amber-300" : corners.text === "clean" ? "text-emerald-300" : "text-muted"}`}>{corners.text}</div>
      </Tile>
      <Tile title="Edges" trust={edges.trust} trustTitle={edges.detail?.join("\n")}>
        <div className={`text-sm ${edges.n ? "text-amber-300" : edges.text === "clean" ? "text-emerald-300" : "text-muted"}`}>{edges.text}</div>
      </Tile>
      <Tile title="Surface" trust="none">
        <div className="text-sm text-muted" title="there's no surface check yet: scratches, print lines and dents aren't measured">not checked</div>
      </Tile>
    </div>
  );
}
