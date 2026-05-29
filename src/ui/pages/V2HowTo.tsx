// ─── Iron & Ash v2 — first-run "How to play" overlay ─────────────────────────
//
// A dismissible, centered modal explaining the v2 sandbox in ~5 plain steps.
// Auto-shows once (gated on the `ia-v2-howto-seen` localStorage key); a
// persistent "? How to play" button in V2Page reopens it anytime.
//
// This is a presentation-only component — it owns no game state, just renders
// when `open` is true and calls `onClose` when dismissed. The localStorage gate
// lives here so the auto-show logic is self-contained.

import { useEffect } from 'react';

const HOWTO_SEEN_KEY = 'ia-v2-howto-seen';

/** True if the player has never dismissed the how-to before (so auto-show it). */
export function shouldAutoShowHowTo(): boolean {
  try {
    return localStorage.getItem(HOWTO_SEEN_KEY) !== '1';
  } catch {
    // localStorage can throw in private mode / SSR — fail open (show it).
    return true;
  }
}

/** Remember that the player has seen the how-to so it won't auto-show again. */
export function markHowToSeen(): void {
  try {
    localStorage.setItem(HOWTO_SEEN_KEY, '1');
  } catch {
    /* ignore — non-fatal */
  }
}

interface Step {
  body: React.ReactNode;
}

const STEPS: Step[] = [
  {
    body: (
      <>
        You&rsquo;re the <strong style={{ color: '#2dd4bf' }}>Warriors</strong>. Each territory you
        still hold at the end of a round scores its spoil&rsquo;s value{' '}
        <em>to you</em> — your primary spoil (Iron) is worth <strong>3</strong>, your secondaries
        are worth <strong>2</strong>, anything else <strong>1</strong>.
      </>
    ),
  },
  {
    body: (
      <>
        Every round you roll a <strong>hand of dice</strong> — these are your forces. Better dice
        (Elite, Champion) tend to roll higher than a Levy.
      </>
    ),
  },
  {
    body: (
      <>
        <strong>Click a die, then click a glowing territory</strong> to send that force there. You
        can only reach territories next to ones you already own — unreachable tiles are dimmed.
      </>
    ),
  },
  {
    body: (
      <>
        Press <strong>Resolve</strong> — you and the AI reveal commitments at once. Highest total
        wins the tile (the current defender adds their terrain bonus; ties stay with the owner).
      </>
    ),
  },
  {
    body: (
      <>
        After <strong>6 rounds</strong>, each player&rsquo;s hidden objective is revealed and the
        most total VP wins.
      </>
    ),
  },
];

export function V2HowTo({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How to play Iron & Ash v2"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(5,5,10,0.78)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl p-5 md:p-6"
        style={{
          background: '#15151f',
          border: '1px solid rgba(167,139,250,0.4)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          color: '#e4e4e7',
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-white">
            How to play <span style={{ color: '#a78bfa' }}>Iron &amp; Ash v2</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-sm"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#a1a1aa' }}
          >
            ✕
          </button>
        </div>

        <ol className="space-y-3">
          {STEPS.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed" style={{ color: '#d4d4d8' }}>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: 'rgba(167,139,250,0.18)', color: '#c4b5fd' }}
              >
                {i + 1}
              </span>
              <span>{step.body}</span>
            </li>
          ))}
        </ol>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl px-4 py-3 text-sm font-bold text-white transition-colors"
          style={{ background: '#7c3aed' }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
