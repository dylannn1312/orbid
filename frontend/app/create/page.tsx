'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStellarWallet } from '@/lib/wallet';
import { useToast } from '@/components/Toast';
import { createAuction, nftMint } from '@/lib/orbid';
import { toBaseUnits } from '@/lib/format';
import { TOKENS, tokenDecimals } from '@/lib/tokens';
import { deriveAuctionKey } from '@/lib/auctionKey';
import { hexToBytes } from '@/lib/ecies';
import { DateTimePicker } from '@/components/DateTimePicker';

const NFT = process.env.NEXT_PUBLIC_NFT_CONTRACT!;
const PLACEHOLDER_URI = 'orbid://lot';

type Step = 'idle' | 'minting' | 'deriving' | 'listing';
type EndMode = 'duration' | 'datetime';
type DurationUnit = 'minutes' | 'hours' | 'days';
const UNIT_SECS: Record<DurationUnit, number> = { minutes: 60, hours: 3600, days: 86400 };

export default function CreateLotPage() {
  const router = useRouter();
  const { address, isConnected, connect, signTransaction, signMessage } = useStellarWallet();
  const { push } = useToast();

  const [name, setName] = useState('');
  const [reserve, setReserve] = useState('');
  const [deposit, setDeposit] = useState('');
  const [endMode, setEndMode] = useState<EndMode>('datetime');
  const [duration, setDuration] = useState('');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('hours');
  const [endAt, setEndAt] = useState(''); // datetime-local string
  const [tokenAddr, setTokenAddr] = useState(TOKENS[0].address);
  const [decimals, setDecimals] = useState<number | null>(null);
  const [step, setStep] = useState<Step>('idle');

  const tokenLabelSel = TOKENS.find((t) => t.address === tokenAddr)?.label ?? '';

  // Read the selected token's decimals from chain (memoized in lib/tokens).
  useEffect(() => {
    let cancelled = false;
    setDecimals(null);
    tokenDecimals(tokenAddr)
      .then((d) => {
        if (!cancelled) setDecimals(d);
      })
      .catch(() => {
        if (!cancelled) setDecimals(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tokenAddr]);

  const busy = step !== 'idle';

  // Reserve / deposit are decimal amounts of the selected token -> integer base
  // units (no floats). Only computable once decimals are known.
  let reserveBase: bigint | null = null;
  let depositBase: bigint | null = null;
  if (decimals != null) {
    try {
      if (reserve.trim() !== '') reserveBase = toBaseUnits(reserve, decimals);
    } catch {
      reserveBase = null;
    }
    try {
      if (deposit.trim() !== '') depositBase = toBaseUnits(deposit, decimals);
    } catch {
      depositBase = null;
    }
  }
  // Both modes resolve to the contract's `duration` (seconds from now). For a
  // calendar pick this shrinks over time, so it's recomputed again at submit.
  function durationSeconds(): number | null {
    if (endMode === 'duration') {
      const n = Number(duration);
      if (!Number.isFinite(n) || n <= 0) return null;
      const secs = Math.round(n * UNIT_SECS[durationUnit]);
      return secs > 0 ? secs : null;
    }
    if (endAt.trim() === '') return null;
    const t = new Date(endAt).getTime();
    if (Number.isNaN(t)) return null;
    const secs = Math.floor((t - Date.now()) / 1000);
    return secs > 0 ? secs : null;
  }
  const secs = durationSeconds();
  const valid =
    decimals != null &&
    name.trim() !== '' &&
    reserveBase != null &&
    reserveBase >= 0n &&
    depositBase != null &&
    depositBase > 0n &&
    reserveBase <= depositBase &&
    secs != null;

  async function handleCreate() {
    if (!isConnected || !address) {
      await connect();
      return;
    }
    if (!valid || reserveBase == null || depositBase == null) return;
    // Recompute right before submit so a calendar pick reflects the actual
    // seconds remaining at tx time.
    const durSecs = durationSeconds();
    if (durSecs == null) return;

    try {
      // 1. Mint a fresh lot NFT to the lister.
      setStep('minting');
      const tokenId = await nftMint(address, signTransaction, name.trim(), PLACEHOLDER_URI);

      // 2. Derive this lot's per-auction key from a wallet signature.
      setStep('deriving');
      const key = await deriveAuctionKey(signMessage, NFT, tokenId);

      // 3. List the auction with the derived public key as the auctioneer key.
      setStep('listing');
      const auctionId = await createAuction(
        address,
        signTransaction,
        hexToBytes(key.pubHex),
        tokenAddr,
        NFT,
        tokenId,
        reserveBase,
        depositBase,
        BigInt(durSecs),
      );

      push({
        kind: 'success',
        message: `Lot listed. Auction #${auctionId} is now in orbit.`,
      });
      router.push(`/auction/${auctionId}`);
    } catch (e) {
      push({ kind: 'error', message: `Could not list lot: ${(e as Error).message}` });
      setStep('idle');
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/"
        className="mb-6 inline-block text-sm text-muted transition hover:text-azure"
      >
        ← Back to lots
      </Link>

      <h1 className="font-display text-3xl font-semibold tracking-tight text-text sm:text-4xl">
        List a lot
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Mint a lot NFT and open it for sealed-bid Vickrey auction. A unique auctioneer key
        is derived from your wallet signature - nothing is stored, and only you can reveal
        the outcome later.
      </p>

      <div className="mt-8 space-y-5 rounded-2xl border border-border bg-surface p-6">
        <div>
          <label htmlFor="lot-name" className="mb-1.5 block text-sm font-medium text-text">
            Lot name
          </label>
          <input
            id="lot-name"
            type="text"
            placeholder="Orbital Relic No. 7"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-text outline-none placeholder:text-faint focus:border-azure"
          />
        </div>

        <div>
          <label htmlFor="lot-token" className="mb-1.5 block text-sm font-medium text-text">
            Payment token
          </label>
          <select
            id="lot-token"
            value={tokenAddr}
            onChange={(e) => setTokenAddr(e.target.value)}
            disabled={busy}
            className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-text outline-none focus:border-azure"
          >
            {TOKENS.map((t) => (
              <option key={t.address} value={t.address}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-faint">
            {decimals == null
              ? 'Reading token decimals from chain…'
              : `Reserve and deposit are in ${tokenLabelSel} (${decimals} decimals).`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="lot-reserve" className="mb-1.5 block text-sm font-medium text-text">
              Reserve
            </label>
            <div className="flex items-stretch overflow-hidden rounded-xl border border-border bg-bg focus-within:border-azure">
              <input
                id="lot-reserve"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0"
                value={reserve}
                onChange={(e) => setReserve(e.target.value)}
                disabled={busy}
                className="w-full bg-transparent px-4 py-3 font-mono text-text outline-none placeholder:text-faint"
              />
              <span className="flex items-center px-3 font-mono text-xs text-faint">
                {tokenLabelSel}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="lot-deposit" className="mb-1.5 block text-sm font-medium text-text">
              Deposit
            </label>
            <div className="flex items-stretch overflow-hidden rounded-xl border border-border bg-bg focus-within:border-azure">
              <input
                id="lot-deposit"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                disabled={busy}
                className="w-full bg-transparent px-4 py-3 font-mono text-text outline-none placeholder:text-faint"
              />
              <span className="flex items-center px-3 font-mono text-xs text-faint">
                {tokenLabelSel}
              </span>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="lot-duration" className="block text-sm font-medium text-text">
              Bidding closes
            </label>
            <div className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
              <button
                type="button"
                onClick={() => setEndMode('duration')}
                disabled={busy}
                className={
                  endMode === 'duration'
                    ? 'bg-azure/15 px-3 py-1 text-azure'
                    : 'px-3 py-1 text-muted transition hover:text-text'
                }
              >
                Duration
              </button>
              <button
                type="button"
                onClick={() => setEndMode('datetime')}
                disabled={busy}
                className={
                  endMode === 'datetime'
                    ? 'bg-azure/15 px-3 py-1 text-azure'
                    : 'px-3 py-1 text-muted transition hover:text-text'
                }
              >
                Calendar
              </button>
            </div>
          </div>

          {endMode === 'duration' ? (
            <div className="flex items-stretch overflow-hidden rounded-xl border border-border bg-bg focus-within:border-azure">
              <input
                id="lot-duration"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                placeholder="24"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                disabled={busy}
                className="w-full bg-transparent px-4 py-3 font-mono text-text outline-none placeholder:text-faint"
              />
              <select
                value={durationUnit}
                onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
                disabled={busy}
                className="border-l border-border bg-bg px-3 font-mono text-xs text-faint outline-none"
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
          ) : (
            <DateTimePicker value={endAt} onChange={setEndAt} disabled={busy} />
          )}

          {secs != null && (
            <p className="mt-1.5 text-xs text-faint">
              Reveal &amp; settle unlocks {new Date(Date.now() + secs * 1000).toLocaleString()}.
            </p>
          )}
        </div>

        {name !== '' && !valid && (
          <p className="text-xs text-rose-300">
            Enter a name, a non-negative reserve no greater than the deposit, a deposit
            greater than zero, and a close time in the future.
          </p>
        )}

        {busy && (
          <div className="rounded-lg border border-border bg-bg p-3 text-sm">
            <p className="flex items-center gap-2 text-azure">
              <span className="h-2 w-2 animate-ping rounded-full bg-azure" aria-hidden />
              {step === 'minting'
                ? 'Minting your lot NFT - sign in your wallet…'
                : step === 'deriving'
                  ? 'Deriving the auctioneer key - sign the message in your wallet…'
                  : 'Listing the auction - sign in your wallet…'}
            </p>
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={busy || (isConnected && !valid)}
          className="btn-primary w-full rounded-xl px-4 py-3 text-sm"
        >
          {!isConnected
            ? 'Connect wallet to list'
            : step === 'minting'
              ? 'Minting NFT…'
              : step === 'deriving'
                ? 'Deriving key…'
                : step === 'listing'
                  ? 'Listing lot…'
                  : 'Mint & list lot'}
        </button>
      </div>
    </div>
  );
}
