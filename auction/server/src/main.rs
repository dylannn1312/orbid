//! General RISC0 proving service - stateless, program-agnostic (Bonsai-style).
//!
//! Holds no keys and knows nothing about any specific guest. A client uploads a
//! guest ELF + the already-serialized input stream (RISC0 word serde), the
//! service proves it (Groth16) and returns the seal, the raw journal, and the
//! image id it computed from the ELF. The client decodes the journal itself.
//!
//! For Orbid the caller is the frontend: it serializes its `AuctionInput`, ships
//! the bundled guest ELF, and parses `winner_index`/`second_price` out of the
//! returned journal. Set `BONSAI_API_KEY` + `BONSAI_API_URL` to prove on Bonsai
//! instead of locally (no code change).
//!
//!   cargo run -p auction-server --release
//!
//!   POST /api/v1/generate-proof
//!     { "elf": "<base64>", "input": "<base64>", "receipt_kind": "groth16" }
//!   -> { "seal": "<hex>", "journal": "<hex>", "image_id": "<hex>" }

use axum::{
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use risc0_ethereum_contracts::encode_seal;
use risc0_zkvm::{compute_image_id, default_prover, ExecutorEnv, ProverOpts};
use serde::{Deserialize, Serialize};
use tower_http::cors::CorsLayer;

/// Proof kind requested by the caller.
#[derive(Deserialize, Default)]
#[serde(rename_all = "lowercase")]
enum ReceiptKind {
    #[default]
    Groth16,
}

#[derive(Deserialize)]
struct ProveReq {
    /// Guest RISC-V ELF (base64). Its SHA-256 image id is computed here and
    /// returned; the client deploys the matching id on-chain.
    elf: String,
    /// Serialized guest input stream (base64 of RISC0 word serde, LE bytes).
    input: String,
    /// Proof kind. Only "groth16" is supported (on-chain verifiable seal).
    #[serde(default)]
    receipt_kind: ReceiptKind,
}

#[derive(Serialize)]
struct ProveResp {
    /// Groth16 seal, ABI-encoded for the on-chain verifier (hex).
    seal: String,
    /// Raw journal bytes as committed by the guest (hex). The client decodes it.
    journal: String,
    /// Image id computed from the uploaded ELF (hex).
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
    println!("risc0 prover (stateless, general) listening on :{port}");
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
    // Only Groth16 is supported; the enum makes other variants unreachable.
    let ReceiptKind::Groth16 = req.receipt_kind;

    let elf = B64.decode(req.elf.trim())?;
    let input_bytes = B64.decode(req.input.trim())?;
    anyhow::ensure!(
        input_bytes.len() % 4 == 0,
        "input length {} is not a multiple of 4 (must be a RISC0 word stream)",
        input_bytes.len()
    );

    let image_id = compute_image_id(&elf)?;

    // The input is already a serialized RISC0 word stream; feed the words raw.
    let words: Vec<u32> = input_bytes
        .chunks_exact(4)
        .map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();
    let env = ExecutorEnv::builder().write_slice(&words).build()?;

    let receipt = default_prover()
        .prove_with_opts(env, &elf, &ProverOpts::groth16())?
        .receipt;
    receipt.verify(image_id)?;

    let seal = encode_seal(&receipt)?;
    Ok(ProveResp {
        seal: hex::encode(seal),
        journal: hex::encode(&receipt.journal.bytes),
        image_id: hex::encode(image_id.as_bytes()),
    })
}
