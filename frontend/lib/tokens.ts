// Per-auction payment tokens. Labels are fixed from config (the XLM SAC's
// on-chain symbol() returns "native" - we ignore that and label it "XLM").
// Decimals are NEVER hardcoded: they are read from each token contract on-chain
// and memoized per address.
import { readContract } from './soroban';
import { shortAddr } from './format';

export interface Token {
  label: string;
  address: string;
}

const USDC = process.env.NEXT_PUBLIC_USDC_CONTRACT!;
const USDT = process.env.NEXT_PUBLIC_USDT_CONTRACT!;
const XLM = process.env.NEXT_PUBLIC_XLM_CONTRACT!;

// USDC first → the default selection.
export const TOKENS: Token[] = [
  { label: 'USDC', address: USDC },
  { label: 'USDT', address: USDT },
  { label: 'XLM', address: XLM },
];

// Reverse lookup label by address; fall back to a shortened address.
export function tokenLabel(address: string): string {
  const t = TOKENS.find((x) => x.address === address);
  return t ? t.label : shortAddr(address);
}

// Read a token contract's decimals on-chain, memoized per address.
const decimalsCache = new Map<string, Promise<number>>();

export function tokenDecimals(address: string): Promise<number> {
  let p = decimalsCache.get(address);
  if (!p) {
    p = (async () => {
      const raw = (await readContract(address, 'decimals')) as number | bigint | null;
      if (raw == null) throw new Error(`Token ${address} has no decimals().`);
      return Number(raw);
    })().catch((e) => {
      // Don't cache failures - allow a later retry.
      decimalsCache.delete(address);
      throw e;
    });
    decimalsCache.set(address, p);
  }
  return p;
}
