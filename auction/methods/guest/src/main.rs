use auction_core::{journal_bytes, run_auction, AuctionInput};
use risc0_zkvm::guest::env;

/// Orbid sealed-bid Vickrey auction guest.
///
/// Reads the owner's secret key + the on-chain bid ciphertexts, decrypts every
/// bid, selects the highest bidder and the second-price settlement, and commits
/// `auction_hash || winner_index || second_price`. No bid amount is revealed.
fn main() {
    let input: AuctionInput = env::read();
    let outcome = run_auction(&input).expect("auction evaluation failed");
    env::commit(&journal_bytes(&outcome));
}
