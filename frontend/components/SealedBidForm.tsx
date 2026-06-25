'use client';

import { useCallback, useEffect, useState } from 'react';
import { useStellarWallet } from '@/lib/wallet';
import { useToast } from './Toast';
import { Auction, placeBid, tokenBalance } from '@/lib/orbid';
import { encryptBid, bytesToHex } from '@/lib/ecies';
import { deriveBidKey } from '@/lib/auctionKey';
import { fmtToken, fromBaseUnits, explorerTx, toBaseUnits } from '@/lib/format';

export function SealedBidForm({
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
  const { address, isConnected, connect, signTransaction, signMessage } = useStellarWallet();
  const { push } = useToast();
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'idle' | 'deriving' | 'sealing' | 'signing'>('idle');
  const [balance, setBalance] = useState<bigint | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance(null);
      return;
    }
    try {
      setBalance(await tokenBalance(auction.paymentToken, address));
    } catch {
      setBalance(null);
    }
  }, [address, auction.paymentToken]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  // Parse the decimal token entry into integer base units; null when invalid.
  let bidBase: bigint | null = null;
  try {
    if (amount.trim() !== '') bidBase = toBaseUnits(amount, decimals);
  } catch {
    bidBase = null;
  }
  const positive = bidBase != null && bidBase > 0n;
  const withinDeposit = bidBase != null && bidBase <= auction.deposit;
  const alreadyBid = address != null && auction.bids.some((b) => b.bidder === address);
  // A new bid escrows the deposit; a re-bid reuses the one already locked.
  const affordable = alreadyBid || balance == null || balance >= auction.deposit;
  const valid = positive && withinDeposit && affordable;

  async function handleSubmit() {
    if (!isConnected || !address) {
      await connect();
      return;
    }
    if (!valid || bidBase == null) return;
    setBusy(true);
    try {
      setStage('deriving');
      // Derive this bidder's deterministic ephemeral key from a wallet signature
      // so they can decrypt their own bid later (no local storage needed).
      const bidKey = await deriveBidKey(signMessage, auction.nft, auction.tokenId);

      setStage('sealing');
      // Encrypt to this lot's own auctioneer public key (per-auction key).
      const pubHex = bytesToHex(auction.ownerPubkey);
      const wire = encryptBid(pubHex, bidBase, bidKey.skHex);
      const hex = bytesToHex(wire);
      setPreview(hex);

      setStage('signing');
      const hash = await placeBid(address, signTransaction, auction.id, wire);
      push({
        kind: 'success',
        message: 'Your sealed bid is on-chain. The amount stays encrypted.',
        href: explorerTx(hash),
        hrefLabel: 'Transaction',
      });
      setAmount('');
      void refreshBalance();
      onSuccess();
    } catch (e) {
      push({ kind: 'error', message: `Bid failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
      setStage('idle');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <label htmlFor="bid-amount" className="text-sm font-medium text-text">
            Your bid
          </label>
          {address && (
            <span className="font-mono text-xs text-faint">
              Balance:{' '}
              <span className="text-muted">
                {balance == null ? '…' : fromBaseUnits(balance, decimals)} {label}
              </span>
            </span>
          )}
        </div>
        <div className="flex items-stretch overflow-hidden rounded-xl border border-border bg-bg focus-within:border-azure">
          <input
            id="bid-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
            className="w-full bg-transparent px-4 py-3 font-mono text-lg text-text outline-none placeholder:text-faint"
          />
          <span className="flex items-center px-4 font-mono text-sm text-faint">{label}</span>
        </div>
        {amount.trim() !== '' && !positive && (
          <p className="mt-1.5 text-xs text-rose-300">
            Enter a {label} amount greater than zero.
          </p>
        )}
        {positive && !withinDeposit && (
          <p className="mt-1.5 text-xs text-rose-300">
            Your bid can be at most the {fmtToken(auction.deposit, decimals)} {label} deposit.
          </p>
        )}
        {positive && withinDeposit && !affordable && (
          <p className="mt-1.5 text-xs text-rose-300">
            You need {fmtToken(auction.deposit, decimals)} {label} to cover the deposit — your
            balance is {balance == null ? '…' : fromBaseUnits(balance, decimals)} {label}. Use
            “Get test {label}” to top up.
          </p>
        )}
      </div>

      <p className="rounded-lg border border-border bg-surface/60 p-3 text-xs leading-relaxed text-muted">
        You lock a{' '}
        <span className="font-mono text-text">
          {fmtToken(auction.deposit, decimals)} {label}
        </span>{' '}
        deposit. You pay only the second-highest price if you win - the rest is refunded.
        Lose, and you withdraw your full deposit.
      </p>

      {alreadyBid && (
        <p className="rounded-lg border border-azure/30 bg-azure/5 p-3 text-xs leading-relaxed text-azure">
          You&rsquo;ve already bid on this lot. Submitting again replaces your sealed bid —
          no second deposit is taken.
        </p>
      )}

      {preview && (
        <div className="rounded-lg border border-violet/30 bg-violet/5 p-3">
          <p className="mb-1 text-[11px] uppercase tracking-wide text-violet">
            Ciphertext - this is what goes on-chain
          </p>
          <p className="break-all font-mono text-[11px] leading-relaxed text-muted">
            {preview.slice(0, 96)}…
          </p>
          <p className="mt-1.5 text-[11px] text-faint">Your amount is encrypted. No one can read it.</p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={busy || (isConnected && !valid)}
        className="btn-primary w-full rounded-xl px-4 py-3 text-sm"
      >
        {!isConnected
          ? 'Connect wallet to bid'
          : stage === 'deriving'
            ? 'Deriving your bid key — sign in your wallet…'
            : stage === 'sealing'
              ? 'Sealing your bid…'
              : stage === 'signing'
                ? 'Awaiting signature…'
                : alreadyBid
                  ? 'Update sealed bid'
                  : 'Seal & submit bid'}
      </button>
    </div>
  );
}
