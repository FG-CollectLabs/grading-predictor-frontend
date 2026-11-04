import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, imageUrl } from "../api";
import type { ReviewEvent } from "../types";

// Every review decision across copies, newest first, grouped by copy. Open a
// copy to reopen a step and redo it; the earlier decision stays on record.

const STEP_LABEL: Record<string, string> = {
  card: "correct card", listing: "grade & grader", cert: "cert", photos: "front & back photos",
  front_outer: "front outer edge", front_inner: "front inner border", back_outer: "back outer edge",
  back_inner: "back inner border", corners: "corners", edges: "edges", complete: "completed",
};
const DECISION_CLS: Record<string, string> = { approved: "text-green", fixed: "text-yellow", rejected: "text-red-400", skipped: "text-muted" };
const PAGE = 150;

export default function ReviewHistory() {
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getReviewHistory(PAGE, offset)
      .then((r) => {
        setEvents((e) => (offset === 0 ? r.events : [...e, ...r.events]));
        setMore(r.events.length === PAGE);
      })
      .catch((e: unknown) => setErr(String(e)));
  }, [offset]);

  // group consecutive events by copy
  const groups: { cert: number; events: ReviewEvent[] }[] = [];
  for (const e of events) {
    const g = groups[groups.length - 1];
    if (g && g.cert === e.cert_id) g.events.push(e);
    else groups.push({ cert: e.cert_id, events: [e] });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link to="/factory" className="hover:text-accent">← Pre-grading factory</Link>
        <span className="text-border">/</span>
        <span className="text-[#e6edf3]">Review history</span>
      </div>
      <div className="text-xs text-muted">Every decision you've made, newest first. Open a copy to redo any step; the earlier decision stays here.</div>
      {err && <div className="text-red-400 text-xs">{err}</div>}
      {groups.length === 0 && !err && <div className="text-muted text-xs py-8">No review decisions yet.</div>}
      <div className="space-y-2">
        {groups.map((g, i) => {
          const head = g.events[0];
          return (
            <Link key={`${g.cert}-${i}`} to={`/copies/${g.cert}`}
              className="flex gap-3 bg-surface border border-border rounded-md p-2 hover:border-accent/60">
              {head.front_image
                ? <img src={imageUrl(head.front_image)} alt="" loading="lazy" className="w-12 h-16 object-contain bg-bg rounded" />
                : <div className="w-12 h-16 bg-bg rounded" />}
              <div className="flex-1 min-w-0">
                <div className="text-xs">
                  <span className="font-semibold">{head.card_name}</span>{" "}
                  <span className="text-muted">copy #{g.cert} · {head.grader} {head.grade ?? ""}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  {g.events.map((e) => (
                    <span key={e.id} className="text-[10px]">
                      <span className={DECISION_CLS[e.decision] ?? "text-muted"}>{e.decision}</span>{" "}
                      <span className="text-muted">{STEP_LABEL[e.step] ?? e.step}{e.note ? ` · ${e.note}` : ""}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-[10px] text-muted whitespace-nowrap">{new Date(head.created_at).toLocaleString()}</div>
            </Link>
          );
        })}
      </div>
      {more && events.length > 0 && (
        <button onClick={() => setOffset(offset + PAGE)} className="text-xs border border-border rounded px-3 py-1 text-muted hover:text-accent">older →</button>
      )}
    </div>
  );
}
