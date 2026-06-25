'use client';

import { useState } from 'react';

// A teaching widget, not a live proof: it shows *why* the auctioneer can't
// cheat. finalize() binds (auction_hash, winner_index, second_price) into the
// proof journal, and the contract recomputes auction_hash from its own stored
// bids. Tamper with any input and the journal the contract rebuilds no longer
// matches the one the proof attests to - verification reverts.

type Key = 'honest' | 'drop' | 'winner' | 'price';

interface Scenario {
  key: Key;
  tab: string;
  // journal fields as the contract rebuilds them; `bad` flags the diverging one
  fields: { label: string; value: string; bad?: boolean }[];
  accepted: boolean;
  reason: string;
}

const HASH = '0x9f3a…c41e';
const HASH_BAD = '0x2b07…81da';

const SCENARIOS: Scenario[] = [
  {
    key: 'honest',
    tab: 'Honest settlement',
    fields: [
      { label: 'auction_hash (recomputed on-chain)', value: HASH },
      { label: 'winner_index', value: '0' },
      { label: 'second_price', value: '70 USDC' },
    ],
    accepted: true,
    reason:
      'The journal the contract rebuilds matches the one the proof attests to. The BN254 pairing check passes and the lot settles.',
  },
  {
    key: 'drop',
    tab: 'Drop a losing bid',
    fields: [
      { label: 'auction_hash (recomputed on-chain)', value: HASH_BAD, bad: true },
      { label: 'winner_index', value: '0' },
      { label: 'second_price', value: '70 USDC' },
    ],
    accepted: false,
    reason:
      'The contract hashes every bid it stored, not the subset the auctioneer proved over. One missing bid → a different auction_hash → the proof no longer matches.',
  },
  {
    key: 'winner',
    tab: 'Crown the wrong winner',
    fields: [
      { label: 'auction_hash (recomputed on-chain)', value: HASH },
      { label: 'winner_index', value: '2', bad: true },
      { label: 'second_price', value: '70 USDC' },
    ],
    accepted: false,
    reason:
      'winner_index is bound into the journal. Swap it and the journal digest changes - the proof was built for index 0, so verification reverts. The winner address is read from bids[winner_index], never trusted from the auctioneer.',
  },
  {
    key: 'price',
    tab: 'Fake the price',
    fields: [
      { label: 'auction_hash (recomputed on-chain)', value: HASH },
      { label: 'winner_index', value: '0' },
      { label: 'second_price', value: '40 USDC', bad: true },
    ],
    accepted: false,
    reason:
      'second_price is bound into the journal too. Quote a lower price to overcharge or undercharge and the digest stops matching the proof. The price is provably the true second-highest bid.',
  },
];

export function TamperProof() {
  const [active, setActive] = useState<Key>('honest');
  const s = SCENARIOS.find((x) => x.key === active)!;

  return (
    <section className="mb-16">
      <div className="mb-6 flex items-end justify-between border-b border-border/60 pb-4">
        <div>
          <p className="eyebrow mb-1.5">Why you don&rsquo;t trust the auctioneer</p>
          <h2 className="font-display text-2xl font-medium text-text">
            Try to rig the outcome
          </h2>
        </div>
        <span className="hidden font-mono text-sm text-faint sm:block">
          the proof catches all of it
        </span>
      </div>

      <div className="panel p-5 sm:p-6">
        {/* Scenario picker */}
        <div
          role="tablist"
          aria-label="Tampering scenarios"
          className="mb-5 flex flex-wrap gap-2"
        >
          {SCENARIOS.map((sc) => {
            const on = sc.key === active;
            const cheat = sc.key !== 'honest';
            return (
              <button
                key={sc.key}
                role="tab"
                type="button"
                aria-selected={on}
                onClick={() => setActive(sc.key)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  on
                    ? cheat
                      ? 'border-rose-400/50 bg-rose-500/10 text-rose-200'
                      : 'border-teal/50 bg-teal/10 text-teal'
                    : 'border-border text-muted hover:border-azure/40 hover:text-text'
                }`}
              >
                {sc.tab}
              </button>
            );
          })}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          {/* The journal the contract rebuilds */}
          <div className="rounded-xl border border-border bg-bg/40 p-4">
            <p className="eyebrow mb-3">Journal rebuilt by the contract</p>
            <dl className="space-y-2 font-mono text-sm">
              {s.fields.map((f) => (
                <div
                  key={f.label}
                  className={`flex flex-col gap-0.5 rounded-md px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${
                    f.bad ? 'bg-rose-500/10 ring-1 ring-rose-400/40' : ''
                  }`}
                >
                  <dt className="text-xs text-faint">{f.label}</dt>
                  <dd className={f.bad ? 'text-rose-300' : 'text-text'}>
                    {f.value}
                    {f.bad && <span className="ml-2 text-xs text-rose-400">tampered</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* The verdict */}
          <div
            className={`flex flex-col justify-center rounded-xl border p-4 ${
              s.accepted
                ? 'border-teal/40 bg-teal/5'
                : 'border-rose-400/40 bg-rose-500/5'
            }`}
          >
            <p
              className={`flex items-center gap-2 font-display text-lg font-medium ${
                s.accepted ? 'text-teal' : 'text-rose-300'
              }`}
            >
              <span aria-hidden>{s.accepted ? '✓' : '✗'}</span>
              {s.accepted ? 'Proof accepted · lot settles' : 'Proof rejected · transaction reverts'}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.reason}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
