'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStellarWallet } from '@/lib/wallet';
import {
  Auction,
  auctionsBySeller,
  auctionsByBidder,
  queryAuction,
  nftMetadata,
} from '@/lib/orbid';
import { LotCard } from '@/components/LotCard';

interface Lot {
  auction: Auction;
  name: string;
}

async function loadLot(id: number): Promise<Lot> {
  const auction = await queryAuction(id);
  let name = `Lot #${auction.tokenId}`;
  try {
    name = (await nftMetadata(auction.tokenId)).name;
  } catch {
    /* default name */
  }
  return { auction, name };
}

// Listed = lots where you're the auctioneer; Joined = lots you've bid on. The
// ids come from the contract's auctions_by_seller / auctions_by_bidder views,
// so we only fetch your own lots — not the whole catalogue.
export default function MyActivityPage() {
  const { address, isConnected, connect } = useStellarWallet();
  const [listed, setListed] = useState<Lot[]>([]);
  const [joined, setJoined] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setListed([]);
      setJoined([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [sellerIds, bidderIds] = await Promise.all([
          auctionsBySeller(address),
          auctionsByBidder(address),
        ]);
        // A lot you listed and also bid on counts as "listed" only.
        const joinedIds = bidderIds.filter((id) => !sellerIds.includes(id));
        const [listedLots, joinedLots] = await Promise.all([
          Promise.all(sellerIds.map(loadLot)),
          Promise.all(joinedIds.map(loadLot)),
        ]);
        if (!cancelled) {
          setListed(listedLots);
          setJoined(joinedLots);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!isConnected) {
    return (
      <div className="py-16 text-center">
        <p className="eyebrow mb-3">Your activity</p>
        <h1 className="font-display text-3xl font-medium text-text">
          Connect to see your lots
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted">
          Your listed lots and the auctions you&rsquo;ve bid on will show up here.
        </p>
        <button onClick={() => connect()} className="btn-primary mt-6 rounded-lg px-5 py-2.5 text-sm">
          Connect wallet
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <div className="border-b border-border/60 pb-4">
        <p className="eyebrow mb-1.5">Your activity</p>
        <h1 className="font-display text-3xl font-medium text-text">Lots &amp; bids</h1>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-200">
          Could not load your activity: {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[26rem] rounded-2xl border border-border bg-surface"
              style={{ animation: 'pulse-glow 2s ease-in-out infinite' }}
            />
          ))}
        </div>
      ) : (
        <>
          <Section
            eyebrow="As auctioneer"
            title="Listed by you"
            count={listed.length}
            empty={
              <>
                You haven&rsquo;t listed any lots yet.{' '}
                <Link href="/create" className="text-azure hover:underline">
                  List one →
                </Link>
              </>
            }
            lots={listed}
          />
          <Section
            eyebrow="As bidder"
            title="Bids you joined"
            count={joined.length}
            empty={
              <>
                You haven&rsquo;t bid on any lots yet.{' '}
                <Link href="/" className="text-azure hover:underline">
                  Browse lots →
                </Link>
              </>
            }
            lots={joined}
          />
        </>
      )}
    </div>
  );
}

function Section({
  eyebrow,
  title,
  count,
  empty,
  lots,
}: {
  eyebrow: string;
  title: string;
  count: number;
  empty: React.ReactNode;
  lots: Lot[];
}) {
  return (
    <section>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="eyebrow mb-1.5">{eyebrow}</p>
          <h2 className="font-display text-2xl font-medium text-text">{title}</h2>
        </div>
        <span className="font-mono text-sm text-faint">
          {String(count).padStart(2, '0')} {count === 1 ? 'lot' : 'lots'}
        </span>
      </div>
      {lots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center text-sm text-muted">
          {empty}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {lots.map((lot) => (
            <LotCard key={lot.auction.id} auction={lot.auction} name={lot.name} />
          ))}
        </div>
      )}
    </section>
  );
}
