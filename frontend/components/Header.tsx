'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useStellarWallet } from '@/lib/wallet';
import { useToast } from './Toast';
import { usdcBalance, usdcMint, usdtMint } from '@/lib/orbid';
import { fromBaseUnits, shortAddr, explorerTx, USDC_DECIMALS } from '@/lib/format';

const USDC_FAUCET = 5000n * 10_000_000n; // 5,000 USDC at 7 decimals
const USDT_FAUCET = 5000n * 1_000_000n; // 5,000 USDT at 6 decimals

function OrbitGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden className="flex-none">
      <circle cx="14" cy="14" r="4" fill="url(#hg)" />
      <ellipse
        cx="14"
        cy="14"
        rx="11"
        ry="5"
        fill="none"
        stroke="var(--azure)"
        strokeWidth="1.2"
        opacity="0.8"
        transform="rotate(28 14 14)"
      />
      <circle cx="24" cy="11" r="1.8" fill="var(--violet)" />
      <defs>
        <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--azure)" />
          <stop offset="100%" stopColor="var(--violet)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Header() {
  const { address, isConnected, connect, disconnect, signTransaction } = useStellarWallet();
  const { push } = useToast();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [faucetBusy, setFaucetBusy] = useState(false);

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance(null);
      return;
    }
    try {
      setBalance(await usdcBalance(address));
    } catch {
      setBalance(null);
    }
  }, [address]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  const handleConnect = useCallback(async () => {
    setBusy(true);
    try {
      await connect();
    } catch (e) {
      push({ kind: 'error', message: `Could not connect wallet: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }, [connect, push]);

  const handleFaucet = useCallback(async () => {
    if (!address) return;
    setFaucetBusy(true);
    try {
      await usdcMint(address, signTransaction, USDC_FAUCET);
      const hash = await usdtMint(address, signTransaction, USDT_FAUCET);
      push({
        kind: 'success',
        message: 'Minted test USDC + USDT to your wallet.',
        href: explorerTx(hash),
        hrefLabel: 'Transaction',
      });
      await refreshBalance();
    } catch (e) {
      push({ kind: 'error', message: `Faucet failed: ${(e as Error).message}` });
    } finally {
      setFaucetBusy(false);
    }
  }, [address, signTransaction, push, refreshBalance]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Orbid home">
          <OrbitGlyph />
          <span className="font-display text-xl font-semibold tracking-tight text-text">
            Orbid
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {isConnected && (
            <Link
              href="/me"
              className="btn-ghost hidden whitespace-nowrap rounded-lg px-3 py-1.5 text-sm sm:block"
            >
              My activity
            </Link>
          )}

          <Link
            href="/create"
            className="btn-ghost whitespace-nowrap rounded-lg px-3 py-1.5 text-sm"
          >
            List a lot
          </Link>

          {isConnected && (
            <span className="hidden items-baseline gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 sm:inline-flex">
              <span className="font-mono text-sm tabular-nums text-gold-gradient">
                {balance == null ? '-' : fromBaseUnits(balance, USDC_DECIMALS)}
              </span>
              <span className="eyebrow">USDC</span>
            </span>
          )}

          {isConnected && (
            <button
              onClick={handleFaucet}
              disabled={faucetBusy}
              className="btn-ghost hidden whitespace-nowrap rounded-lg px-3 py-1.5 text-sm disabled:opacity-50 sm:block"
            >
              {faucetBusy ? 'Minting…' : 'Get test USDC'}
            </button>
          )}

          {isConnected ? (
            <button
              onClick={disconnect}
              className="whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-sm text-text transition hover:border-rose-500/40 hover:text-rose-300"
              title="Disconnect wallet"
            >
              {shortAddr(address)}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={busy}
              className="btn-primary rounded-lg px-4 py-1.5 text-sm"
            >
              {busy ? 'Connecting…' : 'Connect wallet'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
