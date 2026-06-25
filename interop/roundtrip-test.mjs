// End-to-end test of the GENERAL prover, exactly as the frontend now calls it:
// build a RISC0 input stream + ship the bundled ELF, decode the journal locally.
import { readFileSync } from "node:fs";
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex } from "@noble/hashes/utils";
import { encryptBid } from "./ecies.mjs";

const PROVER = "http://37.27.143.93:1204";
const EXPECT_IMAGE_ID =
  "58b91ededee17da7bf5b347fa0f5014c72d6b69d38d1331421e5f7292cb6a3c0";

// --- mirror of frontend/lib/risc0.ts (verified byte-identical to Rust to_vec) ---
class WordWriter {
  words = [];
  u32(v) { this.words.push(v >>> 0); }
  u64(v) { this.u32(Number(v & 0xffffffffn)); this.u32(Number((v >> 32n) & 0xffffffffn)); }
  u128(v) { for (let i = 0; i < 4; i++) this.u32(Number((v >> BigInt(32 * i)) & 0xffffffffn)); }
  bytesSeq(b) { this.u32(b.length); for (const x of b) this.u32(x); }
  toBytes() {
    const o = new Uint8Array(this.words.length * 4);
    const d = new DataView(o.buffer);
    this.words.forEach((w, i) => d.setUint32(i * 4, w, true));
    return o;
  }
}
function serializeAuctionInput({ sk, auctionId, ciphertexts, reserve, deposit }) {
  const w = new WordWriter();
  w.bytesSeq(sk);
  w.u64(BigInt(auctionId));
  w.u32(ciphertexts.length);
  for (const c of ciphertexts) w.bytesSeq(c);
  w.u128(reserve);
  w.u128(deposit);
  return w.toBytes();
}
function parseJournal(raw) {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (dv.getUint32(0, true) !== 52) throw new Error("bad journal length word");
  const logical = new Uint8Array(52);
  for (let i = 0; i < 52; i++) logical[i] = raw[4 + i * 4];
  const ldv = new DataView(logical.buffer);
  const winnerIndex = ldv.getUint32(32, true);
  let secondPrice = 0n;
  for (let i = 0; i < 16; i++) secondPrice |= BigInt(logical[36 + i]) << BigInt(8 * i);
  return { winnerIndex, secondPrice };
}
const hexToBytes = (h) => Uint8Array.from(h.match(/../g).map((b) => parseInt(b, 16)));

// --- build a real auction: 3 sealed bids to a fresh per-auction key ---
const sk = secp256k1.utils.randomPrivateKey();
const pub = bytesToHex(secp256k1.getPublicKey(sk, true));
const bids = [100n, 70n, 50n]; // winner=idx0 (100), second_price=70
const ciphertexts = bids.map((b) => encryptBid(pub, b));

const input = serializeAuctionInput({
  sk,
  auctionId: 42,
  ciphertexts,
  reserve: 10n,
  deposit: 1000n,
});
const elf = readFileSync(new URL("../frontend/public/orbid-guest.bin", import.meta.url));

console.log(`POST ${PROVER}/api/v1/generate-proof  (elf ${elf.length}B, input ${input.length}B)...`);
const t0 = Date.now();
const res = await fetch(`${PROVER}/api/v1/generate-proof`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    elf: Buffer.from(elf).toString("base64"),
    input: Buffer.from(input).toString("base64"),
    receipt_kind: "groth16",
  }),
});
if (!res.ok) throw new Error(`prover ${res.status}: ${await res.text()}`);
const { seal, journal, image_id } = await res.json();
const { winnerIndex, secondPrice } = parseJournal(hexToBytes(journal));
const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\n  took            ${secs}s`);
console.log(`  image_id        ${image_id}`);
console.log(`  winner_index    ${winnerIndex}`);
console.log(`  second_price    ${secondPrice}`);
console.log(`  seal            ${seal.length / 2} bytes`);

const ok =
  image_id === EXPECT_IMAGE_ID && winnerIndex === 0 && secondPrice === 70n && seal.length > 0;
console.log(`\n${ok ? "PASS" : "FAIL"}: image_id match=${image_id === EXPECT_IMAGE_ID}, winner=${winnerIndex === 0}, price=${secondPrice === 70n}`);
process.exit(ok ? 0 : 1);
