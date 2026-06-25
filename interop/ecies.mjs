// Orbid-ECIES v1 - bidder-side encryptor.
//
// MUST match `auction-core::decrypt` byte-for-byte:
//
//   esk          = random secp256k1 scalar
//   EPK          = esk * G                     (compressed, 33 bytes)
//   shared_point = esk * PK_owner              (compressed, 33 bytes)  [getSharedSecret]
//   key          = HKDF-SHA256(EPK || shared_point, info="orbid-ecies-v1") -> 32
//   ct||tag      = AES-256-GCM(key, nonce(12), bid.to_le_bytes()(16))
//   wire         = EPK(33) || nonce(12) || ct||tag(32)
import { secp256k1 } from "@noble/curves/secp256k1";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { gcm } from "@noble/ciphers/aes";
import { concatBytes, utf8ToBytes, randomBytes } from "@noble/hashes/utils";

export const HKDF_INFO = utf8ToBytes("orbid-ecies-v1");

function u128ToLeBytes(value) {
  const out = new Uint8Array(16);
  let x = BigInt(value);
  for (let i = 0; i < 16; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  if (x !== 0n) throw new Error("bid exceeds u128");
  return out;
}

/** Encrypt a u128 bid to the owner's compressed secp256k1 public key (Uint8Array(33)). */
export function encryptBid(ownerPubCompressed, bid) {
  const esk = secp256k1.utils.randomPrivateKey();
  const epk = secp256k1.getPublicKey(esk, true); // 33, compressed
  const shared = secp256k1.getSharedSecret(esk, ownerPubCompressed, true); // 33, compressed point
  const key = hkdf(sha256, concatBytes(epk, shared), undefined, HKDF_INFO, 32);
  const nonce = randomBytes(12);
  const ct = gcm(key, nonce).encrypt(u128ToLeBytes(bid)); // 16 + 16 tag
  return concatBytes(epk, nonce, ct);
}
