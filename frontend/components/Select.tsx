'use client';

import { useEffect, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

// A theme-matched dropdown — the native <select> popup can't be styled to fit
// the dark UI, so this renders its own panel. Closes on outside click / Escape.
// Keyboard: Enter/Space/ArrowDown opens; arrows + Home/End move; Enter selects.
export function Select({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // When opening, focus the current option so arrow keys have an anchor.
  useEffect(() => {
    if (!open) return;
    const idx = Math.max(0, options.findIndex((o) => o.value === value));
    setActive(idx);
    itemRefs.current[idx]?.focus();
  }, [open, value, options]);

  function move(delta: number) {
    setActive((i) => {
      const next = (i + delta + options.length) % options.length;
      itemRefs.current[next]?.focus();
      return next;
    });
  }

  function jump(to: number) {
    setActive(to);
    itemRefs.current[to]?.focus();
  }

  function onTriggerKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKey(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        e.preventDefault();
        jump(0);
        break;
      case 'End':
        e.preventDefault();
        jump(options.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  }

  function select(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-text transition hover:border-azure/50"
      >
        {current?.label ?? 'Select'}
        <svg
          width="11"
          height="11"
          viewBox="0 0 12 12"
          aria-hidden
          className={`text-faint transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={onListKey}
          className="panel absolute right-0 z-30 mt-1 min-w-[11rem] overflow-hidden p-1"
        >
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <li key={o.value}>
                <button
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={i === active ? 0 : -1}
                  onClick={() => select(o.value)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm transition ${
                    selected ? 'bg-azure/15 text-azure' : 'text-muted hover:bg-azure/10 hover:text-text'
                  }`}
                >
                  {o.label}
                  {selected && <span aria-hidden>✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
