import { HashRouter, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import CardList from "./pages/CardList";
import CardDetail from "./pages/CardDetail";
import CertView from "./pages/CertView";
import Intake from "./pages/Intake";
import Copies from "./pages/Copies";
import CopyReview from "./pages/CopyReview";

import Factory from "./pages/Factory";
import Developer from "./pages/Developer";
import AICostPanel from "./components/AICostPanel";

// Tabs: Analytics (cards and their copies), Pre-grading factory (the pipeline
// and its review queues), Grader analytics (later), Developer (architecture).
const TABS: { label: string; to: string; match: (p: string) => boolean; soon?: boolean }[] = [
  { label: "Analytics", to: "/", match: (p) => p === "/" || p.startsWith("/cards") || p.startsWith("/certs") || p.startsWith("/intake") },
  { label: "Pre-grading factory", to: "/factory", match: (p) => p.startsWith("/factory") || p.startsWith("/copies") },
  { label: "Grader analytics", to: "/", match: () => false, soon: true },
  { label: "Developer", to: "/developer", match: (p) => p.startsWith("/developer") },
];

function Header() {
  const { pathname } = useLocation();
  return (
    <header className="border-b border-border">
      <div className="flex items-baseline gap-4 px-6 pt-4 max-w-7xl mx-auto">
        <Link to="/" className="text-lg font-semibold hover:text-accent transition-colors">
          Grading Predictor
        </Link>
        <span className="text-muted text-xs">pre-grading dataset</span>
        <a
          href="https://github.com/FG-CollectLabs/grading-predictor-frontend"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs text-muted hover:text-accent transition-colors"
        >
          github
        </a>
      </div>
      <nav className="flex gap-1 px-6 max-w-7xl mx-auto mt-3">
        {TABS.map((t) =>
          t.soon ? (
            <span key={t.label} className="px-3 py-2 text-xs text-border cursor-default" title="planned">
              {t.label} <span className="text-[9px]">soon</span>
            </span>
          ) : (
            <Link
              key={t.label}
              to={t.to}
              className={`px-3 py-2 text-xs border-b-2 -mb-px transition-colors ${
                t.match(pathname) ? "text-accent border-accent" : "text-muted border-transparent hover:text-[#e6edf3]"
              }`}
            >
              {t.label}
            </Link>
          ),
        )}
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-bg text-[#e6edf3] font-mono text-sm">
        <Header />
        <main className="max-w-7xl mx-auto px-6 py-6">
          <Routes>
            <Route path="/" element={<><div className="mb-6"><AICostPanel compact /></div><CardList /></>} />
            <Route path="/cards/:id" element={<CardDetail />} />
            {/* adding a copy now starts from its card's page */}
            <Route path="/certs/new" element={<Navigate to="/" replace />} />
            <Route path="/intake" element={<Intake />} />
            <Route path="/certs/:id" element={<CertView />} />
            <Route path="/factory" element={<Factory />} />
            <Route path="/copies" element={<Copies />} />
            <Route path="/copies/:id" element={<CopyReview />} />
            <Route path="/developer" element={<Developer />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
