'use client';

import { useEffect, useState } from 'react';
import { fmtCountdown } from '@/lib/format';

interface Props {
  endTime: number; // unix seconds
  startTime?: number; // unix seconds; defaults to endTime - 1 day window
  size?: number;
  label?: string;
}

// Concentric orbital rings with a glowing node that travels the outer ring
// proportional to elapsed time. Node starts at top (12 o'clock) and completes
// the orbit at the deadline. Center shows remaining time in mono.
export function OrbitCountdown({ endTime, startTime, size = 240, label }: Props) {
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  const start = startTime ?? endTime - 86400;
  const total = Math.max(endTime - start, 1);
  const elapsed = Math.min(Math.max(now - start, 0), total);
  const progress = elapsed / total; // 0..1
  const remaining = Math.max(endTime - now, 0);
  const ended = remaining <= 0;

  const c = size / 2;
  const rOuter = size * 0.42;
  const rMid = size * 0.31;
  const rInner = size * 0.2;

  // Node position: angle from top, clockwise.
  const ang = -Math.PI / 2 + progress * Math.PI * 2;
  const nodeX = c + Math.cos(ang) * rOuter;
  const nodeY = c + Math.sin(ang) * rOuter;

  // Arc from top to current node position (the "consumed" track), drawn gold-ish azure.
  const startX = c;
  const startY = c - rOuter;
  const largeArc = progress > 0.5 ? 1 : 0;
  const arcPath = `M ${startX} ${startY} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${nodeX.toFixed(
    2,
  )} ${nodeY.toFixed(2)}`;

  return (
    <div
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={
          ended ? 'Bidding closed' : `Time remaining: ${fmtCountdown(remaining)}`
        }
      >
        <defs>
          <linearGradient id="oc-track" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--azure)" />
            <stop offset="100%" stopColor="var(--violet)" />
          </linearGradient>
          <radialGradient id="oc-node" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="55%" stopColor="var(--azure)" />
            <stop offset="100%" stopColor="var(--violet)" stopOpacity="0" />
          </radialGradient>
          <filter id="oc-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* Static orbital rings */}
        <circle
          cx={c}
          cy={c}
          r={rOuter}
          fill="none"
          stroke="var(--border)"
          strokeWidth="1.5"
        />
        <ellipse
          cx={c}
          cy={c}
          rx={rMid}
          ry={rMid * 0.62}
          fill="none"
          stroke="var(--border)"
          strokeWidth="1"
          opacity="0.7"
          transform={`rotate(28 ${c} ${c})`}
        />
        <ellipse
          cx={c}
          cy={c}
          rx={rInner}
          ry={rInner * 0.7}
          fill="none"
          stroke="var(--border)"
          strokeWidth="1"
          opacity="0.5"
          transform={`rotate(-34 ${c} ${c})`}
        />

        {/* Consumed arc */}
        {!ended && (
          <path
            d={arcPath}
            fill="none"
            stroke="url(#oc-track)"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.9"
          />
        )}
        {ended && (
          <circle
            cx={c}
            cy={c}
            r={rOuter}
            fill="none"
            stroke="var(--faint)"
            strokeWidth="2.5"
            strokeDasharray="2 6"
          />
        )}

        {/* Traveling node */}
        {!ended && (
          <>
            <circle cx={nodeX} cy={nodeY} r="11" fill="url(#oc-node)" filter="url(#oc-glow)" />
            <circle cx={nodeX} cy={nodeY} r="4" fill="#fff" />
          </>
        )}

        {/* Center core */}
        <circle cx={c} cy={c} r={rInner * 0.34} fill="var(--raised)" stroke="var(--border)" />
      </svg>

      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        {ended ? (
          <span className="font-mono text-sm tracking-wide text-faint">CLOSED</span>
        ) : (
          <div>
            <div className="font-mono text-lg font-medium tabular-nums text-text sm:text-xl">
              {fmtCountdown(remaining)}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-faint">
              {label ?? 'until reveal'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
