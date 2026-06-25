'use client';

import { useState } from 'react';

// A self-contained month calendar + time selector. Emits a local
// "YYYY-MM-DDTHH:MM" string (same shape as <input type="datetime-local">) so it
// drops in wherever that value was used. No external dependencies.

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');
const toLocal = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;

export function DateTimePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const sel = value ? new Date(value) : null;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const [view, setView] = useState(() => {
    const base = sel ?? today;
    return { y: base.getFullYear(), m: base.getMonth() };
  });

  const hour = sel ? sel.getHours() : 12;
  const minute = sel ? sel.getMinutes() : 0;

  const emit = (y: number, m: number, d: number, h: number, min: number) =>
    onChange(toLocal(new Date(y, m, d, h, min)));

  const pickDay = (d: number) => emit(view.y, view.m, d, hour, minute);
  const changeTime = (h: number, min: number) => {
    const b = sel ?? new Date(view.y, view.m, today.getDate());
    emit(b.getFullYear(), b.getMonth(), b.getDate(), h, min);
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(view.y, view.m + delta, 1);
    setView({ y: next.getFullYear(), m: next.getMonth() });
  };

  // Build the day grid: leading blanks for the first weekday, then the days.
  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isPast = (d: number) => new Date(view.y, view.m, d) < startOfToday;
  const isSelected = (d: number) =>
    sel != null &&
    sel.getFullYear() === view.y &&
    sel.getMonth() === view.m &&
    sel.getDate() === d;
  const isToday = (d: number) =>
    today.getFullYear() === view.y && today.getMonth() === view.m && today.getDate() === d;

  return (
    <div className={`panel p-4 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      {/* Month nav */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted transition hover:border-azure/50 hover:text-text"
        >
          ‹
        </button>
        <span className="font-display text-sm font-medium text-text">
          {MONTHS[view.m]} {view.y}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted transition hover:border-azure/50 hover:text-text"
        >
          ›
        </button>
      </div>

      {/* Weekday header */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center font-mono text-[10px] uppercase tracking-wide text-faint">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d == null) return <div key={`b${i}`} />;
          const past = isPast(d);
          const selected = isSelected(d);
          return (
            <button
              key={d}
              type="button"
              disabled={past}
              aria-pressed={selected}
              aria-label={`${MONTHS[view.m]} ${d}, ${view.y}`}
              onClick={() => pickDay(d)}
              className={[
                'relative grid h-9 place-items-center rounded-lg font-mono text-sm transition',
                selected
                  ? 'bg-gradient-to-br from-azure to-violet font-semibold text-[#07081a]'
                  : past
                    ? 'cursor-not-allowed text-faint/40'
                    : 'text-text hover:bg-azure/10',
              ].join(' ')}
            >
              {d}
              {isToday(d) && !selected && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-gold" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {/* Time selector */}
      <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-3">
        <span className="eyebrow flex-1">Closes at</span>
        <select
          value={hour}
          onChange={(e) => changeTime(Number(e.target.value), minute)}
          className="rounded-lg border border-border bg-bg px-2 py-1.5 font-mono text-sm text-text outline-none focus:border-azure"
          aria-label="Hour"
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {pad(h)}
            </option>
          ))}
        </select>
        <span className="font-mono text-text">:</span>
        <select
          value={minute - (minute % 5)}
          onChange={(e) => changeTime(hour, Number(e.target.value))}
          className="rounded-lg border border-border bg-bg px-2 py-1.5 font-mono text-sm text-text outline-none focus:border-azure"
          aria-label="Minute"
        >
          {Array.from({ length: 12 }, (_, i) => i * 5).map((min) => (
            <option key={min} value={min}>
              {pad(min)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
