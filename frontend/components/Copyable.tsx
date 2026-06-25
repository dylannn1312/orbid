'use client';

import { useState } from 'react';

function CopyGlyph({ done }: { done: boolean }) {
  return done ? (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 10.5A1 1 0 0 1 2.5 9.5v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/**
 * Click-to-copy wrapper for addresses / hashes. Shows `display` (e.g. a
 * truncated address) but copies the full `value`. `stopPropagation` so it works
 * inside cards/links without triggering their navigation.
 */
export function Copyable({
  value,
  display,
  className,
}: {
  value: string;
  display?: string; // shown text; omit for an icon-only button
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const iconOnly = display === undefined;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          })
          .catch(() => {});
      }}
      title={copied ? 'Copied' : `Copy ${value}`}
      className={`group/cp inline-flex max-w-full items-center gap-1.5 transition-colors hover:text-azure ${className ?? ''}`}
    >
      {!iconOnly && <span className="truncate">{display}</span>}
      <span
        aria-hidden
        className={`flex-none transition-opacity ${
          copied || iconOnly ? 'opacity-100 text-azure' : 'opacity-0 group-hover/cp:opacity-100'
        }`}
      >
        <CopyGlyph done={copied} />
      </span>
      <span className="sr-only">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
