import { AuctionStatus } from '@/lib/orbid';

const MAP: Record<AuctionStatus, { label: string; cls: string; dot: string }> = {
  live: {
    label: 'Live',
    cls: 'border-azure/40 text-azure bg-azure/10',
    dot: 'bg-azure',
  },
  ended: {
    label: 'Sealed · Ended',
    cls: 'border-violet/40 text-violet bg-violet/10',
    dot: 'bg-violet',
  },
  settled: {
    label: 'Settled',
    cls: 'border-teal/40 text-teal bg-teal/10',
    dot: 'bg-teal',
  },
};

export function StatusChip({ status }: { status: AuctionStatus }) {
  const m = MAP[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${m.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} aria-hidden />
      {m.label}
    </span>
  );
}
