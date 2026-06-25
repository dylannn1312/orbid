//! Orbid proving service - stateless.
//!
//! Holds no keys. The seller derives their per-auction secp256k1 key client-side
//! (from a wallet signature) and sends it in the request alongside the auction's
//! public params + on-chain bid ciphertexts. The service decrypts the bids,
//! proves the Vickrey outcome (RISC0 Groth16), and returns the seal - which the
//! seller then submits to `finalize`. Set `BONSAI_API_KEY` + `BONSAI_API_URL` to
//! prove on Bonsai instead of locally (no code change).
//!
//!   cargo run -p auction-server --release

use auction_core::{parse_journal, AuctionInput};
use auction_methods::{AUCTION_ELF, AUCTION_ID};
use axum::{
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use risc0_ethereum_contracts::encode_seal;
use risc0_zkvm::{default_prover, sha::Digest, ExecutorEnv, ProverOpts};
use serde::{Deserialize, Serialize};
use tower_http::cors::CorsLayer;

#[derive(Deserialize)]
struct ProveReq {
    /// Per-auction secp256k1 secret key (hex, 32 bytes) - derived client-side,
    /// never persisted by this service.
    owner_sk: String,
    auction_id: u64,
    /// u128 as decimal strings (JSON numbers can't hold u128 precisely).
    reserve: String,
    deposit: String,
    /// Bid ciphertexts in on-chain storage order (hex, optional 0x prefix).
    ciphertexts: Vec<String>,
}

#[derive(Serialize)]
struct ProveResp {
    seal: String,
    winner_index: u32,
    second_price: String,
    image_id: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/api/v1/generate-proof", post(generate_proof))
        .layer(CorsLayer::permissive());

    let port = std::env::var("PORT").unwrap_or_else(|_| "8000".to_string());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    println!("orbid prover (stateless) listening on :{port}");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn generate_proof(
    Json(req): Json<ProveReq>,
) -> Result<Json<ProveResp>, (StatusCode, String)> {
    // Proving is CPU-bound and long; keep it off the async runtime.
    tokio::task::spawn_blocking(move || prove(req))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map(Json)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))
}

fn prove(req: ProveReq) -> anyhow::Result<ProveResp> {
    let sk = hex::decode(req.owner_sk.trim().trim_start_matches("0x"))?;
    anyhow::ensure!(sk.len() == 32, "owner_sk must be 32 bytes");
    let reserve: u128 = req.reserve.parse()?;
    let deposit: u128 = req.deposit.parse()?;
    let ciphertexts: Vec<Vec<u8>> = req
        .ciphertexts
        .iter()
        .map(|c| hex::decode(c.trim_start_matches("0x")))
        .collect::<Result<_, _>>()?;

    let input = AuctionInput {
        sk,
        auction_id: req.auction_id,
        ciphertexts,
        reserve,
        deposit,
    };

    let env = ExecutorEnv::builder().write(&input)?.build()?;
    let receipt = default_prover()
        .prove_with_opts(env, AUCTION_ELF, &ProverOpts::groth16())?
        .receipt;
    receipt.verify(AUCTION_ID)?;

    let journal_bytes: Vec<u8> = receipt.journal.decode()?;
    let outcome = parse_journal(&journal_bytes).map_err(anyhow::Error::msg)?;
    let seal = encode_seal(&receipt)?;
    Ok(ProveResp {
        seal: hex::encode(seal),
        winner_index: outcome.winner_index,
        second_price: outcome.second_price.to_string(),
        image_id: hex::encode(Digest::from(AUCTION_ID).as_bytes()),
    })
}
