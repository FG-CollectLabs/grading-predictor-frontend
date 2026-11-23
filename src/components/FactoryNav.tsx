import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

// The factory's sections as one row of tabs, on every factory page.
const ITEMS: { to: string; label: string; hint: string }[] = [
  { to: "/factory", label: "Overview", hint: "the belt: every machine and what waits on you" },
  { to: "/factory/priority", label: "Review next", hint: "the copies where a review does the most" },
  { to: "/factory/history", label: "My reviews", hint: "what you've validated or adjusted" },
  { to: "/factory/raw", label: "Raw copies", hint: "raw cards from the tracker" },
  { to: "/factory/batch", label: "Batch scans", hint: "flatbed sheets of loose cards" },
  { to: "/factory/scans", label: "Pull scans", hint: "copies waiting on the grader's scans" },
  { to: "/factory/auto", label: "Automatic decisions", hint: "what the machines passed on their own" },
  { to: "/factory/references", label: "References", hint: "card images the engine aligns to" },
];

export default function FactoryNav() {
  const { pathname } = useLocation();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border pb-2 mb-4">
      {ITEMS.map((i) => {
        const on = i.to === "/factory" ? pathname === "/factory" : pathname.startsWith(i.to);
        return (
          <Link key={i.to} to={i.to} title={i.hint}
            className={`rounded px-3 py-1 text-xs ${on ? "bg-accent text-bg font-semibold" : "text-muted hover:text-[#e6edf3]"}`}>{i.label}</Link>
        );
      })}
    </nav>
  );
}

export function FactoryShell({ children }: { children: ReactNode }) {
  return <><FactoryNav />{children}</>;
}
