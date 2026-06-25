'use client';

import { useCallback, useState } from 'react';
import { useToast } from './Toast';

// Copies a shareable link to this lot so a seller can invite bidders. Orbid
// auctions are public/on-chain, so this is a plain share link — no access
// gating, just a convenient way to point people at the lot.
export function InviteButton({
  auctionId,
  live = true,
  className = '',
}: {
  auctionId: number;
  live?: boolean;
  className?: string;
}) {
  const { push } = useToast();
  const [copied, setCopied] = useState(false);
  const label = live ? 'Invite to bid' : 'Share lot';

  const onClick = useCallback(async () => {
    const url = `${window.location.origin}/auction/${auctionId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      push({
        kind: 'success',
        message: 'Invite link copied — share it to bring bidders to this lot.',
      });
    } catch {
      // Clipboard blocked (e.g. insecure context): surface the link to copy by hand.
      push({ kind: 'info', message: url, href: url, hrefLabel: 'Open lot' });
    }
  }, [auctionId, push]);

  return (
    <button
      onClick={onClick}
      className={`btn-ghost inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${className}`}
      title="Copy a shareable link to this lot"
    >
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 1 0-7-7l-1 1" />
        <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 1 0 7 7l1-1" />
      </svg>
      {copied ? 'Copied' : label}
    </button>
  );
}
