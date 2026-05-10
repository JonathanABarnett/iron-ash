import { Link } from 'react-router';

export function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Iron &amp; Ash</h1>
      <p className="mt-3 text-base text-neutral-400">
        A web-based playtesting environment for the medieval-fantasy dice-placement game.
        Designed to validate balance via headless AI simulation before polishing the play
        experience.
      </p>

      <section className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          to="/sim"
          className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 transition hover:border-purple-700 hover:bg-purple-950/20"
        >
          <h2 className="text-lg font-semibold">Run simulation</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Batch AI-vs-AI games. Specialist claim curves, faction win rates, balance warnings.
          </p>
        </Link>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 opacity-60">
          <h2 className="text-lg font-semibold">Play (Phase 5b)</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Interactive 1-human vs 1–3 AI session. Coming after the sim-driven balance pass.
          </p>
        </div>
      </section>

      <section className="mt-10 text-xs text-neutral-500">
        <p>Engine, AI, and simulation layers are pure TypeScript and run unchanged in Node and browser.</p>
        <p>Tests: <code className="rounded bg-neutral-800 px-1">pnpm test</code>. CLI sim: <code className="rounded bg-neutral-800 px-1">pnpm sim --games=200</code>.</p>
      </section>
    </main>
  );
}
