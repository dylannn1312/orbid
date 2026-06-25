'use client';

import { useEffect, useState } from 'react';
import { fmtCountdown } from '@/lib/format';

// Compact countdown for cards: a small ring with a node + mono time.
export function MiniOrbit({
  endTime,
  startTime,
}: {
  endTime: number;
  startTime?: number;
}) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  const start = startTime ?? endTime - 86400;
  const total = Math.max(endTime - start, 1);
  const progress = Math.min(Math.max((now - start) / total, 0), 1);
  const remaining = Math.max(endTime - now, 0);
  const size = 26;
  const c = size / 2;
  const r = size * 0.38;
  const ang = -Math.PI / 2 + progress * Math.PI * 2;
  const nx = c + Math.cos(ang) * r;
  const ny = c + Math.sin(ang) * r;

  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeWidth="1.5" />
        <circle cx={nx} cy={ny} r="2.6" fill="var(--azure)" />
      </svg>
      <span className="font-mono text-sm tabular-nums text-muted">
        {fmtCountdown(remaining)}
      </span>
    </span>
  );
}
