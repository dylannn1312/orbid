// RISC0 word-serde for the Orbid guest: builds the guest input stream the
// general prover feeds verbatim, and decodes the committed journal.
//
// Mirrors risc0-zkvm-3.0.5/src/serde/serializer.rs exactly:
//   - stream of u32 words, emitted little-endian.
//   - u8/u16/u32 -> 1 word.  u64 -> 2 words (lo, hi).  u128 -> 4 words (LE).
//   - Vec<u8> serializes as a *seq* (not bytes): len word + one word per byte.
//
// AuctionInput { sk: Vec<u8>, auction_id: u64, ciphertexts: Vec<Vec<u8>>,
//                reserve: u128, deposit: u128 }.

class WordWriter {
  private words: number[] = [];

  u32(v: number) {
    this.words.push(v >>> 0);
  }

  u64(v: bigint) {
    this.u32(Number(v & 0xffffffffn));
    this.u32(Number((v >> 32n) & 0xffffffffn));
  }

  // u128 == write_padded_bytes(v.to_le_bytes()) == 4 LE words.
  u128(v: bigint) {
    for (let i = 0; i < 4; i++) {
      this.u32(Number((v >> BigInt(32 * i)) & 0xffffffffn));
    }
  }

  // Vec<u8> as a serde seq: length word, then one word per byte.
  bytesSeq(b: Uint8Array) {
    this.u32(b.length);
    for (const byte of b) this.u32(byte);
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(this.words.length * 4);
    const dv = new DataView(out.buffer);
    this.words.forEach((w, i) => dv.setUint32(i * 4, w, true));
    return out;
  }
}

export interface AuctionInput {
  sk: Uint8Array; // owner secp256k1 secret, 32 bytes
  auctionId: number;
  ciphertexts: Uint8Array[]; // on-chain order
  reserve: bigint;
  deposit: bigint;
}

/** Serialize an AuctionInput to the RISC0 input stream (LE word bytes). */
export function serializeAuctionInput(input: AuctionInput): Uint8Array {
  const w = new WordWriter();
  w.bytesSeq(input.sk);
  w.u64(BigInt(input.auctionId));
  w.u32(input.ciphertexts.length);
  for (const ct of input.ciphertexts) w.bytesSeq(ct);
  w.u128(input.reserve);
  w.u128(input.deposit);
  return w.toBytes();
}

/** Logical journal byte length: auction_hash(32) + index(4) + price(16). */
const JOURNAL_LEN = 52;

/**
 * Decode the raw journal the guest committed. `env::commit(&Vec<u8>)` emits a
 * length word (52) followed by 52 word-padded bytes ([b,0,0,0]); we recover the
 * logical bytes and read winner_index + second_price.
 */
export function parseJournal(raw: Uint8Array): {
  winnerIndex: number;
  secondPrice: bigint;
} {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const len = dv.getUint32(0, true);
  if (len !== JOURNAL_LEN) {
    throw new Error(`unexpected journal length word ${len} (expected ${JOURNAL_LEN})`);
  }
  if (raw.length < 4 + JOURNAL_LEN * 4) {
    throw new Error(`journal too short: ${raw.length} bytes`);
  }
  // byte[0] of each word after the length word == the logical byte.
  const logical = new Uint8Array(JOURNAL_LEN);
  for (let i = 0; i < JOURNAL_LEN; i++) logical[i] = raw[4 + i * 4];

  const ldv = new DataView(logical.buffer);
  const winnerIndex = ldv.getUint32(32, true);
  let secondPrice = 0n;
  for (let i = 0; i < 16; i++) {
    secondPrice |= BigInt(logical[36 + i]) << BigInt(8 * i);
  }
  return { winnerIndex, secondPrice };
}
