// Auction vector generator: simulate the owner keypair + several bidders
// encrypting sealed bids, and write the vector the RISC0 host/server feeds into
// the guest, plus the expected Vickrey outcome for assertion.
//
//   node encrypt.mjs 100 70 50   ->  vector.json
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex } from "@noble/hashes/utils";
import { writeFileSync } from "node:fs";
import { encryptBid } from "./ecies.mjs";

const bids = (process.argv.slice(2).length ? process.argv.slice(2) : ["100", "70", "50"]).map(
  BigInt,
);
const auctionId = 1;
const reserve = 10n;
const deposit = 1000n;

const ownerSk = secp256k1.utils.randomPrivateKey();
const ownerPub = secp256k1.getPublicKey(ownerSk, true);
const ciphertexts = bids.map((b) => bytesToHex(encryptBid(ownerPub, b)));

// Expected Vickrey outcome (must match auction-core::run_auction): bids above
// the deposit are unaffordable and ignored.
let bestIdx = -1;
let best = 0n;
let second = 0n;
for (let i = 0; i < bids.length; i++) {
  if (bids[i] > deposit) continue;
  if (bestIdx < 0 || bids[i] > best) {
    second = best;
    best = bids[i];
    bestIdx = i;
  } else if (bids[i] > second) {
    second = bids[i];
  }
}
const secondPrice = second > reserve ? second : reserve;

const out = {
  sk: bytesToHex(ownerSk),
  pub: bytesToHex(ownerPub),
  auction_id: auctionId,
  reserve: reserve.toString(),
  deposit: deposit.toString(),
  ciphertexts,
  bids: bids.map(String),
  expected_winner_index: bestIdx,
  expected_second_price: secondPrice.toString(),
};
writeFileSync(new URL("./vector.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(
  `wrote vector.json: bids=[${bids}] winner_index=${bestIdx} second_price=${secondPrice}`,
);
