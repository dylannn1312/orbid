import { secp256k1 } from '@noble/curves/secp256k1';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { gcm } from '@noble/ciphers/aes';
import {
  concatBytes,
  utf8ToBytes,
  randomBytes,
  hexToBytes,
  bytesToHex,
} from '@noble/hashes/utils';

const HKDF_INFO = utf8ToBytes('orbid-ecies-v1');

function u128le(v: bigint): Uint8Array {
  const o = new Uint8Array(16);
  let x = v;
  for (let i = 0; i < 16; i++) {
    o[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  if (x !== 0n) throw new Error('bid exceeds u128');
  return o;
}

function u128FromLe(b: Uint8Array): bigint {
  let x = 0n;
  for (let i = 15; i >= 0; i--) x = (x << 8n) | BigInt(b[i]);
  return x;
}

// ownerPubHex = compressed secp256k1 pubkey (66 hex chars).
// eskHex = the bidder's ephemeral secret (deterministic, from a wallet
// signature) so the bidder can re-derive it and decrypt their own bid later.
// Returns wire bytes EPK(33)||nonce(12)||ct+tag(32).
export function encryptBid(ownerPubHex: string, bid: bigint, eskHex: string): Uint8Array {
  const ownerPub = hexToBytes(ownerPubHex.replace(/^0x/, ''));
  const esk = hexToBytes(eskHex.replace(/^0x/, ''));
  const epk = secp256k1.getPublicKey(esk, true);
  const shared = secp256k1.getSharedSecret(esk, ownerPub, true);
  const key = hkdf(sha256, concatBytes(epk, shared), undefined, HKDF_INFO, 32);
  const nonce = randomBytes(12);
  const ct = gcm(key, nonce).encrypt(u128le(bid));
  return concatBytes(epk, nonce, ct);
}

// Bidder-side: recover your OWN bid using your ephemeral secret. ECIES is
// symmetric in the shared secret (esk·ownerPub == ownerSk·epk), so the sender
// can decrypt what they sent. Requires re-deriving eskHex from the same wallet
// signature used at bid time.
export function decryptOwnBid(eskHex: string, ownerPubHex: string, wire: Uint8Array): bigint {
  const ownerPub = hexToBytes(ownerPubHex.replace(/^0x/, ''));
  const esk = hexToBytes(eskHex.replace(/^0x/, ''));
  const epk = wire.slice(0, 33);
  const nonce = wire.slice(33, 45);
  const ct = wire.slice(45);
  const shared = secp256k1.getSharedSecret(esk, ownerPub, true);
  const key = hkdf(sha256, concatBytes(epk, shared), undefined, HKDF_INFO, 32);
  return u128FromLe(gcm(key, nonce).decrypt(ct));
}

// Owner-side: recover a bid from its ciphertext using the per-auction secret
// key. ECDH is symmetric, so this mirrors encryptBid exactly. Only the
// auctioneer holds the key — bidders cannot decrypt anyone's bid, not even
// their own.
export function decryptBid(ownerSkHex: string, wire: Uint8Array): bigint {
  const sk = hexToBytes(ownerSkHex.replace(/^0x/, ''));
  const epk = wire.slice(0, 33);
  const nonce = wire.slice(33, 45);
  const ct = wire.slice(45);
  const shared = secp256k1.getSharedSecret(sk, epk, true);
  const key = hkdf(sha256, concatBytes(epk, shared), undefined, HKDF_INFO, 32);
  const pt = gcm(key, nonce).decrypt(ct);
  return u128FromLe(pt);
}

export { bytesToHex, hexToBytes };
