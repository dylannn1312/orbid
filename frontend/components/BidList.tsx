'use client';

import { SealedBid } from '@/lib/orbid';
import { fmtToken, shortAddr, ciphertextFingerprint } from '@/lib/format';
import { Copyable } from './Copyable';

function LockGlyph({ open }: { open?: boolean }) {
  const color = open ? 'var(--gold)' : 'var(--violet)';
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="flex-none">
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke={color} strokeWidth="1.3" />
      <path
        d={open ? 'M5 7V5.5a3 3 0 0 1 5.6-1.6' : 'M5 7V5.5a3 3 0 0 1 6 0V7'}
        fill="none"
        stroke={color}
        strokeWidth="1.3"
      />
    </svg>
  );
}

export function BidList({
  bids,
  winner,
  self,
  decimals,
  label,
  amounts,
  selfAmount,
}: {
  bids: SealedBid[];
  winner?: string | null;
  self?: string | null;
  decimals?: number;
  label?: string;
  amounts?: (bigint | null)[];
  selfAmount?: bigint | null;
}) {
  if (bids.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/50 p-6 text-center text-sm text-faint">
        No bids sealed yet. Be the first to commit.
      </div>
    );
  }

  // Keep each bid paired with its decrypted amount (aligned by original index),
  // then float the connected wallet's own bid to the top. sort() is stable, so
  // everyone else keeps their on-chain order.
  const ordered = bids
    .map((b, i) => ({ b, i }))
    .sort((a, z) => {
      const aSelf = self != null && a.b.bidder === self ? 0 : 1;
      const zSelf = self != null && z.b.bidder === self ? 0 : 1;
      return aSelf - zSelf;
    });

  return (
    <ul className="space-y-2">
      {ordered.map(({ b, i }) => {
        const isWinner = winner != null && b.bidder === winner;
        const isSelf = self != null && b.bidder === self;
        const revealed = amounts?.[i] ?? (isSelf ? selfAmount ?? null : null);
        const showAmount = revealed != null && decimals != null;
        return (
          <li
            key={`${b.bidder}-${i}`}
            className={`flex items-center gap-3 rounded-xl border bg-surface px-4 py-3 ${
              isWinner ? 'border-gold/50' : isSelf ? 'border-azure/40' : 'border-border'
            }`}
          >
            <LockGlyph open={showAmount} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Copyable
                  value={b.bidder}
                  display={shortAddr(b.bidder, 6, 6)}
                  className="font-mono text-sm text-text"
                />
                {isSelf && (
                  <span className="rounded-full border border-azure/50 bg-azure/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-azure">
                    You
                  </span>
                )}
                {isWinner && (
                  <span className="rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gold">
                    Winner
                  </span>
                )}
              </div>
              <div
                className="select-none truncate font-mono text-[11px] text-faint"
                style={{ filter: 'blur(0.6px)', opacity: 0.7 }}
                aria-hidden
                title="Encrypted bid fingerprint"
              >
                {ciphertextFingerprint(b.ciphertext, 28)}
              </div>
            </div>
            {showAmount ? (
              <span className="flex-none font-mono text-sm text-text">
                {fmtToken(revealed!, decimals!)}{' '}
                <span className="text-faint">{label}</span>
              </span>
            ) : (
              <span className="flex-none font-mono text-sm tracking-wider text-muted">
                •••••• <span className="text-faint">SEALED</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
