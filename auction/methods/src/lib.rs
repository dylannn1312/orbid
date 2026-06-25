//! Generated guest artifacts.
//!
//! `risc0_build::embed_methods()` writes `methods.rs` into `OUT_DIR` exposing,
//! for the guest binary named `auction`:
//! - `AUCTION_ELF: &[u8]`   - the compiled guest RISC-V ELF
//! - `AUCTION_ID: [u32; 8]` - the image id (the program's cryptographic identity;
//!   the on-chain verifier checks proofs against this id)
//! - `AUCTION_PATH: &str`   - path to the ELF on disk
include!(concat!(env!("OUT_DIR"), "/methods.rs"));
