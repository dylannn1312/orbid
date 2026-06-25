#!/usr/bin/env bash
# Deploy the Orbid stack to Stellar testnet (deploy only - no bids/proving).
#
#   - persists the auctioneer secp256k1 key (.owner-key.json, gitignored)
#   - derives the Vickrey guest image id
#   - deploys: RISC0 Groth16 verifier (or reuse $VERIFIER), mock USDC, NFT, auction
#   - writes soroban/deployment.json
#
# For the full lifecycle + a real proof, use scripts/e2e.sh instead.
# Prereqs: stellar CLI, RISC0 toolchain, node, a funded `orbid` identity.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NET="${NETWORK:-testnet}"
ID="${IDENTITY:-orbid}"

echo "▶ ensuring funded identity '$ID' on $NET"
stellar keys address "$ID" >/dev/null 2>&1 || stellar keys generate "$ID" --network "$NET" --fund
OWNER="$(stellar keys address "$ID")"
echo "  owner = $OWNER"

echo "▶ loading auctioneer secp256k1 key (.owner-key.json)"
OWNER_PUB="$(cd "$ROOT/interop" && node gen-owner-key.mjs pub)"
echo "  owner_pubkey = $OWNER_PUB"

echo "▶ deriving guest image id"
IMAGE_ID="$(cd "$ROOT/auction" && cargo run -q -p auction-host --release -- image-id 2>/dev/null | tail -1)"
[ -n "$IMAGE_ID" ] || { echo "failed to derive image id"; exit 1; }
echo "  image_id = $IMAGE_ID"

echo "▶ building contracts"
( cd "$ROOT/soroban" && stellar contract build >/dev/null )

VERIFIER="${VERIFIER:-}"
if [ -z "$VERIFIER" ]; then
  echo "▶ building + deploying RISC0 Groth16 verifier"
  ( cd "$ROOT/risc0-verifier" && stellar contract build --package groth16-verifier >/dev/null )
  VERIFIER="$(stellar contract deploy \
    --wasm "$ROOT/risc0-verifier/target/wasm32v1-none/release/groth16_verifier.wasm" \
    --source "$ID" --network "$NET")"
fi
echo "  verifier = $VERIFIER"

echo "▶ deploying mock USDC + NFT + auction"
USDC="$(stellar contract deploy --wasm "$ROOT/soroban/target/wasm32v1-none/release/orbid_token.wasm" \
  --source "$ID" --network "$NET" -- --decimals 7 --name '"Mock USDC"' --symbol '"USDC"')"
NFT="$(stellar contract deploy --wasm "$ROOT/soroban/target/wasm32v1-none/release/orbid_nft.wasm" \
  --source "$ID" --network "$NET" -- --admin "$OWNER")"
AUCTION="$(stellar contract deploy --wasm "$ROOT/soroban/target/wasm32v1-none/release/orbid_auction.wasm" \
  --source "$ID" --network "$NET" \
  -- --image_id "$IMAGE_ID" --verifier "$VERIFIER" --payment_token "$USDC")"

cat > "$ROOT/soroban/deployment.json" <<JSON
{
  "network": "$NET",
  "owner": "$OWNER",
  "owner_pubkey": "$OWNER_PUB",
  "image_id": "$IMAGE_ID",
  "verifier": "$VERIFIER",
  "usdc": "$USDC",
  "nft": "$NFT",
  "auction": "$AUCTION"
}
JSON

echo "✅ deployed. wrote soroban/deployment.json"
echo "  usdc=$USDC"
echo "  nft=$NFT"
echo "  auction=$AUCTION"
echo
echo "next:"
echo "  • prover service:  cd auction && ORBID_OWNER_SK=\$(cd ../interop && node gen-owner-key.mjs sk) cargo run -p auction-server --release"
echo "  • frontend env:    set NEXT_PUBLIC_{AUCTION,USDC,NFT}_CONTRACT + NEXT_PUBLIC_OWNER_ADDRESS from above"
echo "  • create a lot:    invoke nft.mint then auction.create_auction (see scripts/e2e.sh for exact calls)"
