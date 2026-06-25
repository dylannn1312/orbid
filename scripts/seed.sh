#!/usr/bin/env bash
# Seed demo auction lots (no proving): mint NFTs + tokens, open live auctions in
# different payment tokens (USDC 7dp, USDT 6dp), and place real Orbid-ECIES
# sealed bids. Amounts are given in whole tokens and scaled to base units here.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NET="${NETWORK:-testnet}"
J() { node -e "process.stdout.write(String(require('$ROOT/soroban/deployment.json').$1))"; }
NFT=$(J nft); AUCTION=$(J auction); USDC=$(J usdc); USDT=$(J usdt)
OWNER_PUB=$(J owner_pubkey); OWNER=$(stellar keys address orbid)

U7=10000000  # 1e7 base units per whole token (USDC, XLM)
U6=1000000   # 1e6 (USDT)

echo "▶ funding bidders with USDC + USDT"
for i in 0 1 2; do
  stellar keys address "orbid-b$i" >/dev/null 2>&1 || stellar keys generate "orbid-b$i" --network "$NET" --fund
  B=$(stellar keys address "orbid-b$i")
  stellar contract invoke --id "$USDC" --source "orbid-b$i" --network "$NET" -- mint --to "$B" --amount $((10000 * U7)) >/dev/null
  stellar contract invoke --id "$USDT" --source "orbid-b$i" --network "$NET" -- mint --to "$B" --amount $((10000 * U6)) >/dev/null
done

create_lot() { # name uri token scale reserve deposit duration bid_b0 [bid_b1 bid_b2]
  local name="$1" uri="$2" token="$3" scale="$4" reserve="$5" deposit="$6" dur="$7"; shift 7
  local tid aid
  tid=$(stellar contract invoke --id "$NFT" --source orbid --network "$NET" -- mint --to "$OWNER" --name "\"$name\"" --uri "\"$uri\"")
  tid=${tid//\"/}
  aid=$(stellar contract invoke --id "$AUCTION" --source orbid --network "$NET" \
    -- create_auction --seller "$OWNER" --owner_pubkey "$OWNER_PUB" --payment_token "$token" \
    --nft "$NFT" --token_id "$tid" --reserve $((reserve * scale)) --deposit $((deposit * scale)) --duration "$dur")
  echo "  $name -> auction $aid (token_id $tid), reserve $reserve deposit $deposit"
  local i=0
  for amt in "$@"; do
    local B; B=$(stellar keys address "orbid-b$i")
    local CT; CT=$(cd "$ROOT/interop" && node enc.mjs "$OWNER_PUB" "$((amt * scale))")
    stellar contract invoke --id "$AUCTION" --source "orbid-b$i" --network "$NET" \
      -- place_bid --bidder "$B" --auction_id "$aid" --ciphertext "$CT" >/dev/null
    echo "    sealed bid by orbid-b$i"
    i=$((i + 1))
  done
}

echo "▶ seeding lots"
create_lot "Orbid Pulsar" "ipfs://art/3" "$USDC" "$U7" 50  2000 172800 320 510 280
create_lot "Orbid Helix"  "ipfs://art/4" "$USDT" "$U6" 100 1500 172800 800 1200
echo "✅ seeded demo lots (USDC + USDT)"
