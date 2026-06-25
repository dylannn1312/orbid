'use client';

import { useState } from 'react';
import { useStellarWallet } from '@/lib/wallet';
import { useToast } from './Toast';
import { Auction, generateProof, finalize, hexToBytes } from '@/lib/orbid';
import { deriveAuctionKey } from '@/lib/auctionKey';
import { bytesToHex } from '@/lib/ecies';
import { explorerTx } from '@/lib/format';

export function OwnerRevealPanel({
  auction,
  onSuccess,
}: {
  auction: Auction;
  onSuccess: () => void;
}) {
  const { address, signTransaction, signMessage } = useStellarWallet();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'idle' | 'deriving' | 'proving' | 'settling'>('idle');

  async function handleReveal() {
    if (!address) return;
    setBusy(true);
    try {
      setStage('deriving');
      // Re-derive this auction's secret key from a wallet signature, then verify
      // it matches the on-chain public key (guards against the wrong wallet).
      const key = await deriveAuctionKey(signMessage, auction.nft, auction.tokenId);
      if (key.pubHex !== bytesToHex(auction.ownerPubkey)) {
        throw new Error(
          'Derived key does not match this lot. Connect the wallet that listed it.',
        );
      }

      setStage('proving');
      const proof = await generateProof(
        key.skHex,
        auction.id,
        auction.reserve,
        auction.deposit,
        auction.bids.map((b) => b.ciphertext),
      );

      setStage('settling');
      const hash = await finalize(
        address,
        signTransaction,
        auction.id,
        proof.winner_index,
        BigInt(proof.second_price),
        hexToBytes(proof.seal),
      );
      push({
        kind: 'success',
        message: 'Auction settled. The proof verified on-chain and the lot transferred.',
        href: explorerTx(hash),
        hrefLabel: 'Transaction',
      });
      onSuccess();
    } catch (e) {
      push({ kind: 'error', message: `Reveal failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
      setStage('idle');
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-violet/40 bg-violet/5 p-5">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-violet" aria-hidden />
        <h3 className="font-display text-lg font-medium text-text">Auctioneer · Reveal &amp; settle</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted">
        Bidding has closed. Generate the zero-knowledge proof of the Vickrey outcome, then
        settle on-chain. The proof reveals only the settlement price - every bid amount,
        including the winner&apos;s, stays sealed.
      </p>

      {busy && (
        <div className="rounded-lg border border-border bg-surface p-3 text-sm">
          <p className="flex items-center gap-2 text-violet">
            <span className="h-2 w-2 animate-ping rounded-full bg-violet" aria-hidden />
            {stage === 'deriving'
              ? 'Deriving your auction key - sign the message in your wallet…'
              : stage === 'proving'
                ? 'Generating proof… (~1–3 min) - keep this tab open'
                : 'Submitting proof to the contract…'}
          </p>
        </div>
      )}

      <button
        onClick={handleReveal}
        disabled={busy || auction.bids.length === 0}
        className="btn-primary w-full rounded-xl px-4 py-3 text-sm"
      >
        {auction.bids.length === 0
          ? 'No bids to settle'
          : busy
            ? 'Working…'
            : 'Reveal & settle'}
      </button>
    </div>
  );
}
