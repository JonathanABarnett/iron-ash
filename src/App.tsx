import { BrowserRouter, NavLink, Route, Routes } from 'react-router';
import { HomePage } from '@ui/pages/HomePage';
import { SimPage } from '@ui/pages/SimPage';
import { PlayPage } from '@ui/pages/PlayPage';
import { ConfigPage } from '@ui/pages/ConfigPage';

const NAV_ITEMS = [
  { to: '/',       icon: '⚔',  label: 'Home'   },
  { to: '/play',   icon: '🎮',  label: 'Play'   },
  { to: '/sim',    icon: '📊',  label: 'Sim'    },
  { to: '/config', icon: '⚙',  label: 'Config' },
] as const;

function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-56 flex-col border-r border-neutral-800 bg-neutral-950 px-3 py-5 max-md:hidden">
      {/* Wordmark */}
      <NavLink to="/" className="mb-6 flex items-center gap-2 px-2">
        <span className="text-lg font-bold tracking-tight text-white">Iron &amp; Ash</span>
      </NavLink>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-purple-900/60 text-purple-100'
                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="mt-auto px-2 text-[10px] text-neutral-600">
        <p>84 tests · TypeScript strict</p>
        <p className="mt-0.5">
          <code>pnpm sim --games=200</code>
        </p>
      </div>
    </aside>
  );
}

function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-neutral-800 bg-neutral-950 md:hidden">
      {NAV_ITEMS.map(({ to, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-3 text-xs font-medium transition-colors ${
              isActive
                ? 'text-purple-300'
                : 'text-neutral-500 hover:text-neutral-200'
            }`
          }
        >
          <span className="text-xl leading-none">{icon}</span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
        <Sidebar />
        <BottomNav />

        {/* Main content shifted right on desktop, padded at bottom on mobile */}
        <div className="flex-1 md:ml-56">
          <div className="pb-20 md:pb-0">
            <Routes>
              <Route path="/"       element={<HomePage />} />
              <Route path="/play"   element={<PlayPage />} />
              <Route path="/sim"    element={<SimPage />} />
              <Route path="/config" element={<ConfigPage />} />
            </Routes>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
}
