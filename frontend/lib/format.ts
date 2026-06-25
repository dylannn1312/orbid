// Money is stored and operated on as integer base units (no floats); only at
// the UI edge is it converted to/from a human decimal string, scaled by the
// token's own decimals. The token's decimals are read from chain (see
// lib/tokens.ts), never assumed.
//
// USDC defaults: used only as a fallback for the wallet balance chip before the
// USDC token's on-chain decimals are known.
export const USDC_DECIMALS = 7;
export const USDC_SCALE = 10_000_000n; // 1e7

// Parse a human-entered decimal string into integer base units for a token with
// `decimals` decimals, with no float arithmetic. Throws on empty / negative /
// non-numeric input. With decimals=7: "100" -> 1000000000n, "0.0000001" -> 1n.
export function toBaseUnits(human: string, decimals: number): bigint {
  const trimmed = human.trim();
  if (trimmed === '') throw new Error('Amount is empty.');
  if (trimmed.startsWith('-')) throw new Error('Amount must not be negative.');
  if (!/^\d*\.?\d*$/.test(trimmed) || !/\d/.test(trimmed)) {
    throw new Error(`Invalid amount: "${human}".`);
  }
  const [intPart = '', fracPart = ''] = trimmed.split('.');
  const intDigits = intPart === '' ? '0' : intPart;
  const fracPadded = fracPart.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(intDigits + fracPadded);
}

// Render integer base units as a human decimal string for a token with
// `decimals` decimals: integer part with thousands separators, fractional part
// with trailing zeros trimmed (dot omitted when the fraction is zero).
export function fromBaseUnits(raw: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const intUnits = abs / scale;
  const fracUnits = abs % scale;
  const intStr = intUnits.toLocaleString('en-US');
  const fracStr = fracUnits.toString().padStart(decimals, '0').replace(/0+$/, '');
  const body = fracStr === '' ? intStr : `${intStr}.${fracStr}`;
  return neg ? `-${body}` : body;
}

// Format raw base units of a token with known `decimals` for display.
export function fmtToken(raw: bigint, decimals: number): string {
  return fromBaseUnits(raw, decimals);
}

export function shortAddr(addr: string | null, head = 4, tail = 4): string {
  if (!addr) return '-';
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

// A faint deterministic "fingerprint" of a ciphertext for the sealed capsule.
export function ciphertextFingerprint(ct: Uint8Array, len = 18): string {
  let s = '';
  const hexd = '0123456789abcdef';
  for (let i = 0; i < len; i++) {
    const b = ct[(i * 7 + 3) % Math.max(ct.length, 1)] ?? 0;
    s += hexd[(b ^ (i * 31)) & 0x0f];
  }
  return s;
}

export function fmtCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return '00:00:00';
  const s = Math.floor(secondsLeft);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export const explorerTx = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;
