import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { AIRush } from "../types";

// "Run AI checks now": every AI check on this copy (photo picker if a side is
// missing, label check, outline check, corners & edges) without waiting for
// the hourly jobs. agent2's rush worker picks requests up every minute; this
// polls until it's done and then reloads the page's data.

const TASK = { photos: "photo picker", grade: "label check", outline: "outline check", condition: "corners & edges" } as Record<string, string>;

export default function AIRushButton({ copyId, onDone }: { copyId: number; onDone: () => unknown }) {
  const [req, setReq] = useState<AIRush | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = req?.state === "waiting" || req?.state === "running";

  const poll = useCallback(() => {
    api.getAIRush(copyId).then((r) => {
      setReq((prev) => {
        if (prev && (prev.state === "waiting" || prev.state === "running") && r.request && (r.request.state === "done" || r.request.state === "failed")) {
          setOpen(true);
          void onDone();
        }
        return r.request;
      });
    }).catch(() => { /* keep polling */ });
  }, [copyId, onDone]);

  useEffect(() => { poll(); }, [poll]);
  useEffect(() => {
    if (!live) return;
    timer.current = setTimeout(poll, 5000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [live, req, poll]);

  const start = () => {
    setErr(null);
    api.requestAIRush(copyId).then(setReq).catch((e) => setErr(String(e.message ?? e)));
  };
  const when = (t: string | null) => (t ? new Date(t).toLocaleTimeString() : "");
  return (
    <div className="text-xs flex flex-col items-end gap-1 relative">
      <button onClick={live ? () => setOpen(!open) : start}
        title="run every AI check on this copy now instead of waiting for the hourly jobs"
        className={`px-3 py-1.5 rounded font-semibold ${live ? "border border-accent/50 text-accent" : "bg-accent text-bg hover:bg-accent/90"}`}>
        {req?.state === "waiting" ? `AI queued${req.ahead ? ` (${req.ahead} ahead)` : ""}…`
          : req?.state === "running" ? "AI checking…"
            : "Run AI checks now"}
      </button>
      {req && !live && (
        <button className="text-muted hover:text-accent" onClick={() => setOpen(!open)}>
          last run {when(req.done_at)} · {req.state === "failed" ? <span className="text-red-400">failed</span> : "done"} {open ? "▴" : "▾"}
        </button>
      )}
      {err && <span className="text-red-400">{err}</span>}
      {open && req && (
        <div className="absolute top-full right-0 mt-1 z-20 w-80 bg-surface border border-border rounded p-2 shadow-lg space-y-1 text-left">
          <div className="text-muted">asked {when(req.requested_at)}{req.requested_by ? ` by ${req.requested_by}` : ""}{req.claimed_at ? ` · started ${when(req.claimed_at)}` : ""}</div>
          {live && <div className="text-muted">agent2 picks requests up every minute; each check takes about half a minute. The page reloads when it's done.</div>}
          {req.error && <div className="text-red-400">{req.error}</div>}
          {req.result && Object.entries(req.result).map(([t, r]) => (
            <div key={t}><span className="font-semibold">{TASK[t] ?? t}</span>: <span className={r.startsWith("ok") ? "text-muted" : "text-red-400"}>{r.replace(/^ok: /, "")}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
