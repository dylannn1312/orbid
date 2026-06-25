'use client';

import { useState } from 'react';
import { useStellarWallet } from '@/lib/wallet';
import { useToast } from './Toast';
import { Auction, withdraw } from '@/lib/orbid';
import { fmtToken, shortAddr, explorerTx, explorerContract } from '@/lib/format';

const VERIFIER = process.env.NEXT_PUBLIC_VERIFIER_CONTRACT;
const IMAGE_ID = process.env.NEXT_PUBLIC_IMAGE_ID;
const AUCTION = process.env.NEXT_PUBLIC_AUCTION_CONTRACT;

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
      {/* The reveal - staged so the eye lands on the proof, then the price,
          then the one fact that matters: the bid itself stayed sealed. */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-b from-gold/10 to-transparent p-6 text-center">
        <p
          className="reveal-rise inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-teal"
          style={{ animationDelay: '0ms' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_10px_2px_rgba(94,234,212,0.7)]" aria-hidden />
          Proof verified on-chain
        </p>
        <p
          className="reveal-rise mt-4 text-xs uppercase tracking-[0.2em] text-gold/80"
          style={{ animationDelay: '500ms' }}
        >
          Settlement price · 2nd-highest bid
        </p>
        <p
          className="reveal-rise mt-2 font-display text-5xl font-semibold text-gold drop-shadow-[0_0_24px_rgba(232,179,65,0.45)] sm:text-6xl"
          style={{ animationDelay: '650ms' }}
        >
          {fmtToken(auction.secondPrice, decimals)}
          <span className="ml-2 text-2xl text-gold/70">{label}</span>
        </p>
        <p
          className="reveal-rise mt-4 text-sm text-muted"
          style={{ animationDelay: '1150ms' }}
        >
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

      {/* Provenance: let anyone confirm the proof actually ran on-chain. */}
      <div className="rounded-2xl border border-border bg-surface p-5 text-sm">
        <p className="eyebrow mb-3">Proof provenance</p>
        <dl className="grid gap-2.5">
          {IMAGE_ID && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-faint">Guest image id</dt>
              <dd className="truncate font-mono text-xs text-muted" title={IMAGE_ID}>
                {IMAGE_ID.slice(0, 10)}…{IMAGE_ID.slice(-6)}
              </dd>
            </div>
          )}
          {VERIFIER && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-faint">Groth16 verifier</dt>
              <dd>
                <a
                  href={explorerContract(VERIFIER)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-azure hover:underline"
                >
                  {shortAddr(VERIFIER, 6, 6)} ↗
                </a>
              </dd>
            </div>
          )}
          {AUCTION && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-faint">Auction contract</dt>
              <dd>
                <a
                  href={explorerContract(AUCTION)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-azure hover:underline"
                >
                  {shortAddr(AUCTION, 6, 6)} ↗
                </a>
              </dd>
            </div>
          )}
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          The contract recomputed the auction hash from its own stored bids, rebuilt the
          journal, and ran a native BN254 pairing check. The settlement above is the only
          outcome that proof attests to.
        </p>
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
