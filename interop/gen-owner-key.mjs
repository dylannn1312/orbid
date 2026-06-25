// Persist the auctioneer's secp256k1 keypair (the key bidders encrypt to and the
// prover decrypts with). Idempotent: generated once into ../.owner-key.json
// (gitignored), reused thereafter.
//
//   node gen-owner-key.mjs        -> print {sk, pub} JSON
//   node gen-owner-key.mjs pub    -> print compressed public key hex
//   node gen-owner-key.mjs sk     -> print secret key hex (feed ORBID_OWNER_SK)
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex } from "@noble/hashes/utils";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const path = new URL("../.owner-key.json", import.meta.url);

let data;
if (existsSync(path)) {
  data = JSON.parse(readFileSync(path, "utf8"));
} else {
  const sk = secp256k1.utils.randomPrivateKey();
  const pub = secp256k1.getPublicKey(sk, true);
  data = { sk: bytesToHex(sk), pub: bytesToHex(pub) };
  writeFileSync(path, JSON.stringify(data, null, 2));
}

const which = process.argv[2];
if (which === "pub") process.stdout.write(data.pub);
else if (which === "sk") process.stdout.write(data.sk);
else console.log(JSON.stringify(data, null, 2));
