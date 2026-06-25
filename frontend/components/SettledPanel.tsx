'use client';

import { useState } from 'react';
import { useStellarWallet } from '@/lib/wallet';
import { useToast } from './Toast';
import { Auction, withdraw } from '@/lib/orbid';
import { fmtToken, shortAddr, explorerTx } from '@/lib/format';

export function SettledPanel({
  auction,
  decimals,
  label,
  onSuccess,
}: {
  auction: Auction;
  decimals: number;
  label: string;
  onSuccess: () => void;
}) {
  const { address, signTransaction } = useStellarWallet();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  const isWinner = address != null && auction.winner === address;
  const didBid = address != null && auction.bids.some((b) => b.bidder === address);
  const canWithdraw = didBid && !isWinner;

  async function handleWithdraw() {
    if (!address) return;
    setBusy(true);
    try {
      const hash = await withdraw(address, signTransaction, auction.id);
      push({
        kind: 'success',
        message: 'Deposit withdrawn.',
        href: explorerTx(hash),
        hrefLabel: 'Transaction',
      });
      onSuccess();
    } catch (e) {
      push({ kind: 'error', message: `Withdraw failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* The reveal - the emotional peak. */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-b from-gold/10 to-transparent p-6 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-gold/80">
          Settlement price · 2nd-highest bid
        </p>
        <p className="mt-3 font-display text-5xl font-semibold text-gold drop-shadow-[0_0_24px_rgba(232,179,65,0.45)] sm:text-6xl">
          {fmtToken(auction.secondPrice, decimals)}
          <span className="ml-2 text-2xl text-gold/70">{label}</span>
        </p>
        <p className="mt-4 text-sm text-muted">
          Every bid amount stayed sealed - even the winner&apos;s.
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-surface p-5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-faint">Winner</span>
          <span className="font-mono text-teal">{shortAddr(auction.winner, 6, 6)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-faint">Lot now owned by</span>
          <span className="font-mono text-text">{shortAddr(auction.winner, 6, 6)}</span>
        </div>
        {isWinner && (
          <p className="rounded-lg border border-teal/30 bg-teal/5 p-3 text-teal">
            You won this lot. You paid the settlement price above.
          </p>
        )}
      </div>

      {canWithdraw && (
        <div className="panel border-teal/30 bg-teal/5 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="eyebrow text-teal">Refundable</p>
              <p className="mt-1 text-sm text-muted">
                You didn&rsquo;t win — your full deposit is yours to reclaim.
              </p>
            </div>
            <span className="flex-none font-mono text-lg text-text">
              {fmtToken(auction.deposit, decimals)} {label}
            </span>
          </div>
          <button
            onClick={handleWithdraw}
            disabled={busy}
            className="btn-primary mt-4 w-full rounded-xl px-4 py-3 text-sm disabled:opacity-50"
          >
            {busy ? 'Reclaiming…' : `Reclaim your ${fmtToken(auction.deposit, decimals)} ${label} deposit`}
          </button>
        </div>
      )}
    </div>
  );
}
