#!/usr/bin/env bash
# Orbid end-to-end on Stellar testnet with a REAL RISC0 proof.
#
# Proves the whole pipeline integrates: deploy contracts -> create auction ->
# place real encrypted bids -> generate a Groth16 proof of the Vickrey outcome
# off-chain -> finalize on-chain (the contract reconstructs the journal from its
# own state and cross-contract-verifies) -> assert settlement.
#
# The owner secp256k1 keypair + the bid ciphertexts come from interop/vector.json
# (so the on-chain ciphertexts are byte-identical to what the prover sees).
#
# Prereqs: stellar CLI, RISC0 toolchain + Docker, node, a funded `orbid` identity.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NET="${NETWORK:-testnet}"
OWNER_ID="${IDENTITY:-orbid}"
# Generic RISC0 Groth16 verifier (deployed in spike 1; override with VERIFIER=...).
VERIFIER="${VERIFIER:-CBEOYF73R45GARVCE5YXE6SA6UAHAETSICKCOH5BH2UG5XOHCYQHLTBV}"
RESERVE=10
DEPOSIT=1000
DURATION=90
jqn() { node -e "process.stdout.write(String(require('$ROOT/interop/vector.json').$1))"; }

echo "▶ generating fresh auction vector (bids 100 70 50)"
( cd "$ROOT/interop" && node encrypt.mjs 100 70 50 >/dev/null )
OWNER_PUB="$(jqn pub)"
N=$(node -e "console.log(require('$ROOT/interop/vector.json').ciphertexts.length)")

echo "▶ deriving Vickrey guest image id"
IMAGE_ID="$(cd "$ROOT/auction" && VECTOR="$ROOT/interop/vector.json" cargo run -q -p auction-host --release 2>/dev/null | sed -n 's/^image_id (AUCTION_ID) = 0x//p' | head -1)"
[ -n "$IMAGE_ID" ] || { echo "failed to derive image id"; exit 1; }
echo "  image_id = $IMAGE_ID"

stellar keys address "$OWNER_ID" >/dev/null 2>&1 || stellar keys generate "$OWNER_ID" --network "$NET" --fund
OWNER="$(stellar keys address "$OWNER_ID")"
echo "  owner = $OWNER"

echo "▶ deploying mock USDC + NFT + auction"
USDC="$(stellar contract deploy --wasm "$ROOT/soroban/target/wasm32v1-none/release/orbid_token.wasm" \
  --source "$OWNER_ID" --network "$NET" -- --decimals 7 --name '"Mock USDC"' --symbol '"USDC"')"
NFT="$(stellar contract deploy --wasm "$ROOT/soroban/target/wasm32v1-none/release/orbid_nft.wasm" \
  --source "$OWNER_ID" --network "$NET" -- --admin "$OWNER")"
AUCTION="$(stellar contract deploy --wasm "$ROOT/soroban/target/wasm32v1-none/release/orbid_auction.wasm" \
  --source "$OWNER_ID" --network "$NET" \
  -- --image_id "$IMAGE_ID" --verifier "$VERIFIER")"
echo "  usdc=$USDC  nft=$NFT  auction=$AUCTION"

echo "▶ minting NFT lot to owner + creating auction"
TOKEN_ID="$(stellar contract invoke --id "$NFT" --source "$OWNER_ID" --network "$NET" \
  -- mint --to "$OWNER" --name '"Orbid Genesis #1"' --uri '"ipfs://art/1"')"
TOKEN_ID="${TOKEN_ID//\"/}"
AUCTION_ID="$(stellar contract invoke --id "$AUCTION" --source "$OWNER_ID" --network "$NET" \
  -- create_auction --seller "$OWNER" --owner_pubkey "$OWNER_PUB" --payment_token "$USDC" --nft "$NFT" --token_id "$TOKEN_ID" --reserve "$RESERVE" --deposit "$DEPOSIT" --duration "$DURATION")"
echo "  token_id=$TOKEN_ID  auction_id=$AUCTION_ID"

echo "▶ funding $N bidders + placing sealed bids"
for i in $(seq 0 $((N-1))); do
  BID_ID="orbid-b$i"
  stellar keys address "$BID_ID" >/dev/null 2>&1 || stellar keys generate "$BID_ID" --network "$NET" --fund
  BADDR="$(stellar keys address "$BID_ID")"
  stellar contract invoke --id "$USDC" --source "$BID_ID" --network "$NET" -- mint --to "$BADDR" --amount 5000 >/dev/null
  CT="$(node -e "console.log(require('$ROOT/interop/vector.json').ciphertexts[$i])")"
  stellar contract invoke --id "$AUCTION" --source "$BID_ID" --network "$NET" \
    -- place_bid --bidder "$BADDR" --auction_id "$AUCTION_ID" --ciphertext "$CT" >/dev/null
  echo "  bid $i placed by $BADDR"
done

echo "▶ generating REAL Groth16 proof (this takes ~3 min)"
PROVE_OUT="$(cd "$ROOT/auction" && VECTOR="$ROOT/interop/vector.json" cargo run -q -p auction-host --release -- prove 2>/dev/null)"
WINNER_INDEX="$(echo "$PROVE_OUT" | sed -n 's/^winner_index *= *//p' | head -1)"
SECOND_PRICE="$(echo "$PROVE_OUT" | sed -n 's/^second_price *= *//p' | head -1)"
SEAL="$(echo "$PROVE_OUT" | sed -n 's/^seal *= *0x//p' | head -1)"
echo "  winner_index=$WINNER_INDEX second_price=$SECOND_PRICE seal_len=${#SEAL}"

echo "▶ finalizing on-chain (contract reconstructs journal + verifies proof)"
stellar contract invoke --id "$AUCTION" --source "$OWNER_ID" --network "$NET" \
  -- finalize --auction_id "$AUCTION_ID" --winner_index "$WINNER_INDEX" --second_price "$SECOND_PRICE" --seal "$SEAL"

echo "▶ asserting settlement"
WINNER_ADDR="$(stellar keys address orbid-b"$WINNER_INDEX")"
NFT_OWNER="$(stellar contract invoke --id "$NFT" --source "$OWNER_ID" --network "$NET" -- owner_of --token_id "$TOKEN_ID")"
NFT_OWNER="${NFT_OWNER//\"/}"
echo "  nft owner = $NFT_OWNER (expected winner $WINNER_ADDR)"
[ "$NFT_OWNER" = "$WINNER_ADDR" ] || { echo "❌ NFT not transferred to winner"; exit 1; }

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
echo "✅ E2E PASSED - real proof verified on-chain, NFT settled to winner. Wrote soroban/deployment.json"
