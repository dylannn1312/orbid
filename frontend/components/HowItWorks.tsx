// The settlement pipeline as a real sequence: Seal → Close → Prove. Tone
// progresses azure → violet → gold so the eye travels toward the gold
// "proof-star" payoff that the hero signature also uses. Numbering is honest
// here - these steps are strictly ordered.

type Tone = 'azure' | 'violet' | 'gold';

interface Step {
  n: string;
  title: string;
  body: string;
  tone: Tone;
  glyph: React.ReactNode;
}

const TONES: Record<Tone, { node: string; text: string; ghost: string; hover: string }> = {
  azure: {
    node: 'border-azure/40 bg-azure/10 text-azure',
    text: 'text-azure',
    ghost: 'text-azure/20',
    hover: 'hover:border-azure/50 hover:shadow-glow',
  },
  violet: {
    node: 'border-violet/40 bg-violet/10 text-violet',
    text: 'text-violet',
    ghost: 'text-violet/20',
    hover: 'hover:border-violet/50 hover:shadow-glow-violet',
  },
  gold: {
    node: 'border-gold/40 bg-gold/10 text-gold',
    text: 'text-gold',
    ghost: 'text-gold/25',
    hover: 'hover:border-gold/50 hover:shadow-gold',
  },
};

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const STEPS: Step[] = [
  {
    n: '01',
    title: 'Seal',
    tone: 'azure',
    body: 'Bidders encrypt a bid to the auctioneer’s per-lot key and escrow a deposit on-chain. Amounts never leave the browser in the clear.',
    glyph: (
      <svg viewBox="0 0 24 24" width="20" height="20" {...stroke}>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        <circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    n: '02',
    title: 'Close',
    tone: 'violet',
    body: 'When the orbit completes, bidding locks. The auctioneer decrypts privately - but cannot yet touch the settlement.',
    glyph: (
      <svg viewBox="0 0 24 24" width="20" height="20" {...stroke}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    ),
  },
  {
    n: '03',
    title: 'Prove',
    tone: 'gold',
    body: 'A RISC0 proof forces the correct winner and second price over exactly the sealed bids. The chain verifies it natively - only the price is revealed.',
    glyph: (
      <svg viewBox="0 0 24 24" width="20" height="20" {...stroke}>
        <path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
];

function Chevron() {
  return (
    <span
      aria-hidden
      className="absolute -left-[1.35rem] top-[2.4rem] hidden text-faint sm:block"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" {...stroke}>
        <path d="M9 6l6 6-6 6" />
      </svg>
    </span>
  );
}

export function HowItWorks() {
  return (
    <section className="mb-16">
      <div className="mb-6 flex items-end justify-between border-b border-border/60 pb-4">
        <div>
          <p className="eyebrow mb-1.5">How settlement works</p>
          <h2 className="font-display text-2xl font-medium text-text">Seal · Close · Prove</h2>
        </div>
        <span className="hidden font-mono text-sm text-faint sm:block">
          trustless in 3 steps
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s, i) => {
          const t = TONES[s.tone];
          return (
            <div
              key={s.n}
              className={`panel group relative p-6 transition duration-300 hover:-translate-y-1 ${t.hover}`}
            >
              {i > 0 && <Chevron />}
              <div className="flex items-start justify-between">
                <span
                  className={`grid h-11 w-11 place-items-center rounded-full border ${t.node}`}
                >
                  {s.glyph}
                </span>
                <span
                  className={`font-mono text-3xl font-medium leading-none ${t.ghost}`}
                >
                  {s.n}
                </span>
              </div>
              <h3 className="mt-5 flex items-baseline gap-2 font-display text-xl font-medium text-text">
                {s.title}
                <span className={`eyebrow ${t.text}`}>Step {s.n}</span>
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
