'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Auction, auctionCount, queryAuction, nftMetadata } from '@/lib/orbid';
import { LotCard } from '@/components/LotCard';
import { HeroOrbit } from '@/components/HeroOrbit';
import { HowItWorks } from '@/components/HowItWorks';

interface Lot {
  auction: Auction;
  name: string;
}

export default function GalleryPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const count = await auctionCount();
        const ids = Array.from({ length: count }, (_, i) => i + 1);
        const result = await Promise.all(
          ids.map(async (id) => {
            const auction = await queryAuction(id);
            let name = `Lot #${auction.tokenId}`;
            try {
              name = (await nftMetadata(auction.tokenId)).name;
            } catch {
              /* fall back to default name */
            }
            return { auction, name };
          }),
        );
        if (!cancelled) setLots(result);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <section className="grid items-center gap-8 py-8 sm:py-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6">
        <div className="order-2 lg:order-1">
          <p className="eyebrow mb-5 inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-gold shadow-gold" aria-hidden />
            Vickrey · sealed-bid · on Stellar
          </p>
          <h1 className="font-display text-[2.6rem] font-medium leading-[1.04] tracking-[-0.02em] text-text sm:text-6xl">
            Sealed bids,
            <br />
            settled by <span className="text-gradient italic">proof</span>
            <br />
            <span className="text-faint">- </span>not trust.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted sm:text-lg">
            Encrypt your bid to the auctioneer and lock a deposit. When the orbit closes, a
            zero-knowledge proof reveals only the winning price - the second-highest bid.
            Every amount stays sealed forever.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#lots" className="btn-primary rounded-lg px-5 py-2.5 text-sm">
              Browse the lots
            </a>
            <Link href="/create" className="btn-ghost rounded-lg px-5 py-2.5 text-sm">
              List a lot
            </Link>
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <HeroOrbit />
        </div>
      </section>

      <HowItWorks />

      <section id="lots" className="scroll-mt-24">
        <div className="mb-6 flex items-end justify-between border-b border-border/60 pb-4">
          <div>
            <p className="eyebrow mb-1.5">The catalogue</p>
            <h2 className="font-display text-2xl font-medium text-text">Lots in orbit</h2>
          </div>
          {!loading && !error && (
            <span className="font-mono text-sm text-faint">
              {String(lots.length).padStart(2, '0')} {lots.length === 1 ? 'lot' : 'lots'}
            </span>
          )}
        </div>

        {loading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[26rem] animate-pulse rounded-2xl border border-border bg-surface"
                style={{ animation: 'pulse-glow 2s ease-in-out infinite' }}
              />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-200">
            Could not load auctions from the contract: {error}
          </div>
        )}

        {!loading && !error && lots.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">
            No lots have been listed yet. Check back when the observatory opens its next
            auction.
          </div>
        )}

        {!loading && !error && lots.length > 0 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {lots.map((lot) => (
              <LotCard key={lot.auction.id} auction={lot.auction} name={lot.name} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
