//! Behavioural tests for the sealed-bid Vickrey core - the exact logic the RISC0
//! guest proves. Bids are encrypted by the JS `@noble` encryptor (`interop/`) and
//! decrypted here, so these also pin JS -> Rust cross-language agreement on the
//! Orbid-ECIES wire format.
//!
//! Golden vector: owner sk = 0x11..11 (fixed), bids encrypted to its pubkey
//! 0x034f355b… - regenerate with `node interop/enc.mjs <pub> <amount>` if the
//! wire format ever changes.

use auction_core::{decrypt_bid, run_auction, AuctionError, AuctionInput};

const OWNER_SK_HEX: &str = "1111111111111111111111111111111111111111111111111111111111111111";

// Bids 100, 70, 50 encrypted to the owner pubkey by interop/ecies.mjs.
const CT_100: &str = "03b0c979527739b0aeba5eaa603464a86dd6073544fea4ed079b254646efbd285fc955c8b134a7b679fec467d4e6af2e60a46102bef1fd7ad6597367d3e8276069f2d5800b4bf1668451df5a20";
const CT_70: &str = "03a9d3ed8c14543c483315d7033c9d7134d41a00dc5abcb0f79009d22dfd38b6c86c5bdf9832251f11653982d40e19acc13c66443dcdcdee3af96486cc102c623ac042eb74f2948d29f1b49d4e";
const CT_50: &str = "031b5e072331ae88bb7d459d41486b9cb5158114d4ee5ca3a6c94e88e7d34bede4d70a7f838b00a6910f7261b7c28ab4b80c844a7b4583a1bebbddec74516bd185bb9f2d37cd2db5129a0f1c44";
// A second, independently-encrypted bid of 100 (distinct ciphertext) for ties.
const CT_100B: &str = "034482fb70bb476af5ca0e02cba53dac76ee2583f46a4c91f70a6699d6096e1766e84f2daf7a0b8d7e54f9f5410e711841d7906067c5c4f98fe1f41cc07dce6a73613f3848e211ae1b22548a19";

fn sk() -> [u8; 32] {
    hex::decode(OWNER_SK_HEX).unwrap().try_into().unwrap()
}

fn input(ciphertexts: &[&str], reserve: u128, deposit: u128) -> AuctionInput {
    AuctionInput {
        sk: hex::decode(OWNER_SK_HEX).unwrap(),
        auction_id: 1,
        ciphertexts: ciphertexts
            .iter()
            .map(|c| hex::decode(c).unwrap())
            .collect(),
        reserve,
        deposit,
    }
}

#[test]
fn js_ciphertexts_decrypt_to_their_bids() {
    // Cross-language: ciphertext from the JS encryptor decrypts to the exact bid.
    assert_eq!(
        decrypt_bid(&sk(), &hex::decode(CT_100).unwrap()).unwrap(),
        100
    );
    assert_eq!(
        decrypt_bid(&sk(), &hex::decode(CT_70).unwrap()).unwrap(),
        70
    );
    assert_eq!(
        decrypt_bid(&sk(), &hex::decode(CT_50).unwrap()).unwrap(),
        50
    );
}

#[test]
fn vickrey_happy_path_pays_second_price() {
    // 100, 70, 50 with a low reserve -> bidder 0 wins, pays the 2nd price 70.
    let out = run_auction(&input(&[CT_100, CT_70, CT_50], 1, 1_000)).unwrap();
    assert_eq!(out.winner_index, 0);
    assert_eq!(out.second_price, 70);
}

#[test]
fn reserve_floors_the_settlement_price() {
    // Reserve 80 sits above the 2nd-highest (70): the winner pays the reserve, not 70.
    let out = run_auction(&input(&[CT_100, CT_70, CT_50], 80, 1_000)).unwrap();
    assert_eq!(out.winner_index, 0);
    assert_eq!(out.second_price, 80);
}

#[test]
fn bid_above_deposit_is_ignored() {
    // Deposit 80 makes the top bid (100) unaffordable -> dropped. Bidder 1 (70)
    // wins over 50, pays the 2nd price among the affordable bids (50).
    let out = run_auction(&input(&[CT_100, CT_70, CT_50], 1, 80)).unwrap();
    assert_eq!(out.winner_index, 1);
    assert_eq!(out.second_price, 50);
}

#[test]
fn ties_keep_first_seen_winner_and_pay_the_tied_amount() {
    // Two equal top bids (100, 100): the first in storage order wins, and the
    // second price IS the tied amount - so a tie pays full price. This is the
    // intended rule; it is the one case where the winner pays their own bid.
    let out = run_auction(&input(&[CT_100, CT_100B, CT_50], 1, 1_000)).unwrap();
    assert_eq!(out.winner_index, 0);
    assert_eq!(out.second_price, 100);
}

#[test]
fn no_bids_is_an_error() {
    assert_eq!(
        run_auction(&input(&[], 1, 1_000)),
        Err(AuctionError::NoBids)
    );
}

#[test]
fn all_below_reserve_has_no_winner() {
    // Reserve 200 is above every bid -> no valid winner.
    assert_eq!(
        run_auction(&input(&[CT_100, CT_70, CT_50], 200, 1_000)),
        Err(AuctionError::NoWinnerAboveReserve),
    );
}
