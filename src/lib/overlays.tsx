import { useEffect, useState } from "react";

// One switch for everything drawn on top of a card photo (outline and
// border lines, issue circles): off shows the photo as it is. Shared by
// every tool and remembered in this browser.
const KEY = "fg.showOverlays";
const listeners = new Set<(v: boolean) => void>();

function read(): boolean {
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
}

export function useOverlays(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(read);
  useEffect(() => {
    listeners.add(setOn);
    return () => { listeners.delete(setOn); };
  }, []);
  const set = (v: boolean) => {
    try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode: this page only */ }
    listeners.forEach((l) => l(v));
  };
  return [on, set];
}

export function OverlayToggle({ className }: { className?: string }) {
  const [on, set] = useOverlays();
  return (
    <label className={`inline-flex items-center gap-1 text-[11px] text-muted cursor-pointer select-none ${className ?? ""}`}
      title="hide the outline / border lines and the issue circles to see the photo as it is (every tool, remembered)">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />show marks &amp; lines
    </label>
  );
}
