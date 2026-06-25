#![no_std]
//! Orbid - sealed-bid Vickrey NFT auction on Soroban (multi-seller).
//!
//! **Anyone** can list a lot: the seller picks a per-auction secp256k1 keypair
//! (in practice derived from their wallet signature), publishes the **public**
//! key on-chain via `create_auction`, and escrows the NFT. Bidders read that
//! per-auction pubkey, encrypt a `u128` bid to it (Orbid-ECIES) and submit the
//! ciphertext + a fixed token deposit. After the deadline the seller decrypts
//! off-chain and proves the Vickrey outcome (RISC0 Groth16), and `finalize`
//! verifies the proof on-chain and settles.
//!
//! ## Why the proof is load-bearing
//!
//! The contract can't see bid amounts. `finalize` takes a seller-supplied
//! `winner_index` + `second_price`, reconstructs the proof journal
//! `auction_hash || winner_index || second_price`, and cross-contract-calls the
//! RISC0 verifier. `auction_hash` is recomputed here from the contract's own
//! stored bids (+ reserve + deposit), so the seller cannot drop/add/reorder bids
//! or lie about the winner or price. The winner *address* is resolved from
//! `bids[winner_index]`, never trusted from the seller. Only `second_price`
//! (what the winner pays) is ever revealed - no bid amount, not even the winner's.
//!
//! ## Journal byte layout (must match `auction_core`)
//!
//! The guest commits a flat `Vec<u8>` = `auction_hash(32) || winner_index_le(4)
//! || second_price_le(16)` (52 bytes). risc0 serde encodes that as a LE u32
//! element-count (52) then one LE u32 word per byte. See
//! `reconstruct_journal_digest`.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, token, Address, Bytes,
    BytesN, Env, IntoVal, Symbol, Vec,
};

const DAY_LEDGERS: u32 = 17_280;
const AUCTION_BUMP: u32 = 60 * DAY_LEDGERS;
const AUCTION_TTL: u32 = AUCTION_BUMP + DAY_LEDGERS;

/// Number of committed journal bytes: auction_hash(32) + index(4) + price(16).
const JOURNAL_LEN: u32 = 52;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AuctionNotFound = 1,
    NotSeller = 2,
    BiddingClosed = 3,
    BiddingOpen = 4,
    AlreadyBid = 5,
    AlreadySettled = 6,
    NoBids = 7,
    BadWinnerIndex = 8,
    ReserveAboveDeposit = 9,
    PriceAboveDeposit = 10,
    NotABidder = 11,
    IsWinner = 12,
    AlreadyRefunded = 13,
    NotSettled = 14,
}

/// A sealed bid: the bidder's address + their Orbid-ECIES ciphertext.
#[contracttype]
#[derive(Clone)]
pub struct Bid {
    pub bidder: Address,
    pub ciphertext: Bytes,
}

#[contracttype]
#[derive(Clone)]
pub struct Auction {
    /// The lister; the only one who can finalize, and who gets paid.
    pub seller: Address,
    /// Per-auction compressed secp256k1 key that bidders encrypt to.
    pub owner_pubkey: BytesN<33>,
    pub nft: Address,
    pub token_id: u32,
    pub reserve: u128,
    pub deposit: u128,
    /// The token bidders deposit + the winner pays in (chosen per auction).
    pub payment_token: Address,
    pub end_time: u64,
    pub bids: Vec<Bid>,
    pub settled: bool,
    pub winner: Option<Address>,
    pub second_price: u128,
}

#[contracttype]
pub enum DataKey {
    ImageId,
    Verifier,
    AuctionCounter,
    Auction(u64),
    Refunded(u64, Address),
}

/// Minimal client for the Orbid NFT `transfer`.
#[contractclient(name = "NftClient")]
pub trait NftInterface {
    fn transfer(env: Env, from: Address, to: Address, token_id: u32);
}

#[contract]
pub struct OrbidAuction;

#[contractimpl]
impl OrbidAuction {
    /// Platform config (immutable): the accepted RISC0 guest image, the RISC0
    /// Groth16 verifier, and the deposit/settlement token. No privileged owner.
    pub fn __constructor(env: Env, image_id: BytesN<32>, verifier: Address) {
        let s = env.storage().instance();
        s.set(&DataKey::ImageId, &image_id);
        s.set(&DataKey::Verifier, &verifier);
        s.set(&DataKey::AuctionCounter, &0u64);
    }

    /// List a lot. `seller` escrows an NFT and publishes the per-auction
    /// `owner_pubkey` that bidders encrypt to. Anyone can call this.
    pub fn create_auction(
        env: Env,
        seller: Address,
        owner_pubkey: BytesN<33>,
        payment_token: Address,
        nft: Address,
        token_id: u32,
        reserve: u128,
        deposit: u128,
        duration: u64,
    ) -> Result<u64, Error> {
        seller.require_auth();
        if reserve > deposit {
            return Err(Error::ReserveAboveDeposit);
        }

        // Escrow the lot into this contract.
        NftClient::new(&env, &nft).transfer(&seller, &env.current_contract_address(), &token_id);

        let id = next_auction_id(&env);
        let auction = Auction {
            seller,
            owner_pubkey,
            payment_token,
            nft,
            token_id,
            reserve,
            deposit,
            end_time: env.ledger().timestamp() + duration,
            bids: Vec::new(&env),
            settled: false,
            winner: None,
            second_price: 0,
        };
        save_auction(&env, id, &auction);
        Ok(id)
    }

    /// Place a sealed bid: locks `deposit` and stores the ciphertext. One bid
    /// per address; bidding again before the deadline replaces the sealed bid
    /// in place (no second deposit). Only before the deadline.
    pub fn place_bid(
        env: Env,
        bidder: Address,
        auction_id: u64,
        ciphertext: Bytes,
    ) -> Result<(), Error> {
        bidder.require_auth();
        let mut auction = load_auction(&env, auction_id)?;
        if auction.settled || env.ledger().timestamp() >= auction.end_time {
            return Err(Error::BiddingClosed);
        }

        // Already bid? Overwrite the ciphertext — the deposit is already locked.
        if let Some(i) = auction.bids.iter().position(|b| b.bidder == bidder) {
            auction.bids.set(i as u32, Bid { bidder, ciphertext });
            save_auction(&env, auction_id, &auction);
            return Ok(());
        }

        // New bidder: escrow the deposit and append the sealed bid.
        token::TokenClient::new(&env, &auction.payment_token).transfer(
            &bidder,
            &env.current_contract_address(),
            &(auction.deposit as i128),
        );
        auction.bids.push_back(Bid { bidder, ciphertext });
        save_auction(&env, auction_id, &auction);
        Ok(())
    }

    /// Seller-only. Settle with a RISC0 proof of the Vickrey outcome. The
    /// journal is reconstructed from on-chain state; an invalid proof reverts.
    pub fn finalize(
        env: Env,
        auction_id: u64,
        winner_index: u32,
        second_price: u128,
        seal: Bytes,
    ) -> Result<(), Error> {
        let mut auction = load_auction(&env, auction_id)?;
        auction.seller.require_auth();
        if auction.settled {
            return Err(Error::AlreadySettled);
        }
        if env.ledger().timestamp() < auction.end_time {
            return Err(Error::BiddingOpen);
        }
        if auction.bids.is_empty() {
            return Err(Error::NoBids);
        }
        if winner_index >= auction.bids.len() {
            return Err(Error::BadWinnerIndex);
        }
        if second_price > auction.deposit {
            return Err(Error::PriceAboveDeposit);
        }

        // Reconstruct the proof journal from our own state and verify.
        let auction_hash = compute_auction_hash(&env, &auction, auction_id);
        let journal_digest =
            reconstruct_journal_digest(&env, &auction_hash, winner_index, second_price);
        let image_id: BytesN<32> = env.storage().instance().get(&DataKey::ImageId).unwrap();
        let verifier: Address = env.storage().instance().get(&DataKey::Verifier).unwrap();
        let args = (seal, image_id, journal_digest).into_val(&env);
        env.invoke_contract::<()>(&verifier, &Symbol::new(&env, "verify"), args);

        // Proof verified: settle. Winner address comes from our storage.
        let winner = auction.bids.get(winner_index).unwrap().bidder;
        let token = token::TokenClient::new(&env, &auction.payment_token);
        let contract = env.current_contract_address();

        NftClient::new(&env, &auction.nft).transfer(&contract, &winner, &auction.token_id);
        token.transfer(&contract, &auction.seller, &(second_price as i128));
        let refund = auction.deposit as i128 - second_price as i128;
        if refund > 0 {
            token.transfer(&contract, &winner, &refund);
        }
        env.storage()
            .persistent()
            .set(&DataKey::Refunded(auction_id, winner.clone()), &true);

        auction.settled = true;
        auction.winner = Some(winner);
        auction.second_price = second_price;
        save_auction(&env, auction_id, &auction);
        Ok(())
    }

    /// A non-winning bidder reclaims their full deposit after settlement.
    pub fn withdraw(env: Env, bidder: Address, auction_id: u64) -> Result<(), Error> {
        bidder.require_auth();
        let auction = load_auction(&env, auction_id)?;
        if !auction.settled {
            return Err(Error::NotSettled);
        }
        if !auction.bids.iter().any(|b| b.bidder == bidder) {
            return Err(Error::NotABidder);
        }
        if auction.winner == Some(bidder.clone()) {
            return Err(Error::IsWinner);
        }
        let key = DataKey::Refunded(auction_id, bidder.clone());
        if env.storage().persistent().get(&key).unwrap_or(false) {
            return Err(Error::AlreadyRefunded);
        }
        env.storage().persistent().set(&key, &true);
        token::TokenClient::new(&env, &auction.payment_token).transfer(
            &env.current_contract_address(),
            &bidder,
            &(auction.deposit as i128),
        );
        Ok(())
    }

    // ---- views ----

    pub fn query_auction(env: Env, auction_id: u64) -> Result<Auction, Error> {
        load_auction(&env, auction_id)
    }

    pub fn auction_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::AuctionCounter)
            .unwrap_or(0)
    }

    /// Auction ids listed by `seller` (where they are the auctioneer).
    pub fn auctions_by_seller(env: Env, seller: Address) -> Vec<u64> {
        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::AuctionCounter)
            .unwrap_or(0);
        let mut out = Vec::new(&env);
        for id in 1..=count {
            if let Ok(a) = load_auction(&env, id) {
                if a.seller == seller {
                    out.push_back(id);
                }
            }
        }
        out
    }

    /// Auction ids `bidder` currently has a sealed bid on.
    pub fn auctions_by_bidder(env: Env, bidder: Address) -> Vec<u64> {
        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::AuctionCounter)
            .unwrap_or(0);
        let mut out = Vec::new(&env);
        for id in 1..=count {
            if let Ok(a) = load_auction(&env, id) {
                if a.bids.iter().any(|b| b.bidder == bidder) {
                    out.push_back(id);
                }
            }
        }
        out
    }

    /// Whether `bidder`'s deposit for this auction has already been paid out
    /// (a non-winner who withdrew, or the winner whose refund was sent on
    /// finalize). Lets the UI hide a spent reclaim action.
    pub fn is_refunded(env: Env, auction_id: u64, bidder: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Refunded(auction_id, bidder))
            .unwrap_or(false)
    }

    pub fn image_id(env: Env) -> BytesN<32> {
        env.storage().instance().get(&DataKey::ImageId).unwrap()
    }

    pub fn verifier(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Verifier).unwrap()
    }
}

// ---- helpers ----

fn next_auction_id(env: &Env) -> u64 {
    let s = env.storage().instance();
    let id: u64 = s.get(&DataKey::AuctionCounter).unwrap_or(0) + 1;
    s.set(&DataKey::AuctionCounter, &id);
    id
}

fn load_auction(env: &Env, id: u64) -> Result<Auction, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Auction(id))
        .ok_or(Error::AuctionNotFound)
}

fn save_auction(env: &Env, id: u64, auction: &Auction) {
    let key = DataKey::Auction(id);
    env.storage().persistent().set(&key, auction);
    env.storage()
        .persistent()
        .extend_ttl(&key, AUCTION_BUMP, AUCTION_TTL);
}

/// SHA256 binding over the auction params + on-chain bids, in storage order.
/// MUST match `auction_core::auction_hash`.
fn compute_auction_hash(env: &Env, auction: &Auction, auction_id: u64) -> BytesN<32> {
    let mut buf = Bytes::new(env);
    buf.extend_from_array(&auction_id.to_le_bytes());
    buf.extend_from_array(&auction.reserve.to_le_bytes());
    buf.extend_from_array(&auction.deposit.to_le_bytes());
    buf.extend_from_array(&(auction.bids.len() as u32).to_le_bytes());
    for bid in auction.bids.iter() {
        buf.extend_from_array(&(bid.ciphertext.len() as u32).to_le_bytes());
        buf.append(&bid.ciphertext);
    }
    env.crypto().sha256(&buf).into()
}

/// Rebuild the proof journal and return its SHA256 digest. Committed bytes are
/// `auction_hash(32) || winner_index_le(4) || second_price_le(16)`, then
/// risc0-serde-encoded as a LE u32 element count followed by one LE u32 word per
/// byte (matching the guest's `env::commit(&Vec<u8>)`).
fn reconstruct_journal_digest(
    env: &Env,
    auction_hash: &BytesN<32>,
    winner_index: u32,
    second_price: u128,
) -> BytesN<32> {
    let mut raw = Bytes::new(env);
    raw.extend_from_array(&auction_hash.to_array());
    raw.extend_from_array(&winner_index.to_le_bytes());
    raw.extend_from_array(&second_price.to_le_bytes());

    let mut j = Bytes::new(env);
    j.extend_from_array(&JOURNAL_LEN.to_le_bytes());
    for i in 0..raw.len() {
        let b = raw.get(i).unwrap();
        j.extend_from_array(&[b, 0, 0, 0]);
    }
    env.crypto().sha256(&j).into()
}

#[cfg(test)]
mod test;
