import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { HomePage } from '@ui/pages/HomePage';
import { SimPage } from '@ui/pages/SimPage';
import { PlayPage } from '@ui/pages/PlayPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        <header className="border-b border-neutral-800">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3 text-sm">
            <Link to="/" className="font-semibold tracking-tight">
              Iron &amp; Ash
            </Link>
            <Link to="/play" className="text-neutral-400 hover:text-neutral-100">
              Play
            </Link>
            <Link to="/sim" className="text-neutral-400 hover:text-neutral-100">
              Sim
            </Link>
          </nav>
        </header>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="/sim" element={<SimPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
