'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Auction, auctionStatus } from '@/lib/orbid';
import { lotArtDataUri } from '@/lib/art';
import { fmtToken } from '@/lib/format';
import { tokenDecimals, tokenLabel } from '@/lib/tokens';
import { StatusChip } from './StatusChip';
import { MiniOrbit } from './MiniOrbit';

export function LotCard({
  auction,
  name,
  you,
}: {
  auction: Auction;
  name: string;
  you?: string | null; // viewer address, to flag your win/loss
}) {
  const status = auctionStatus(auction);
  const settled = status === 'settled';
  const youBid = you != null && auction.bids.some((b) => b.bidder === you);
  const youWon = youBid && auction.winner === you;
  const art = lotArtDataUri(auction.tokenId, 320);
  const label = tokenLabel(auction.paymentToken);
  const [decimals, setDecimals] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    tokenDecimals(auction.paymentToken)
      .then((d) => {
        if (!cancelled) setDecimals(d);
      })
      .catch(() => {
        if (!cancelled) setDecimals(null);
      });
    return () => {
      cancelled = true;
    };
  }, [auction.paymentToken]);

  return (
    <Link
      href={`/auction/${auction.id}`}
      className="panel group block overflow-hidden transition duration-300 hover:-translate-y-1 hover:border-azure/50 hover:shadow-glow focus-visible:border-azure"
    >
      <div className="relative aspect-square overflow-hidden rounded-t-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={art}
          alt={`Procedural lot art for ${name}`}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]"
        />
        <div className="absolute left-3 top-3">
          <StatusChip status={status} />
        </div>
        <span className="absolute right-3 top-3 rounded-full bg-bg/70 px-2 py-0.5 font-mono text-[10px] text-muted backdrop-blur">
          Lot #{auction.id}
        </span>
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-bg-2 via-bg-2/70 to-transparent" />
        <div className="absolute inset-x-4 bottom-3 flex items-center justify-between text-sm">
          {settled ? (
            youBid ? (
              <span
                className={`inline-flex items-center gap-1.5 font-mono text-xs ${youWon ? 'text-gold' : 'text-faint'}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${youWon ? 'bg-gold' : 'bg-faint'}`}
                  aria-hidden
                />
                {youWon ? 'You won' : 'Outbid'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-teal">
                <span className="h-1.5 w-1.5 rounded-full bg-teal" aria-hidden /> Settled
              </span>
            )
          ) : (
            <MiniOrbit endTime={auction.endTime} />
          )}
          <span className="font-mono text-xs text-muted">
            {auction.bids.length} sealed
          </span>
        </div>
      </div>

      <div className="flex items-end justify-between gap-2 p-4">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-medium leading-tight text-text">
            {name}
          </h3>
          <p className="eyebrow mt-1.5">{settled ? 'Sold for' : 'Reserve'}</p>
        </div>
        <span className="flex-none font-mono text-base text-gold-gradient">
          {decimals == null
            ? '…'
            : `${fmtToken(settled ? auction.secondPrice : auction.reserve, decimals)} ${label}`}
        </span>
      </div>
    </Link>
  );
}
