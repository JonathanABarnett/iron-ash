import { BrowserRouter, NavLink, Route, Routes } from 'react-router';
import { HomePage }   from '@ui/pages/HomePage';
import { SimPage }    from '@ui/pages/SimPage';
import { PlayPage }   from '@ui/pages/PlayPage';
import { ConfigPage } from '@ui/pages/ConfigPage';
import { ReplayPage } from '@ui/pages/ReplayPage';
import { RulesPage }  from '@ui/pages/RulesPage';

// ── Nav structure ─────────────────────────────────────────────────────────────

const NAV_PRIMARY = [
  { to: '/play',   icon: PlayIcon,    label: 'Play'     },
  { to: '/sim',    icon: SimIcon,     label: 'Simulate' },
] as const;

const NAV_SECONDARY = [
  { to: '/rules',  icon: RulesIcon,   label: 'Rules'    },
  { to: '/replay', icon: ReplayIcon,  label: 'Replay'   },
] as const;

const NAV_UTIL = [
  { to: '/config', icon: ConfigIcon,  label: 'Config'   },
] as const;

// ── Root layout ───────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen" style={{ background: 'var(--color-bg)' }}>

        {/* Desktop sidebar */}
        <Sidebar />

        {/* Main content */}
        <div className="flex-1 md:ml-52">
          <div className="pb-20 md:pb-0">
            <Routes>
              <Route path="/"       element={<HomePage />}   />
              <Route path="/play"   element={<PlayPage />}   />
              <Route path="/sim"    element={<SimPage />}    />
              <Route path="/rules"  element={<RulesPage />}  />
              <Route path="/replay" element={<ReplayPage />} />
              <Route path="/config" element={<ConfigPage />} />
            </Routes>
          </div>
        </div>

        {/* Mobile bottom nav */}
        <MobileNav />
      </div>
    </BrowserRouter>
  );
}

// ── Desktop sidebar ───────────────────────────────────────────────────────────

function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden md:flex h-screen w-52 flex-col border-r"
      style={{ borderColor: 'var(--color-border)', background: 'rgba(9,9,11,0.95)', backdropFilter: 'blur(20px)' }}
    >
      {/* Wordmark */}
      <div className="flex h-14 items-center gap-2.5 px-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg text-sm"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 0 12px rgba(124,58,237,0.4)' }}>
          ⚔
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight text-white">Iron &amp; Ash</div>
          <div className="text-[9px] tracking-widest uppercase" style={{ color: 'var(--color-subtle)' }}>Playtesting</div>
        </div>
      </div>

      {/* Home link */}
      <div className="px-3 pt-3">
        <NavLink to="/" end className={navClass}>
          {({ isActive }) => (
            <span className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all ${
              isActive ? 'font-medium text-white bg-white/8' : 'text-zinc-400 hover:text-white hover:bg-white/4'
            }`}>
              <HomeIcon className="h-4 w-4 shrink-0 opacity-70" />
              Home
            </span>
          )}
        </NavLink>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 overflow-y-auto px-3 pt-1 space-y-0.5">
        <NavGroup label="Game">
          {NAV_PRIMARY.map(({ to, icon: Icon, label }) => (
            <SideNavItem key={to} to={to} icon={<Icon className="h-4 w-4 shrink-0 opacity-70" />} label={label} />
          ))}
        </NavGroup>

        <NavGroup label="Resources">
          {NAV_SECONDARY.map(({ to, icon: Icon, label }) => (
            <SideNavItem key={to} to={to} icon={<Icon className="h-4 w-4 shrink-0 opacity-70" />} label={label} />
          ))}
        </NavGroup>

        <NavGroup label="Settings">
          {NAV_UTIL.map(({ to, icon: Icon, label }) => (
            <SideNavItem key={to} to={to} icon={<Icon className="h-4 w-4 shrink-0 opacity-70" />} label={label} />
          ))}
        </NavGroup>
      </nav>

      {/* Footer */}
      <div className="border-t px-4 py-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="text-[10px] leading-relaxed" style={{ color: 'var(--color-subtle)' }}>
          <div>93 tests · TypeScript strict</div>
          <div className="mt-0.5 font-mono">pnpm sim --games=500</div>
        </div>
      </div>
    </aside>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pt-4">
      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-subtle)' }}>
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SideNavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink to={to} className={navClass}>
      {({ isActive }) => (
        <span className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all ${
          isActive
            ? 'font-medium text-white bg-white/[0.08] shadow-sm'
            : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
        }`}>
          {icon}{label}
          {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0" />}
        </span>
      )}
    </NavLink>
  );
}

const navClass = 'block';

// ── Mobile bottom nav ─────────────────────────────────────────────────────────

const ALL_NAV = [
  { to: '/',       icon: HomeIcon,    label: 'Home'     },
  { to: '/play',   icon: PlayIcon,    label: 'Play'     },
  { to: '/sim',    icon: SimIcon,     label: 'Sim'      },
  { to: '/rules',  icon: RulesIcon,   label: 'Rules'    },
  { to: '/config', icon: ConfigIcon,  label: 'Config'   },
];

function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden border-t"
      style={{ borderColor: 'var(--color-border)', background: 'rgba(9,9,11,0.95)', backdropFilter: 'blur(20px)' }}
    >
      {ALL_NAV.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/'} className="flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors">
          {({ isActive }) => (
            <>
              <Icon className={`h-5 w-5 transition-colors ${isActive ? 'text-violet-400' : 'text-zinc-500'}`} />
              <span className={isActive ? 'text-violet-400' : 'text-zinc-500'}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

// ── Icons (inline SVG — no extra dependency) ─────────────────────────────────

function HomeIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 6.5L8 2l6 4.5V14H10v-3.5H6V14H2z" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="2" width="5" height="4" rx="0.75" />
      <rect x="1" y="10" width="5" height="4" rx="0.75" />
      <rect x="10" y="6" width="5" height="4" rx="0.75" />
      <path d="M6 4h4M6 12h4M6 4v8" strokeLinecap="round" />
    </svg>
  );
}

function SimIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 12V9l3-3 3 2 4-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 14h12" strokeLinecap="round" />
    </svg>
  );
}

function RulesIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="1" width="12" height="14" rx="1.5" />
      <path d="M5 5h6M5 8h6M5 11h4" strokeLinecap="round" />
    </svg>
  );
}

function ReplayIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M6.5 6l3 2-3 2V6z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ConfigIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" strokeLinecap="round" />
    </svg>
  );
}
