'use client';

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  href?: string;
  hrefLabel?: string;
}

interface ToastInput {
  kind: ToastKind;
  message: string;
  href?: string;
  hrefLabel?: string;
}

interface ToastContextValue {
  push: (t: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { ...t, id }]);
      const ttl = t.kind === 'error' ? 9000 : 6000;
      setTimeout(() => remove(id), ttl);
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl border bg-raised/95 px-4 py-3 shadow-glow backdrop-blur ${
              t.kind === 'success'
                ? 'border-teal/40'
                : t.kind === 'error'
                  ? 'border-rose-500/40'
                  : 'border-border'
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={`mt-1 h-2 w-2 flex-none rounded-full ${
                  t.kind === 'success'
                    ? 'bg-teal'
                    : t.kind === 'error'
                      ? 'bg-rose-400'
                      : 'bg-azure'
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm text-text">{t.message}</p>
                {t.href && (
                  <a
                    href={t.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block font-mono text-xs text-azure underline-offset-2 hover:underline focus-visible:underline"
                  >
                    {t.hrefLabel ?? 'View'} ↗
                  </a>
                )}
              </div>
              <button
                onClick={() => remove(t.id)}
                aria-label="Dismiss notification"
                className="flex-none rounded text-faint transition hover:text-text focus-visible:text-text"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// Silence unused import lint in some configs.
export type { ToastKind };
