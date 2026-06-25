import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToNumberBE, numberToBytesBE } from '@noble/curves/abstract/utils';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

// Each auction has its own secp256k1 keypair derived deterministically from a
// wallet signature, so nothing is ever stored. The same wallet re-derives the
// identical key at reveal because Stellar's signMessage is ed25519 (a stable
// input yields a stable signature).

export function auctionKeyMessage(nftContract: string, tokenId: number): string {
  return `orbid-key:v1:${nftContract}:${tokenId}`;
}

// The bidder's ECIES ephemeral key is derived the same deterministic way, from
// a distinct message. Because ECIES lets the sender re-derive the shared secret
// (esk · ownerPub), this lets a bidder decrypt their OWN bid later — without
// ever storing anything. Other bidders' bids stay sealed to them.
export function bidKeyMessage(nftContract: string, tokenId: number): string {
  return `orbid-bid:v1:${nftContract}:${tokenId}`;
}

export interface AuctionKey {
  skHex: string; // 32-byte private scalar, hex
  pubHex: string; // 33-byte compressed public key, hex
}

type SignMessage = (message: string) => Promise<Uint8Array>;

async function deriveKeyFromMessage(
  signMessage: SignMessage,
  message: string,
): Promise<AuctionKey> {
  const sigBytes = await signMessage(message);
  const seed = sha256(sigBytes);
  // Reduce the seed into a valid secp256k1 scalar in [1, n-1].
  const n = secp256k1.CURVE.n;
  const priv = (bytesToNumberBE(seed) % (n - 1n)) + 1n;
  const skBytes = numberToBytesBE(priv, 32);
  const skHex = bytesToHex(skBytes);
  const pubHex = bytesToHex(secp256k1.getPublicKey(skBytes, true));
  return { skHex, pubHex };
}

export function deriveAuctionKey(
  signMessage: SignMessage,
  nftContract: string,
  tokenId: number,
): Promise<AuctionKey> {
  return deriveKeyFromMessage(signMessage, auctionKeyMessage(nftContract, tokenId));
}

export function deriveBidKey(
  signMessage: SignMessage,
  nftContract: string,
  tokenId: number,
): Promise<AuctionKey> {
  return deriveKeyFromMessage(signMessage, bidKeyMessage(nftContract, tokenId));
}
