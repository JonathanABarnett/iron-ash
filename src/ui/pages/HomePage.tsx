import { Link } from 'react-router';
import { FactionEmblem, factionLabel } from '@ui/components/FactionEmblem';
import type { FactionId } from '@engine/types';

const FACTIONS: FactionId[] = [
  'warriors',
  'assassins',
  'mages',
  'necromancers',
  'merchants',
  'rangers',
  'paladins',
  'beastmasters',
];

export function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Iron &amp; Ash</h1>
        <p className="mt-2 text-base text-neutral-400">
          Medieval-fantasy dice-placement · asymmetric factions · headless AI simulation
        </p>
      </div>

      {/* Primary action buttons */}
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          to="/play"
          className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-purple-800/50 bg-gradient-to-br from-purple-950/60 to-neutral-900 p-6 transition hover:border-purple-600 hover:from-purple-900/70"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-700 text-xl shadow">
              🎮
            </span>
            <h2 className="text-xl font-semibold">Play</h2>
          </div>
          <p className="text-sm text-neutral-300">
            Pick a faction, mark it <strong className="text-purple-300">YOU</strong>, play
            against AI opponents. SVG map, action menu on your turn, AI reasoning panel.
          </p>
          <span className="mt-1 inline-flex items-center gap-1 self-start rounded-full bg-purple-700 px-3 py-1 text-xs font-semibold text-white">
            Start game →
          </span>
        </Link>

        <Link
          to="/sim"
          className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-teal-800/50 bg-gradient-to-br from-teal-950/60 to-neutral-900 p-6 transition hover:border-teal-600 hover:from-teal-900/70"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-700 text-xl shadow">
              📊
            </span>
            <h2 className="text-xl font-semibold">Simulate</h2>
          </div>
          <p className="text-sm text-neutral-300">
            Run 10–5000 AI-vs-AI games. Faction win rates, specialist claim curves,
            VP sources, balance warnings.
          </p>
          <span className="mt-1 inline-flex items-center gap-1 self-start rounded-full bg-teal-700 px-3 py-1 text-xs font-semibold text-white">
            Run sim →
          </span>
        </Link>
      </section>

      {/* Stats bar + rulebook link */}
      <section className="mt-6 flex flex-wrap items-center gap-3">
        {[
          ['8', 'Factions'],
          ['16', 'Regions'],
          ['7', 'Rounds'],
          ['3', 'Difficulties'],
          ['93', 'Tests'],
        ].map(([n, label]) => (
          <div key={label} className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2 text-center">
            <div className="text-lg font-bold text-white">{n}</div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
          </div>
        ))}
        <a
          href="/docs/rulebook.md"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto rounded-xl border border-neutral-700 bg-neutral-900/60 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:border-neutral-500 hover:text-white transition"
        >
          📖 Rulebook
        </a>
      </section>

      {/* Faction roster */}
      <section className="mt-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Factions
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FACTIONS.map((id) => (
            <li
              key={id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 transition hover:border-neutral-600"
            >
              <FactionEmblem factionId={id} size={40} />
              <span className="text-sm font-medium">{factionLabel(id)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Dev hints */}
      <section className="mt-8 flex flex-wrap gap-2 text-xs text-neutral-500">
        <code className="rounded bg-neutral-800 px-2 py-1">pnpm dev</code>
        <code className="rounded bg-neutral-800 px-2 py-1">pnpm test</code>
        <code className="rounded bg-neutral-800 px-2 py-1">pnpm sim --games=200</code>
        <code className="rounded bg-neutral-800 px-2 py-1">pnpm typecheck</code>
      </section>
    </main>
  );
}
