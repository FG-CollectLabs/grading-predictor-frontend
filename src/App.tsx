import { HashRouter, Routes, Route, Link } from "react-router-dom";
import CardList from "./pages/CardList";
import CardDetail from "./pages/CardDetail";
import NewCert from "./pages/NewCert";
import CertView from "./pages/CertView";
import Intake from "./pages/Intake";
import Copies from "./pages/Copies";
import CopyReview from "./pages/CopyReview";

export default function App() {
  return (
    <HashRouter>
      <div className="min-h-screen bg-bg text-[#e6edf3] font-mono text-sm">
        <header className="flex items-baseline gap-4 px-6 py-4 border-b border-border max-w-7xl mx-auto">
          <Link to="/" className="text-lg font-semibold hover:text-accent transition-colors">
            Grading Predictor
          </Link>
          <span className="text-muted text-xs">defect → grade dataset</span>
          <div className="ml-auto flex gap-4 text-xs text-muted">
            <Link to="/copies" className="hover:text-accent transition-colors">
              Copies
            </Link>
            <Link to="/copies?review=needed" className="hover:text-accent transition-colors">
              Review queue
            </Link>
            <Link to="/intake" className="hover:text-accent transition-colors">
              + Copy intake
            </Link>
            <Link to="/certs/new" className="hover:text-accent transition-colors">
              + New Cert
            </Link>
            <a
              href="https://github.com/FG-CollectLabs/grading-predictor-frontend"
              target="_blank"
              rel="noreferrer"
              className="hover:text-accent transition-colors"
            >
              github
            </a>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-6">
          <Routes>
            <Route path="/" element={<CardList />} />
            <Route path="/cards/:id" element={<CardDetail />} />
            <Route path="/certs/new" element={<NewCert />} />
            <Route path="/intake" element={<Intake />} />
            <Route path="/certs/:id" element={<CertView />} />
            <Route path="/copies" element={<Copies />} />
            <Route path="/copies/:id" element={<CopyReview />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
