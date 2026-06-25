import { nativeToScVal } from '@stellar/stellar-sdk';
import {
  readContract,
  writeContract,
  writeContractWithReturn,
  scAddress,
  scU64,
  scU32,
  scU128,
  scI128,
  scBytes,
} from './soroban';
import { hexToBytes } from './ecies';
import { serializeAuctionInput, parseJournal } from './risc0';
import { USDC_DECIMALS, USDC_SCALE } from './format';

const AUCTION = process.env.NEXT_PUBLIC_AUCTION_CONTRACT!;
const NFT = process.env.NEXT_PUBLIC_NFT_CONTRACT!;
const USDC = process.env.NEXT_PUBLIC_USDC_CONTRACT!;
const USDT = process.env.NEXT_PUBLIC_USDT_CONTRACT!;
const PROVER_URL = process.env.NEXT_PUBLIC_PROVER_URL!;

export { USDC_DECIMALS, USDC_SCALE };

export interface SealedBid {
  bidder: string;
  ciphertext: Uint8Array;
}

export interface Auction {
  id: number;
  seller: string;
  ownerPubkey: Uint8Array; // 33-byte compressed secp256k1 pubkey
  paymentToken: string;
  nft: string;
  tokenId: number;
  reserve: bigint;
  deposit: bigint;
  endTime: number; // unix seconds
  bids: SealedBid[];
  settled: boolean;
  winner: string | null;
  secondPrice: bigint;
}

export type AuctionStatus = 'live' | 'ended' | 'settled';

export function auctionStatus(a: Auction, now: number = Date.now() / 1000): AuctionStatus {
  if (a.settled) return 'settled';
  if (now < a.endTime) return 'live';
  return 'ended';
}

type Sign = (xdr: string) => Promise<string>;

// ---- Auction reads ----

export async function auctionCount(): Promise<number> {
  const raw = (await readContract(AUCTION, 'auction_count')) as bigint | number | null;
  return raw == null ? 0 : Number(raw);
}

// Auction ids listed by / bid on by an address (contract-side filtered).
export async function auctionsBySeller(address: string): Promise<number[]> {
  const raw = (await readContract(AUCTION, 'auctions_by_seller', [scAddress(address)])) as
    | (bigint | number)[]
    | null;
  return (raw ?? []).map(Number);
}

export async function auctionsByBidder(address: string): Promise<number[]> {
  const raw = (await readContract(AUCTION, 'auctions_by_bidder', [scAddress(address)])) as
    | (bigint | number)[]
    | null;
  return (raw ?? []).map(Number);
}

interface RawAuction {
  seller: string;
  owner_pubkey: Uint8Array;
  payment_token: string;
  nft: string;
  token_id: number;
  reserve: bigint;
  deposit: bigint;
  end_time: bigint;
  bids: { bidder: string; ciphertext: Uint8Array }[];
  settled: boolean;
  winner: string | null;
  second_price: bigint;
}

export async function queryAuction(id: number): Promise<Auction> {
  const raw = (await readContract(AUCTION, 'query_auction', [scU64(id)])) as RawAuction;
  return {
    id,
    seller: raw.seller,
    ownerPubkey: Uint8Array.from(raw.owner_pubkey as unknown as ArrayLike<number>),
    paymentToken: raw.payment_token,
    nft: raw.nft,
    tokenId: Number(raw.token_id),
    reserve: BigInt(raw.reserve ?? 0),
    deposit: BigInt(raw.deposit ?? 0),
    endTime: Number(raw.end_time ?? 0n),
    bids: (raw.bids ?? []).map((b) => ({
      bidder: b.bidder,
      ciphertext: Uint8Array.from(b.ciphertext as unknown as ArrayLike<number>),
    })),
    settled: !!raw.settled,
    winner: raw.winner ?? null,
    secondPrice: BigInt(raw.second_price ?? 0),
  };
}

// ---- Auction writes ----

export async function createAuction(
  source: string,
  sign: Sign,
  ownerPubkey: Uint8Array,
  paymentToken: string,
  nft: string,
  tokenId: number,
  reserve: bigint,
  deposit: bigint,
  duration: bigint,
): Promise<number> {
  const { returnValue } = await writeContractWithReturn(
    AUCTION,
    source,
    sign,
    'create_auction',
    [
      scAddress(source),
      nativeToScVal(Buffer.from(ownerPubkey), { type: 'bytes' }),
      scAddress(paymentToken),
      scAddress(nft),
      scU32(tokenId),
      scU128(reserve),
      scU128(deposit),
      scU64(duration),
    ],
  );
  return Number(returnValue as bigint | number);
}

export async function placeBid(
  source: string,
  sign: Sign,
  auctionId: number,
  ciphertext: Uint8Array,
): Promise<string> {
  return writeContract(AUCTION, source, sign, 'place_bid', [
    scAddress(source),
    scU64(auctionId),
    scBytes(ciphertext),
  ]);
}

export async function finalize(
  source: string,
  sign: Sign,
  auctionId: number,
  winnerIndex: number,
  secondPrice: bigint,
  seal: Uint8Array,
): Promise<string> {
  return writeContract(AUCTION, source, sign, 'finalize', [
    scU64(auctionId),
    scU32(winnerIndex),
    scU128(secondPrice),
    scBytes(seal),
  ]);
}

export async function withdraw(
  source: string,
  sign: Sign,
  auctionId: number,
): Promise<string> {
  return writeContract(AUCTION, source, sign, 'withdraw', [
    scAddress(source),
    scU64(auctionId),
  ]);
}

// ---- NFT reads ----

export interface NftMetadata {
  name: string;
  uri: string;
}

export async function nftMetadata(tokenId: number): Promise<NftMetadata> {
  const raw = (await readContract(NFT, 'metadata', [scU32(tokenId)])) as NftMetadata;
  return { name: raw?.name ?? `Lot #${tokenId}`, uri: raw?.uri ?? '' };
}

export async function nftOwnerOf(tokenId: number): Promise<string> {
  return (await readContract(NFT, 'owner_of', [scU32(tokenId)])) as string;
}

// ---- NFT writes ----

// mint is open: anyone mints a lot NFT to themselves. Returns the new token_id.
export async function nftMint(
  source: string,
  sign: Sign,
  name: string,
  uri: string,
): Promise<number> {
  const { returnValue } = await writeContractWithReturn(NFT, source, sign, 'mint', [
    scAddress(source),
    nativeToScVal(name, { type: 'string' }),
    nativeToScVal(uri, { type: 'string' }),
  ]);
  return Number(returnValue as bigint | number);
}

// ---- USDC ----

export async function usdcDecimals(): Promise<number> {
  const raw = (await readContract(USDC, 'decimals')) as number | bigint | null;
  return raw == null ? USDC_DECIMALS : Number(raw);
}

export async function usdcBalance(address: string): Promise<bigint> {
  return tokenBalance(USDC, address);
}

// Balance of any SEP-41 / SAC token (per-auction payment token).
export async function tokenBalance(token: string, address: string): Promise<bigint> {
  const raw = (await readContract(token, 'balance', [scAddress(address)])) as bigint | null;
  return raw == null ? 0n : BigInt(raw);
}

export async function usdcMint(
  source: string,
  sign: Sign,
  amount: bigint,
): Promise<string> {
  return writeContract(USDC, source, sign, 'mint', [scAddress(source), scI128(amount)]);
}

export async function usdtMint(
  source: string,
  sign: Sign,
  amount: bigint,
): Promise<string> {
  return writeContract(USDT, source, sign, 'mint', [scAddress(source), scI128(amount)]);
}

// ---- Prover (owner reveal flow) ----

export interface ProofResult {
  seal: string; // hex
  winner_index: number;
  second_price: string;
  image_id: string;
}

function bytesToBase64(b: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < b.length; i += CHUNK) {
    s += String.fromCharCode(...b.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

// The guest ELF, bundled as a static asset. Its hash is the on-chain image_id.
let elfB64Cache: string | null = null;
async function loadGuestElfB64(): Promise<string> {
  if (elfB64Cache) return elfB64Cache;
  const res = await fetch('/orbid-guest.bin');
  if (!res.ok) throw new Error(`failed to load guest ELF: ${res.status}`);
  elfB64Cache = bytesToBase64(new Uint8Array(await res.arrayBuffer()));
  return elfB64Cache;
}

// The prover is now program-agnostic (Bonsai-style): the frontend builds the
// RISC0 input stream, ships the guest ELF, and decodes the journal itself. The
// seller's per-auction secret key only ever travels in the input, never stored.
export async function generateProof(
  ownerSkHex: string,
  auctionId: number,
  reserve: bigint,
  deposit: bigint,
  ciphertexts: Uint8Array[],
): Promise<ProofResult> {
  const input = serializeAuctionInput({
    sk: hexToBytes(ownerSkHex.replace(/^0x/, '')),
    auctionId,
    ciphertexts,
    reserve,
    deposit,
  });
  const elf = await loadGuestElfB64();

  const res = await fetch(`${PROVER_URL}/api/v1/generate-proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      elf,
      input: bytesToBase64(input),
      receipt_kind: 'groth16',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Prover error ${res.status}: ${text || res.statusText}`);
  }
  const { seal, journal, image_id } = (await res.json()) as {
    seal: string;
    journal: string;
    image_id: string;
  };
  const { winnerIndex, secondPrice } = parseJournal(hexToBytes(journal));
  return {
    seal,
    winner_index: winnerIndex,
    second_price: secondPrice.toString(),
    image_id,
  };
}

export { hexToBytes };
