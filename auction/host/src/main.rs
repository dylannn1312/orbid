//! Dev host for the Orbid Vickrey guest: evaluate an auction vector, confirm the
//! outcome, report user cycles, and (with `prove`) emit the Groth16 seal +
//! journal_digest the Soroban contract consumes.
//!
//!   VECTOR=../interop/vector.json cargo run -p auction-host --release
//!   VECTOR=../interop/vector.json cargo run -p auction-host --release -- prove
//!
//! vector.json: { sk, auction_id, reserve, ciphertexts[], expected_winner_index?, expected_second_price? }

use anyhow::{Context, Result};
use auction_core::{parse_journal, AuctionInput};
use auction_methods::{AUCTION_ELF, AUCTION_ID};
use risc0_ethereum_contracts::encode_seal;
use risc0_zkvm::{default_executor, default_prover, sha::Digest, ExecutorEnv, ProverOpts};
use sha2::{Digest as _, Sha256};

fn main() -> Result<()> {
    // `image-id`: print the guest image id and exit (used by deploy.sh; no vector needed).
    if std::env::args().nth(1).as_deref() == Some("image-id") {
        println!("{}", hex::encode(Digest::from(AUCTION_ID).as_bytes()));
        return Ok(());
    }

    let prove = std::env::args().nth(1).as_deref() == Some("prove");
    let path = std::env::var("VECTOR").unwrap_or_else(|_| "../interop/vector.json".to_string());

    let raw = std::fs::read_to_string(&path).with_context(|| format!("reading {path}"))?;
    let v: serde_json::Value = serde_json::from_str(&raw)?;

    let sk = hex::decode(v["sk"].as_str().context("sk")?)?;
    let auction_id = v["auction_id"].as_u64().context("auction_id")?;
    let reserve: u128 = v["reserve"].as_str().context("reserve")?.parse()?;
    let deposit: u128 = v["deposit"].as_str().context("deposit")?.parse()?;
    let ciphertexts: Vec<Vec<u8>> = v["ciphertexts"]
        .as_array()
        .context("ciphertexts")?
        .iter()
        .map(|c| hex::decode(c.as_str().unwrap()))
        .collect::<Result<_, _>>()?;

    let input = AuctionInput {
        sk,
        auction_id,
        ciphertexts,
        reserve,
        deposit,
    };

    println!(
        "image_id (AUCTION_ID) = 0x{}",
        hex::encode(Digest::from(AUCTION_ID).as_bytes())
    );

    let env = ExecutorEnv::builder().write(&input)?.build()?;
    let session = default_executor()
        .execute(env, AUCTION_ELF)
        .context("guest execution failed")?;
    let journal: Vec<u8> = session.journal.decode()?;
    let outcome = parse_journal(&journal).map_err(anyhow::Error::msg)?;

    println!("winner_index   = {}", outcome.winner_index);
    println!("second_price   = {}", outcome.second_price);
    println!("auction_hash   = 0x{}", hex::encode(outcome.auction_hash));
    println!("user cycles    = {}", session.cycles());

    if let Some(exp) = v["expected_winner_index"].as_u64() {
        assert_eq!(outcome.winner_index as u64, exp, "winner_index mismatch");
    }
    if let Some(exp) = v["expected_second_price"].as_str() {
        assert_eq!(
            outcome.second_price.to_string(),
            exp,
            "second_price mismatch"
        );
    }
    println!("✅ Vickrey outcome matches expected");

    if prove {
        let env = ExecutorEnv::builder().write(&input)?.build()?;
        let receipt = default_prover()
            .prove_with_opts(env, AUCTION_ELF, &ProverOpts::groth16())
            .context("proving failed (Groth16 needs x86+Docker locally, or Bonsai)")?
            .receipt;
        receipt.verify(AUCTION_ID)?;
        let jbytes = receipt.journal.bytes.clone();
        let seal = encode_seal(&receipt)?;
        println!("journal        = 0x{}", hex::encode(&jbytes));
        println!(
            "journal_digest = 0x{}",
            hex::encode(Sha256::digest(&jbytes))
        );
        println!("seal           = 0x{}", hex::encode(&seal));
        println!("seal.len       = {}", seal.len());
    }
    Ok(())
}
