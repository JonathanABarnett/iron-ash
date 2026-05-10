export default function App() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Iron &amp; Ash</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Playtesting environment. UI lands in Phase 5 — for now this app is a stub.
      </p>
      <ul className="mt-8 space-y-2 text-sm">
        <li>
          Run a simulation: <code className="rounded bg-neutral-800 px-2 py-0.5">pnpm sim</code>
        </li>
        <li>
          Run engine tests: <code className="rounded bg-neutral-800 px-2 py-0.5">pnpm test</code>
        </li>
        <li>
          Typecheck: <code className="rounded bg-neutral-800 px-2 py-0.5">pnpm typecheck</code>
        </li>
      </ul>
    </main>
  );
}
