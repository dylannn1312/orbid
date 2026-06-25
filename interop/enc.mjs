// Encrypt one bid to a given compressed secp256k1 pubkey; print ciphertext hex.
//   node enc.mjs <ownerPubHex> <amount>
import { encryptBid } from "./ecies.mjs";
import { bytesToHex } from "@noble/hashes/utils";

const [, , pub, amount] = process.argv;
process.stdout.write(bytesToHex(encryptBid(pub, BigInt(amount))));
