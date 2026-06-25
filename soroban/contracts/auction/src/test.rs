#![cfg(test)]
use crate::{Auction, Error, OrbidAuction, OrbidAuctionClient};
use orbid_nft::{Nft, NftClient};
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{contract, contractimpl, token, Address, Bytes, BytesN, Env, String, Vec};

// Stand-in for the RISC0 Groth16 verifier: unit tests can't run BN254 pairing,
// so this mimics the real contract's behaviour - it *panics* (reverting the
// caller's tx) on an invalid proof. Convention: a single 0x00 byte == invalid.
#[contract]
pub struct MockVerifier;

#[contractimpl]
impl MockVerifier {
    pub fn verify(env: Env, seal: Bytes, _image_id: BytesN<32>, _journal: BytesN<32>) {
        let _ = &env;
        if seal.len() == 1 && seal.get(0) == Some(0) {
            panic!("invalid proof");
        }
    }
}

const RESERVE: u128 = 10;
const DEPOSIT: u128 = 1000;
const INIT: i128 = 10_000;
const DURATION: u64 = 100;

struct Fixture {
    env: Env,
    client: OrbidAuctionClient<'static>,
    nft: NftClient<'static>,
    token: Address,
    seller: Address,
    pubkey: BytesN<33>,
    token_id: u32,
    bidders: Vec<Address>,
}

fn setup(num_bidders: u32) -> Fixture {
    let env = Env::default();
    env.mock_all_auths();

    let seller = Address::generate(&env);

    // Payment token (mock USDC) via a Stellar Asset Contract; mint to bidders.
    let sac = env.register_stellar_asset_contract_v2(seller.clone());
    let token = sac.address();
    let mint = token::StellarAssetClient::new(&env, &token);

    let mut bidders = Vec::new(&env);
    for _ in 0..num_bidders {
        let b = Address::generate(&env);
        mint.mint(&b, &INIT);
        bidders.push_back(b);
    }

    // NFT contract + a lot minted to the seller.
    let nft_id = env.register(Nft, (seller.clone(),));
    let nft = NftClient::new(&env, &nft_id);
    let token_id = nft.mint(
        &seller,
        &String::from_str(&env, "Orbid Genesis #1"),
        &String::from_str(&env, "ipfs://art/1"),
    );

    let verifier = env.register(MockVerifier, ());
    let image_id = BytesN::from_array(&env, &[7u8; 32]);
    let contract_id = env.register(OrbidAuction, (image_id, verifier));
    let client = OrbidAuctionClient::new(&env, &contract_id);
    let pubkey = BytesN::from_array(&env, &[2u8; 33]);

    Fixture {
        env,
        client,
        nft,
        token,
        seller,
        pubkey,
        token_id,
        bidders,
    }
}

fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
    token::TokenClient::new(env, token).balance(who)
}

fn ct(env: &Env, tag: u8) -> Bytes {
    // A dummy 77-byte "ciphertext"; the mock verifier ignores its contents.
    let mut b = Bytes::new(env);
    for i in 0..77u8 {
        b.push_back(i ^ tag);
    }
    b
}

fn open_auction_with_bids(f: &Fixture, n: u32) -> u64 {
    let id = f.client.create_auction(
        &f.seller,
        &f.pubkey,
        &f.token,
        &f.nft.address,
        &f.token_id,
        &RESERVE,
        &DEPOSIT,
        &DURATION,
    );
    for i in 0..n {
        let bidder = f.bidders.get(i).unwrap();
        f.client.place_bid(&bidder, &id, &ct(&f.env, i as u8));
    }
    id
}

fn close_bidding(env: &Env) {
    env.ledger().with_mut(|li| li.timestamp += DURATION + 1);
}

#[test]
fn full_vickrey_flow() {
    let f = setup(3);
    let id = open_auction_with_bids(&f, 3);

    // Lot is escrowed in the auction contract.
    assert_eq!(f.nft.owner_of(&f.token_id), f.client.address);

    close_bidding(&f.env);

    // Seller settles: bidder 0 wins, pays the second price (70).
    let winner = f.bidders.get(0).unwrap();
    let second_price: u128 = 70;
    let seal = Bytes::from_array(&f.env, &[1u8, 2, 3, 4]);
    f.client.finalize(&id, &0u32, &second_price, &seal);

    // Winner owns the NFT and is out exactly the second price.
    assert_eq!(f.nft.owner_of(&f.token_id), winner);
    assert_eq!(
        balance(&f.env, &f.token, &winner),
        INIT - second_price as i128
    );
    // Seller received the second price.
    assert_eq!(balance(&f.env, &f.token, &f.seller), second_price as i128);

    // Losers reclaim their full deposits.
    let loser1 = f.bidders.get(1).unwrap();
    assert_eq!(balance(&f.env, &f.token, &loser1), INIT - DEPOSIT as i128);
    f.client.withdraw(&loser1, &id);
    assert_eq!(balance(&f.env, &f.token, &loser1), INIT);

    // Contract retains only bidder 2's still-unclaimed deposit.
    assert_eq!(
        balance(&f.env, &f.token, &f.client.address),
        DEPOSIT as i128
    );
}

#[test]
fn lists_auctions_by_role() {
    let f = setup(2);
    let id = open_auction_with_bids(&f, 2);

    let by_seller = f.client.auctions_by_seller(&f.seller);
    assert_eq!(by_seller.len(), 1);
    assert_eq!(by_seller.get(0).unwrap(), id);

    let b0 = f.bidders.get(0).unwrap();
    let by_bidder = f.client.auctions_by_bidder(&b0);
    assert_eq!(by_bidder.len(), 1);
    assert_eq!(by_bidder.get(0).unwrap(), id);

    // A wallet with no involvement appears in neither list.
    let stranger = soroban_sdk::Address::generate(&f.env);
    assert_eq!(f.client.auctions_by_seller(&stranger).len(), 0);
    assert_eq!(f.client.auctions_by_bidder(&stranger).len(), 0);
}

#[test]
fn invalid_proof_reverts() {
    let f = setup(2);
    let id = open_auction_with_bids(&f, 2);
    close_bidding(&f.env);

    let bad = Bytes::from_array(&f.env, &[0u8]); // mock "invalid" marker
    let res = f.client.try_finalize(&id, &0u32, &70u128, &bad);
    assert!(res.is_err());

    let a: Auction = f.client.query_auction(&id);
    assert!(!a.settled);
}

#[test]
fn cannot_bid_after_deadline() {
    let f = setup(2);
    let id = f.client.create_auction(
        &f.seller,
        &f.pubkey,
        &f.token,
        &f.nft.address,
        &f.token_id,
        &RESERVE,
        &DEPOSIT,
        &DURATION,
    );
    close_bidding(&f.env);
    let res = f
        .client
        .try_place_bid(&f.bidders.get(0).unwrap(), &id, &ct(&f.env, 0));
    assert_eq!(res, Err(Ok(Error::BiddingClosed)));
}

#[test]
fn rebid_updates_in_place() {
    let f = setup(1);
    let id = open_auction_with_bids(&f, 1); // bidder0 bids once (ciphertext tag 0)
    let b0 = f.bidders.get(0).unwrap();
    assert_eq!(balance(&f.env, &f.token, &b0), INIT - DEPOSIT as i128);
    assert_eq!(f.client.query_auction(&id).bids.len(), 1);

    // Bidding again replaces the sealed ciphertext — no second deposit taken,
    // still a single bid on record.
    f.client.place_bid(&b0, &id, &ct(&f.env, 99));
    assert_eq!(balance(&f.env, &f.token, &b0), INIT - DEPOSIT as i128);
    let a = f.client.query_auction(&id);
    assert_eq!(a.bids.len(), 1);
    assert_eq!(a.bids.get(0).unwrap().ciphertext, ct(&f.env, 99));
}

#[test]
fn winner_cannot_withdraw() {
    let f = setup(2);
    let id = open_auction_with_bids(&f, 2);
    close_bidding(&f.env);
    let seal = Bytes::from_array(&f.env, &[1u8, 2, 3, 4]);
    f.client.finalize(&id, &0u32, &70u128, &seal);
    let res = f.client.try_withdraw(&f.bidders.get(0).unwrap(), &id);
    assert_eq!(res, Err(Ok(Error::IsWinner)));
}

#[test]
fn cannot_finalize_before_deadline() {
    let f = setup(2);
    let id = open_auction_with_bids(&f, 2);
    let seal = Bytes::from_array(&f.env, &[1u8, 2, 3, 4]);
    let res = f.client.try_finalize(&id, &0u32, &70u128, &seal);
    assert_eq!(res, Err(Ok(Error::BiddingOpen)));
}

// Pins the risc0 journal serialization (LE u32 element-count, then one LE u32
// word per committed byte) so it cannot silently drift from the guest's
// `env::commit(&Vec<u8>)`. Built against an explicit expected byte array.
#[test]
fn journal_layout_pinned() {
    let env = Env::default();

    // auction_hash = all zeros, winner_index = 3, second_price = 5.
    let ah = BytesN::from_array(&env, &[0u8; 32]);
    let digest = crate::reconstruct_journal_digest(&env, &ah, 3, 5);

    // Expected: 52 raw bytes -> [52,0,0,0] then 52 LE-u32 words.
    let mut expected = [0u8; 4 + 52 * 4];
    expected[0] = 52; // element count
    expected[4 + 32 * 4] = 3; // raw[32] = winner_index low byte
    expected[4 + 36 * 4] = 5; // raw[36] = second_price low byte
    let expected_digest: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_array(&env, &expected))
        .into();

    assert_eq!(digest, expected_digest);
}
