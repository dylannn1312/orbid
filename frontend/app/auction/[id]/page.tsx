'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useStellarWallet } from '@/lib/wallet';
import {
  Auction,
  auctionStatus,
  queryAuction,
  nftMetadata,
  NftMetadata,
} from '@/lib/orbid';
import { lotArtDataUri } from '@/lib/art';
import { fmtToken } from '@/lib/format';
import { tokenDecimals, tokenLabel } from '@/lib/tokens';
import { deriveAuctionKey, deriveBidKey } from '@/lib/auctionKey';
import { decryptBid, decryptOwnBid, bytesToHex } from '@/lib/ecies';
import { OrbitCountdown } from '@/components/OrbitCountdown';
import { StatusChip } from '@/components/StatusChip';
import { InviteButton } from '@/components/InviteButton';
import { SealedBidForm } from '@/components/SealedBidForm';
import { BidList } from '@/components/BidList';
import { OwnerRevealPanel } from '@/components/OwnerRevealPanel';
import { SettledPanel } from '@/components/SettledPanel';
import { useToast } from '@/components/Toast';

export default function LotDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { address, signMessage } = useStellarWallet();
  const { push } = useToast();

  const [auction, setAuction] = useState<Auction | null>(null);
  const [meta, setMeta] = useState<NftMetadata | null>(null);
  const [decimals, setDecimals] = useState<number | null>(null);
  const [tokenLbl, setTokenLbl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Owner-decrypted bid amounts (aligned to auction.bids), and the connected
  // bidder's own remembered amount.
  const [amounts, setAmounts] = useState<(bigint | null)[] | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [selfAmount, setSelfAmount] = useState<bigint | null>(null);
  const [revealing, setRevealing] = useState(false);

  const load = useCallback(async () => {
    try {
      const a = await queryAuction(id);
      setAuction(a);
      setTokenLbl(tokenLabel(a.paymentToken));
      try {
        setDecimals(await tokenDecimals(a.paymentToken));
      } catch {
        setDecimals(null);
      }
      try {
        setMeta(await nftMetadata(a.tokenId));
      } catch {
        setMeta({ name: `Lot #${a.tokenId}`, uri: '' });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setError('Invalid lot id');
      setLoading(false);
      return;
    }
    void load();
  }, [id, load]);

  // Keep the lot live: poll for new sealed bids until it settles, so the
  // seller (and everyone) sees incoming bids without a manual refresh.
  useEffect(() => {
    if (auction?.settled) return;
    const t = setInterval(() => void load(), 12000);
    return () => clearInterval(t);
  }, [auction?.settled, load]);

  // Decrypted amounts are tied to specific ciphertexts. If any bid changes
  // (a bidder updated theirs, or a new bid arrived), drop the cached
  // decryptions so a stale amount never lingers — the reveal/decrypt buttons
  // reappear and re-derive against the current ciphertexts.
  const bidsSig = (auction?.bids ?? []).map((b) => bytesToHex(b.ciphertext)).join(',');
  useEffect(() => {
    setAmounts(null);
    setSelfAmount(null);
  }, [bidsSig]);

  // Bidder: re-derive your ephemeral key from a wallet signature and decrypt
  // your OWN bid (ECIES lets the sender recover their message). No storage.
  const revealMyBid = useCallback(async () => {
    if (!auction || !address) return;
    const mine = auction.bids.find((b) => b.bidder === address);
    if (!mine) return;
    setRevealing(true);
    try {
      const bidKey = await deriveBidKey(signMessage, auction.nft, auction.tokenId);
      setSelfAmount(decryptOwnBid(bidKey.skHex, bytesToHex(auction.ownerPubkey), mine.ciphertext));
    } catch (e) {
      push({ kind: 'error', message: `Could not reveal your bid: ${(e as Error).message}` });
    } finally {
      setRevealing(false);
    }
  }, [auction, address, signMessage, push]);

  // Auctioneer-only: derive the per-auction key and decrypt every bid locally.
  const decryptBids = useCallback(async () => {
    if (!auction) return;
    setDecrypting(true);
    try {
      const key = await deriveAuctionKey(signMessage, auction.nft, auction.tokenId);
      if (key.pubHex !== bytesToHex(auction.ownerPubkey)) {
        throw new Error('Derived key does not match this lot. Connect the wallet that listed it.');
      }
      setAmounts(auction.bids.map((b) => decryptBid(key.skHex, b.ciphertext)));
    } catch (e) {
      push({ kind: 'error', message: `Could not decrypt bids: ${(e as Error).message}` });
    } finally {
      setDecrypting(false);
    }
  }, [auction, signMessage, push]);

  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-muted">
        <span className="font-mono text-sm">Loading lot…</span>
      </div>
    );
  }

  if (error || !auction) {
    return (
      <div className="space-y-4">
        <Link href="/" className="text-sm text-azure hover:underline">
          ← Back to lots
        </Link>
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-200">
          Could not load this lot: {error ?? 'not found'}
        </div>
      </div>
    );
  }

  const status = auctionStatus(auction);
  const isOwner = address != null && address === auction.seller;
  const isBidder = address != null && auction.bids.some((b) => b.bidder === address);
  const name = meta?.name ?? `Lot #${auction.tokenId}`;
  const art = lotArtDataUri(auction.tokenId, 640);

  return (
    <div>
      <Link
        href="/"
        className="mb-6 inline-block text-sm text-muted transition hover:text-azure"
      >
        ← Back to lots
      </Link>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left: art + countdown + title */}
        <div className="space-y-6">
          <div className="panel overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={art} alt={`Procedural lot art for ${name}`} className="w-full" />
          </div>

          <div className="panel flex flex-col items-center gap-4 p-6">
            {status === 'settled' ? (
              <div className="py-6 text-center">
                <span className="font-mono text-lg text-teal">Auction settled</span>
              </div>
            ) : (
              <OrbitCountdown
                endTime={auction.endTime}
                label={status === 'live' ? 'until reveal' : 'closed'}
              />
            )}
            <p className="eyebrow text-center">
              Closes {new Date(auction.endTime * 1000).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Right: details + actions */}
        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <StatusChip status={status} />
              <span className="font-mono text-xs text-faint">Lot #{auction.id}</span>
              <InviteButton
                auctionId={auction.id}
                live={status === 'live'}
                className="ml-auto"
              />
            </div>
            <h1 className="font-display text-3xl font-medium tracking-[-0.01em] text-text sm:text-[2.75rem] sm:leading-[1.05]">
              {name}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              A sealed-bid Vickrey lot. The highest bidder wins and pays the second-highest
              price. Bids are encrypted to the auctioneer and revealed only as a single
              settlement price - proven, never disclosed.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="panel p-4">
              <p className="eyebrow">Reserve</p>
              <p className="mt-1.5 font-mono text-xl text-gold-gradient">
                {decimals == null ? '…' : `${fmtToken(auction.reserve, decimals)} ${tokenLbl}`}
              </p>
            </div>
            <div className="panel p-4">
              <p className="eyebrow">Deposit</p>
              <p className="mt-1.5 font-mono text-xl text-text">
                {decimals == null ? '…' : `${fmtToken(auction.deposit, decimals)} ${tokenLbl}`}
              </p>
            </div>
          </div>

          {status === 'live' && isOwner && (
            <div className="panel p-5">
              <h2 className="font-display text-lg font-medium text-text">
                You&rsquo;re the auctioneer for this lot
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {auction.bids.length === 1
                  ? '1 sealed bid has arrived so far.'
                  : `${auction.bids.length} sealed bids have arrived so far.`}{' '}
                Each amount stays encrypted to you until you reveal.
              </p>
              <p className="mt-3 text-sm text-faint">
                Reveal &amp; settle unlocks when the auction closes (
                {new Date(auction.endTime * 1000).toLocaleString()}).
              </p>
            </div>
          )}

          {status === 'live' && !isOwner && (
            <div className="panel p-5">
              {decimals == null ? (
                <p className="text-sm text-muted">Reading token info from chain…</p>
              ) : (
                <SealedBidForm
                  auction={auction}
                  decimals={decimals}
                  label={tokenLbl}
                  onSuccess={load}
                />
              )}
            </div>
          )}

          {status === 'ended' && isOwner && (
            <OwnerRevealPanel auction={auction} onSuccess={load} />
          )}

          {status === 'ended' && !isOwner && (
            <div className="panel border-gold/30 bg-gold/5 p-5">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
                </span>
                <span className="eyebrow text-gold">Waiting on the seller</span>
              </div>
              <p className="mt-3 text-sm text-text">
                Bidding has closed. Settlement now depends on the seller: they have to run the
                zero-knowledge proof off-chain and finalize it on-chain.{' '}
                <span className="text-muted">They haven&apos;t done that yet</span> - and there&apos;s
                no fixed deadline for it.
              </p>
              {isBidder ? (
                <p className="mt-2 text-sm text-muted">
                  Your deposit stays locked until they settle. Once they do, the winner pays the
                  second-highest price and everyone else can withdraw their full deposit right here.
                  No bid amounts are revealed - not even the winner&apos;s.
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  When the seller settles, the winner and the second-price they pay will appear here.
                  No bid amounts are revealed - not even the winner&apos;s.
                </p>
              )}
              <p className="mt-3 text-xs text-faint">
                This page checks for settlement automatically - no need to refresh.
              </p>
            </div>
          )}

          {status === 'settled' &&
            (decimals == null ? (
              <p className="text-sm text-muted">Reading token info from chain…</p>
            ) : (
              <SettledPanel
                auction={auction}
                decimals={decimals}
                label={tokenLbl}
                onSuccess={load}
              />
            ))}

          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-lg font-medium text-text">
                Sealed bids
                <span className="font-mono text-sm text-faint">({auction.bids.length})</span>
              </h2>
              {isOwner && auction.bids.length > 0 && amounts == null && (
                <button
                  onClick={decryptBids}
                  disabled={decrypting}
                  className="btn-ghost rounded-lg px-3 py-1.5 text-xs disabled:opacity-50"
                  title="Only the auctioneer can decrypt — sign to reveal amounts privately"
                >
                  {decrypting ? 'Decrypting…' : 'Decrypt bids (auctioneer)'}
                </button>
              )}
              {amounts != null && (
                <span className="eyebrow text-gold">Decrypted · private to you</span>
              )}
              {!isOwner &&
                selfAmount == null &&
                address != null &&
                auction.bids.some((b) => b.bidder === address) && (
                  <button
                    onClick={revealMyBid}
                    disabled={revealing}
                    className="btn-ghost rounded-lg px-3 py-1.5 text-xs disabled:opacity-50"
                    title="Re-derive your bid key and decrypt your own bid"
                  >
                    {revealing ? 'Revealing…' : 'Reveal my bid'}
                  </button>
                )}
            </div>
            <BidList
              bids={auction.bids}
              winner={auction.winner}
              self={address}
              decimals={decimals ?? undefined}
              label={tokenLbl}
              amounts={amounts ?? undefined}
              selfAmount={selfAmount}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
