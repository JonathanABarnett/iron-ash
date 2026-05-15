// Replay viewer — load a saved replay JSON and browse the game log.
// Replay files are produced by the "Export Replay" button in PlayPage.
// The file is a serialised GameState (finished phase) plus metadata.

import { useRef, useState } from 'react';
import type { GameState, FactionId } from '@engine/types';
import { FactionEmblem, factionLabel } from '@ui/components/FactionEmblem';

interface ReplayFile {
  version: 1;
  seed: string;
  lineup: { playerId: string; factionId: FactionId }[];
  difficulty: string;
  timestamp: string;
  finalState: GameState;
}

export function ReplayPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [replay, setReplay] = useState<ReplayFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState<number>(1);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as ReplayFile;
        if (!data.finalState || data.finalState.phase !== 'finished') {
          throw new Error('Not a valid finished replay file.');
        }
        setReplay(data);
        setRound(1);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    reader.readAsText(file);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Iron &amp; Ash — Replay</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Load a <code>.json</code> replay exported from a finished game.
      </p>

      <section className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-semibold hover:bg-neutral-700"
        >
          Open replay file…
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={onFileChange}
        />
        {replay && (
          <span className="text-xs text-neutral-400">
            Loaded: seed={replay.seed} · {replay.difficulty} · {replay.finalState.round} rounds
          </span>
        )}
      </section>

      {error && (
        <div className="mt-4 rounded border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {replay && <ReplayViewer replay={replay} viewRound={round} onRoundChange={setRound} />}
    </main>
  );
}

function ReplayViewer({
  replay,
  viewRound,
  onRoundChange,
}: {
  replay: ReplayFile;
  viewRound: number;
  onRoundChange: (r: number) => void;
}) {
  const state = replay.finalState;
  const maxRound = state.round;
  const breakdown = state.scoreBreakdown;

  // Group log entries by round.
  const byRound: Record<number, typeof state.log> = {};
  for (const entry of state.log) {
    const r = entry.round;
    if (!byRound[r]) byRound[r] = [];
    byRound[r]!.push(entry);
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Header metadata */}
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <MetaStat label="Seed" value={replay.seed} mono />
        <MetaStat label="Difficulty" value={replay.difficulty} />
        <MetaStat label="Rounds" value={String(maxRound)} />
        <MetaStat label="Saved" value={new Date(replay.timestamp).toLocaleString()} />
      </div>

      {/* Lineup + final VP */}
      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Final standings
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {replay.lineup.map(({ playerId, factionId }) => {
            const player = state.players[playerId];
            const perPlayer = breakdown?.perPlayer[playerId];
            const isWinner = state.winnerId === playerId;
            return (
              <div
                key={playerId}
                className={`rounded border p-3 ${
                  isWinner
                    ? 'border-yellow-600 bg-yellow-950/30'
                    : 'border-neutral-700 bg-neutral-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FactionEmblem factionId={factionId} size={28} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {isWinner && <span className="mr-1 text-yellow-400">★</span>}
                      {factionLabel(factionId)}
                    </div>
                    <div className="text-xs text-neutral-400">{playerId}</div>
                  </div>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums">
                  {player?.vp ?? (perPlayer?.total ?? '?')}
                  <span className="ml-1 text-xs font-normal text-neutral-400">VP</span>
                </div>
                {perPlayer && (
                  <div className="mt-1 space-y-0.5 text-[10px] text-neutral-500">
                    {perPlayer.parts.roundGoals > 0 && (
                      <div>Rnd goals: {perPlayer.parts.roundGoals}</div>
                    )}
                    {perPlayer.parts.fortressEndGame > 0 && (
                      <div>Fortress: {perPlayer.parts.fortressEndGame}</div>
                    )}
                    {perPlayer.parts.regionControl > 0 && (
                      <div>Regions: {perPlayer.parts.regionControl}</div>
                    )}
                    {perPlayer.parts.secretGoals > 0 && (
                      <div>Secrets: {perPlayer.parts.secretGoals}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Round log browser */}
      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Round {viewRound} log
          </h2>
          <div className="flex items-center gap-1">
            <button
              disabled={viewRound <= 1}
              onClick={() => onRoundChange(viewRound - 1)}
              className="rounded border border-neutral-700 px-2 py-0.5 text-xs hover:bg-neutral-800 disabled:opacity-40"
            >
              ‹ Prev
            </button>
            {Array.from({ length: maxRound }, (_, i) => i + 1).map((r) => (
              <button
                key={r}
                onClick={() => onRoundChange(r)}
                className={`rounded px-2 py-0.5 text-xs ${
                  r === viewRound
                    ? 'bg-purple-700 text-white'
                    : 'border border-neutral-700 hover:bg-neutral-800'
                }`}
              >
                {r}
              </button>
            ))}
            <button
              disabled={viewRound >= maxRound}
              onClick={() => onRoundChange(viewRound + 1)}
              className="rounded border border-neutral-700 px-2 py-0.5 text-xs hover:bg-neutral-800 disabled:opacity-40"
            >
              Next ›
            </button>
          </div>
        </div>

        <div className="space-y-1">
          {(byRound[viewRound] ?? []).map((entry, i) => (
            <LogEntryRow
              key={i}
              entry={entry}
              playerLookup={replay.lineup}
            />
          ))}
          {!byRound[viewRound] && (
            <p className="text-xs text-neutral-500">No log entries for this round.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function LogEntryRow({
  entry,
  playerLookup,
}: {
  entry: GameState['log'][number];
  playerLookup: { playerId: string; factionId: FactionId }[];
}) {
  const factionId = playerLookup.find((p) => p.playerId === entry.playerId)?.factionId;
  const ev = entry.event;

  let description = '';
  if (ev.kind === 'move') {
    const m = ev.move;
    switch (m.kind) {
      case 'place':
        description = `Placed die on ${m.regionId}`;
        break;
      case 'combine':
        description = `Combined dice on ${m.regionId}`;
        break;
      case 'pass':
        description = 'Passed';
        break;
      case 'hire-merc':
        description = `Hired ${m.mercSlot} merc`;
        break;
      case 'battle':
        description = `Battle in ${m.targetRegionId}`;
        break;
      case 'draft-card':
        description = `Drafted card ${m.cardId}`;
        break;
      case 'play-card':
        description = `Played card ${m.cardId}`;
        break;
      case 'use-active':
        description = 'Used active ability';
        break;
      case 'upgrade-die':
        description = 'Upgraded die';
        break;
      case 'expand-barracks':
        description = 'Expanded barracks';
        break;
    }
  } else if (ev.kind === 'roll') {
    description = 'Rolled barracks dice';
  } else if (ev.kind === 'end-of-round') {
    description = '— End of round —';
  }

  return (
    <div className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-neutral-800/40">
      <span className="w-16 shrink-0 tabular-nums text-neutral-500">
        T{entry.turn}
      </span>
      {factionId && <FactionEmblem factionId={factionId} size={16} />}
      <span className="truncate text-neutral-300">{description}</span>
    </div>
  );
}

function MetaStat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
