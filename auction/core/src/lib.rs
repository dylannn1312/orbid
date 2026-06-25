//! Orbid shared crypto + sealed-bid Vickrey auction logic. Compiled into both
//! the RISC0 guest (where RISC0's `k256`/`sha2` precompile patches accelerate
//! it) and native tooling/tests.
//!
//! ## Orbid-ECIES v1 (we own this wire format on both ends)
//!
//! A bidder encrypts a `u128` bid to the auctioneer's secp256k1 public key:
//!
//! ```text
//! esk            = random secp256k1 scalar
//! EPK            = esk * G                       (compressed, 33 bytes)
//! shared_point   = esk * PK_owner               (compressed, 33 bytes)
//! key            = HKDF-SHA256(ikm = EPK || shared_point, info = "orbid-ecies-v1") -> 32 bytes
//! ct || tag      = AES-256-GCM(key, nonce, plaintext = bid.to_le_bytes())
//! wire           = EPK(33) || nonce(12) || ct||tag(16+16)
//! ```
//!
//! ## Auction binding (what the proof attests)
//!
//! - `auction_hash = SHA256( auction_id_le8 || n_le4 || (len_le4 || ct)* )` over
//!   the on-chain bids **in storage order**. The contract recomputes this from
//!   its own state, so the owner cannot drop / add / reorder / alter bids.
//! - The guest decrypts every bid, picks the highest (`winner_index`) and the
//!   Vickrey settlement price (`second_price = max(second_highest, reserve)`),
//!   and commits the journal below. No bid amount is ever revealed - not even
//!   the winner's. Only `second_price` (what the winner pays) is disclosed.
//! - Journal (committed via `env::commit` as a flat `Vec<u8>`, 52 bytes):
//!   `auction_hash(32) || winner_index_le4 || second_price_le16`.
//!   The contract resolves the winner *address* from `bids[winner_index]`.
#![no_std]

extern crate alloc;
use alloc::{format, string::String, vec::Vec};

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use hkdf::Hkdf;
use k256::{elliptic_curve::sec1::ToEncodedPoint, ProjectivePoint, PublicKey, Scalar, SecretKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Domain separator bound into the HKDF expansion.
pub const HKDF_INFO: &[u8] = b"orbid-ecies-v1";

const EPK_LEN: usize = 33;
const NONCE_LEN: usize = 12;

/// Byte length of the committed journal: auction_hash(32) + index(4) + price(16).
pub const JOURNAL_LEN: usize = 32 + 4 + 16;

#[derive(Debug, PartialEq, Eq)]
pub enum EciesError {
    TooShort,
    BadSecretKey,
    BadEphemeralKey,
    Hkdf,
    Aead,
}

/// Decrypt an Orbid-ECIES v1 ciphertext with the owner's 32-byte secret scalar.
pub fn decrypt(sk_bytes: &[u8; 32], wire: &[u8]) -> Result<Vec<u8>, EciesError> {
    if wire.len() < EPK_LEN + NONCE_LEN {
        return Err(EciesError::TooShort);
    }
    let epk_bytes = &wire[..EPK_LEN];
    let nonce_bytes = &wire[EPK_LEN..EPK_LEN + NONCE_LEN];
    let ct = &wire[EPK_LEN + NONCE_LEN..];

    let sk = SecretKey::from_bytes(sk_bytes.into()).map_err(|_| EciesError::BadSecretKey)?;
    let epk = PublicKey::from_sec1_bytes(epk_bytes).map_err(|_| EciesError::BadEphemeralKey)?;

    // shared_point = sk * EPK  (== esk * PK_owner), compressed to 33 bytes.
    let scalar: Scalar = *sk.to_nonzero_scalar();
    let shared = (ProjectivePoint::from(*epk.as_affine()) * scalar).to_affine();
    let shared_enc = shared.to_encoded_point(true);

    let mut ikm = Vec::with_capacity(EPK_LEN + EPK_LEN);
    ikm.extend_from_slice(epk_bytes);
    ikm.extend_from_slice(shared_enc.as_bytes());

    let hk = Hkdf::<Sha256>::new(None, &ikm);
    let mut key = [0u8; 32];
    hk.expand(HKDF_INFO, &mut key)
        .map_err(|_| EciesError::Hkdf)?;

    let cipher = Aes256Gcm::new((&key).into());
    cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ct)
        .map_err(|_| EciesError::Aead)
}

/// Decrypt a ciphertext to a `u128` bid (expects exactly 16 plaintext bytes).
pub fn decrypt_bid(sk_bytes: &[u8; 32], wire: &[u8]) -> Result<u128, EciesError> {
    let pt = decrypt(sk_bytes, wire)?;
    let arr: [u8; 16] = pt.as_slice().try_into().map_err(|_| EciesError::Aead)?;
    Ok(u128::from_le_bytes(arr))
}

/// SHA256 binding over the on-chain bid set, in storage order. The Soroban
/// contract MUST reproduce these exact bytes.
pub fn auction_hash(
    auction_id: u64,
    reserve: u128,
    deposit: u128,
    ciphertexts: &[Vec<u8>],
) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(auction_id.to_le_bytes());
    h.update(reserve.to_le_bytes());
    h.update(deposit.to_le_bytes());
    h.update((ciphertexts.len() as u32).to_le_bytes());
    for ct in ciphertexts {
        h.update((ct.len() as u32).to_le_bytes());
        h.update(ct);
    }
    h.finalize().into()
}

/// Input handed to the guest (and built by the host/prover from on-chain state).
#[derive(Clone, Serialize, Deserialize)]
pub struct AuctionInput {
    /// Owner secp256k1 secret key, 32 bytes.
    pub sk: Vec<u8>,
    pub auction_id: u64,
    /// On-chain bid ciphertexts, in storage order.
    pub ciphertexts: Vec<Vec<u8>>,
    /// Minimum acceptable price; also the floor for the settlement price.
    pub reserve: u128,
    /// Fixed deposit each bidder locked; a bid above it is unaffordable -> ignored.
    pub deposit: u128,
}

/// Result of evaluating a sealed-bid Vickrey auction.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Outcome {
    pub auction_hash: [u8; 32],
    pub winner_index: u32,
    pub second_price: u128,
}

#[derive(Debug, PartialEq, Eq)]
pub enum AuctionError {
    NoBids,
    DecryptFailed(u32),
    NoWinnerAboveReserve,
}

/// Evaluate the auction: decrypt every bid, find the highest (winner) and the
/// Vickrey settlement price. Panics-free; the guest unwraps and a bad input
/// aborts proving.
pub fn run_auction(input: &AuctionInput) -> Result<Outcome, AuctionError> {
    if input.ciphertexts.is_empty() {
        return Err(AuctionError::NoBids);
    }
    let sk: [u8; 32] = input
        .sk
        .as_slice()
        .try_into()
        .map_err(|_| AuctionError::DecryptFailed(u32::MAX))?;

    let mut best_amount: u128 = 0;
    let mut best_index: i64 = -1;
    let mut second: u128 = 0;

    for (i, ct) in input.ciphertexts.iter().enumerate() {
        let bid = decrypt_bid(&sk, ct).map_err(|_| AuctionError::DecryptFailed(i as u32))?;
        // A bid above the locked deposit is unaffordable -> not a valid candidate.
        if bid > input.deposit {
            continue;
        }
        if best_index < 0 || bid > best_amount {
            second = best_amount;
            best_amount = bid;
            best_index = i as i64;
        } else if bid > second {
            second = bid;
        }
    }

    if best_index < 0 || best_amount < input.reserve {
        return Err(AuctionError::NoWinnerAboveReserve);
    }

    let second_price = if second > input.reserve {
        second
    } else {
        input.reserve
    };
    Ok(Outcome {
        auction_hash: auction_hash(
            input.auction_id,
            input.reserve,
            input.deposit,
            &input.ciphertexts,
        ),
        winner_index: best_index as u32,
        second_price,
    })
}

/// Flat journal bytes committed by the guest and reconstructed by the contract.
pub fn journal_bytes(o: &Outcome) -> Vec<u8> {
    let mut v = Vec::with_capacity(JOURNAL_LEN);
    v.extend_from_slice(&o.auction_hash);
    v.extend_from_slice(&o.winner_index.to_le_bytes());
    v.extend_from_slice(&o.second_price.to_le_bytes());
    v
}

/// Parse a journal blob back into an `Outcome` (used by the host/server to read
/// what the proof attested). Returns a description on malformed input.
pub fn parse_journal(bytes: &[u8]) -> Result<Outcome, String> {
    if bytes.len() != JOURNAL_LEN {
        return Err(format!("journal len {} != {}", bytes.len(), JOURNAL_LEN));
    }
    let mut auction_hash = [0u8; 32];
    auction_hash.copy_from_slice(&bytes[..32]);
    let winner_index = u32::from_le_bytes(bytes[32..36].try_into().unwrap());
    let second_price = u128::from_le_bytes(bytes[36..52].try_into().unwrap());
    Ok(Outcome {
        auction_hash,
        winner_index,
        second_price,
    })
}
