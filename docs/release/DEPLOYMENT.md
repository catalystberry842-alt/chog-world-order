# Chog World Order: Monad mainnet release guide

**Status: prepared, not deployed.** No CampaignPayments contract exists on Monad mainnet, no address or transaction hash has been produced, and no real payment has been made. Every step that spends funds or changes production is marked **[APPROVAL GATE]** and must not be run without explicit written authorization from the project owner.

Related documents:

- [`RUNBOOK.md`](RUNBOOK.md): pausing, incidents, rollback.
- [`RISKS.md`](RISKS.md): outstanding security and operational risks, including the incomplete contract review.
- [`production.env.template`](production.env.template): every environment variable, with placeholders.
- [`../../contracts/README.md`](../../contracts/README.md): contract interface and design.

---

## 0. Go / no-go gates

Do not start section 4 (deployment) until every item is checked:

- [ ] **External audit** of `contracts/src/CampaignPayments.sol` completed by an independent auditor, and every finding resolved or formally accepted. (Not done. See RISKS.md R1.)
- [ ] Release commit chosen and tagged. All tests pass at that commit (section 2).
- [ ] Admin multisig created on Monad mainnet and its signers confirmed (section 3).
- [ ] Production database provisioned, backed up, and migrations applied (section 7).
- [ ] Monad chain facts in section 1 re-checked against docs.monad.xyz on the day of deployment.
- [ ] Explicit written approval to deploy, naming the release commit, the admin address, and the deployer address.

---

## 1. Monad mainnet facts (verified against official documentation)

Checked on 2026-10-10 through search results quoting docs.monad.xyz. Direct access to docs.monad.xyz was blocked from the preparation environment, so the operator must re-check these items on the day.

| Fact | Value | Source / status |
| --- | --- | --- |
| Chain ID | **143** (`0x8f`) | docs.monad.xyz (current facts, add-to-wallet). Matches `viem/chains` `monad` and `PAYMENTS_CHAIN_ID` in the app. Testnet is 10143. Never use it here. |
| Native currency | MON, 18 decimals | docs.monad.xyz |
| Public RPC | `https://rpc.monad.xyz` (also `rpc1`–`rpc3.monad.xyz`, `rpc-mainnet.monadinfra.com`) | docs.monad.xyz network information. Rate-limited. Use a dedicated provider for production. |
| Explorers | MonadVision (`monadvision.com`), Monadscan (`monadscan.com`), Socialscan | docs.monad.xyz |
| Block time | 400 ms | docs.monad.xyz, viem chain definition |
| Finality | Speculative after 1 slot; **full finality after 2 slots (~800 ms)**. The `latest` tag means *Proposed*, and the `finalized` tag means fully final. | docs.monad.xyz (MonadBFT, block states, mainnet changelog) |
| `eth_getLogs` range | **100 blocks per call** on the Monad Foundation and QuickNode RPCs, and 1,000 on Alchemy and Ankr (configured per node operator) | docs.monad.xyz RPC limits |
| Gas | **Charged on gas limit, not gas used** (`value + gas_bid × gas_limit`) | docs.monad.xyz, differences from Ethereum |
| Max contract size | 128 KB (CampaignPayments runtime: 3,409 bytes) | docs.monad.xyz |
| EVM fork | **Not confirmed** from the official docs during preparation | See below |

**How the app follows these facts:**

- **Payments count only when final.** A payment or registration is confirmed only when its block is at or below Monad's `finalized` head and at least `PAYMENT_CONFIRMATIONS` deep (`confirmedHead` in `src/server/payments/verify.ts`).
- **The indexer stays within the RPC limit.** It reads logs in chunks of `INDEXER_MAX_BLOCK_RANGE` (default 100).
- **No log scans for interrupted registrations.** Those are confirmed from `campaignOwner` contract state.

**EVM target:** the contract is compiled with `evm_version = "cancun"`. The runtime bytecode is byte-for-byte identical when compiled for `shanghai`, `cancun`, or `prague`, because the contract uses no Cancun- or Prague-specific opcodes, so the release does not depend on which fork Monad implements. The earliest fork it needs is Shanghai (PUSH0).

---

## 2. Toolchain, dependencies, and tests

### Pinned versions

| Component | Version | Where pinned |
| --- | --- | --- |
| Solidity compiler | 0.8.28 | `contracts/foundry.toml` (`solc_version`) |
| EVM target | cancun | `contracts/foundry.toml` |
| Optimizer | enabled, 200 runs | `contracts/foundry.toml` |
| Metadata hash | `bytecode_hash = "none"` | `contracts/foundry.toml` (see section 6) |
| OpenZeppelin Contracts | v5.6.1 (`5fd1781b1454fd1ef8e722282f86f9293cacf256`) | git submodule + `contracts/foundry.lock` |
| forge-std | v1.16.2 (`bf647bd6046f2f7da30d0c2bf435e5c76a780c1b`) | git submodule + `contracts/foundry.lock` |
| Foundry | 1.5.1 (used for preparation) | operator machine |
| Node.js | 22+ | `package.json` engines / README |
| Next.js / viem / Prisma | 16.4.0 / 2.56.9 / 7.10.0 | `package-lock.json` |

### ABI

`src/lib/contracts/campaign-payments-abi.ts` is generated from the Foundry build (`npm run contracts:abi`). Regenerate after any contract change and commit the result. Confirm there is no diff at the release commit:

```bash
npm run contracts:build && npm run contracts:abi && git diff --exit-code src/lib/contracts/campaign-payments-abi.ts
```

### Run every test at the release commit

```bash
git checkout <release-tag>
git submodule update --init --recursive
npm ci
npx prisma validate
npm run typecheck
npm run lint
FOUNDRY_OFFLINE=true npm run contracts:test        # Foundry suite

# Application tests with a disposable Postgres and a local chain (both required for full coverage):
anvil --chain-id 143 --slots-in-an-epoch 1 &        # finalized = latest - 2, like Monad
DATABASE_URL=postgresql://…/chog_test npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://…/chog_test ANVIL_RPC_URL=http://127.0.0.1:8545 npm test
npm run build
```

Nothing may be skipped. Without `TEST_DATABASE_URL` or `ANVIL_RPC_URL` the Postgres and end-to-end suites are skipped and the run is incomplete.

---

## 3. Wallets, funding, tokens, and permissions

### Roles

| Role | What it is | Holds | Powers |
| --- | --- | --- | --- |
| **Deployer** | A fresh EOA used once to send the deployment transaction | Only enough MON for deployment gas | None after deployment. The deployer is **not** the owner. |
| **Admin (owner)** | A multisig on Monad mainnet (e.g. a 2-of-3 or 3-of-5 Safe), set as `CAMPAIGN_PAYMENTS_ADMIN` | Nothing (the contract holds no funds) | `setSupportedToken`, `transferOwnership` / `acceptOwnership` (two-step) |
| **Campaign owners** | Users' own wallets | Their own MON/USDC | Register campaigns and pay creators from their own balance |
| **App server** | Next.js deployment | No keys at all | Read-only RPC access. It never signs transactions. |

**What the admin can and cannot do (from the contract source):**

- **Can:** add or remove a supported ERC-20 token, and start or accept an ownership transfer.
- **Cannot:** move, freeze or redirect anyone's funds (the contract holds none); pay on behalf of a campaign; register campaigns for others; upgrade the contract (it is not upgradeable); pause native MON payments (no pause function exists); renounce ownership (it reverts).

The deploy script refuses an EOA admin unless `ALLOW_EOA_ADMIN=true` is set. Use a multisig. Confirm that Safe (or your chosen multisig) is deployed and supported on Monad mainnet before relying on it (RISKS.md R7).

### Deployer funding

Measured on a local Monad-configured chain: the deployment uses about **1.10M gas** (forge estimate for the script). Monad charges the **gas limit**, and forge sets the limit to estimate × 1.3 by default, so budget for:

```text
required MON ≈ 1,430,000 × gas price (wei) / 1e18
```

Read the current gas price on the day (`cast gas-price --rpc-url $MONAD_RPC_URL`), fund the deployer with **2×** the result, and send any remainder back afterwards. Do not fund it more than needed.

### Key handling

- Create the deployer key on the operator's machine with an encrypted Foundry keystore (`cast wallet new` then `cast wallet import deployer --interactive`) or use a hardware wallet (`--ledger` / `--trezor`).
- **Never** paste a private key or seed phrase into a terminal argument, environment file, CI variable, chat, or this repository.
- `.gitignore` excludes `.env*`, `*.key`, `*keystore*`, `*.pem`, `/secrets/`, and `contracts/broadcast/`.

### Supported tokens

- **MON (native)** works from deployment. No configuration is needed.
- **USDC** is off unless configured. To enable it:
  1. Take the Monad mainnet USDC address **only** from Circle's official documentation, and record the source URL in the release notes.
  2. Check it has code and the expected `symbol()` / `decimals()` (6): `cast call <usdc> "decimals()(uint8)" --rpc-url $MONAD_RPC_URL`.
  3. **[APPROVAL GATE]** From the admin multisig, call `setSupportedToken(<usdc>, true)`. Get the calldata with `cast calldata "setSupportedToken(address,bool)" <usdc> true` and submit it through the multisig UI as a contract interaction with the CampaignPayments address.
  4. Set `NEXT_PUBLIC_USDC_ADDRESS` in the app and redeploy.
- **Do not list** fee-on-transfer, rebasing, or hook-based tokens. `payToken` reverts unless the creator receives exactly `amount`.
- USDC can blocklist addresses. A blocklisted creator or payer causes `payToken` to revert (no funds lost).

---

## 4. Deploy the contract

### 4.1 Reproducible build

```bash
git checkout <release-tag>
git submodule update --init --recursive
cd contracts
FOUNDRY_OFFLINE=true forge build --force
forge inspect CampaignPayments deployedBytecode | cast keccak    # record this hash in the release notes
```

At the preparation commit, the local build's runtime bytecode hash was `0x8087e031b7911df344aaade1bab22e2340f9fc0c54ed5ee4ea7f2e00d50213d8`. This describes the source build, not a deployment. Any rebuild of the release commit must reproduce it. A different hash means a different compiler, setting, or dependency, so stop and investigate.

### 4.2 Simulate (no transaction is sent)

```bash
export MONAD_RPC_URL=https://<provider-or-public-rpc>
export CAMPAIGN_PAYMENTS_ADMIN=0x<admin-multisig>
cast chain-id --rpc-url $MONAD_RPC_URL                 # must print 143

forge script script/DeployCampaignPayments.s.sol:DeployCampaignPayments \
  --rpc-url $MONAD_RPC_URL --account deployer --sender 0x<deployer-address>
```

Check the output: `chain id: 143`, the expected deployer and admin, and the estimated gas. The script stops if the chain is not 143, the admin is unset, or the admin is not a contract.

### 4.3 **[APPROVAL GATE]** Broadcast

Only with written approval that names the release commit, deployer, and admin:

```bash
forge script script/DeployCampaignPayments.s.sol:DeployCampaignPayments \
  --rpc-url $MONAD_RPC_URL --account deployer --sender 0x<deployer-address> --broadcast
```

From `contracts/broadcast/DeployCampaignPayments.s.sol/143/run-latest.json`, record:

- the contract address (`transactions[0].contractAddress`)
- the deployment transaction hash (`transactions[0].hash`)
- the deployment block (`receipts[0].blockNumber`, hex)

Store them in the release notes. The broadcast directory is git-ignored; archive it with the release notes. Then return unused MON from the deployer.

---

## 5. Verify the deployment (read-only, before configuring the app)

### 5.1 Automated checks

```bash
npm run contracts:build
MONAD_RPC_URL=$MONAD_RPC_URL \
NEXT_PUBLIC_CAMPAIGN_PAYMENTS_ADDRESS=0x<deployed> \
CAMPAIGN_PAYMENTS_ADMIN=0x<admin-multisig> \
CAMPAIGN_PAYMENTS_DEPLOY_BLOCK=<block> \
DEPLOY_TX_HASH=0x<deploy-tx> \
npm run release:verify-contract
```

`scripts/verify-deployment.mjs` sends no transactions. It checks:

- chain ID 143
- the contract has code
- **the on-chain runtime bytecode equals the local build byte-for-byte**
- `owner()` is the admin, with no pending owner
- `NATIVE_TOKEN()` is address(0)
- `computeCampaignId` matches the app's calculation
- the deployment receipt succeeded, created this address, and is in `CAMPAIGN_PAYMENTS_DEPLOY_BLOCK`
- the USDC address has code, if set

It exits non-zero on any failure. Do not continue unless every check passes.

The app runs a similar check before every registration and payment: chain 143, code present, and `computeCampaignId` agreeing. If it fails, it answers `503 contract_unverified` instead of giving wallets an address.

### 5.2 Source verification on explorers

Per the Monad docs Foundry guide (Sourcify via MonadVision):

```bash
cd contracts
forge verify-contract 0x<deployed> src/CampaignPayments.sol:CampaignPayments \
  --chain 143 \
  --verifier sourcify \
  --verifier-url <Sourcify API URL from docs.monad.xyz/guides/verify-smart-contract/foundry> \
  --constructor-args $(cast abi-encode "constructor(address)" 0x<admin-multisig>)
```

For Monadscan, use the Etherscan v2 API (`--verifier etherscan --etherscan-api-key <key> --chain 143`).

- **Confirm both verifier URLs and flags against the official guide on the day.** The exact Sourcify endpoint could not be fetched during preparation.
- Because `bytecode_hash = "none"`, the bytecode carries no metadata hash, so Sourcify can report a *partial* rather than *exact* match. That is expected.
- Byte-for-byte equality is proven by section 5.1 regardless.
- The verify command may print an error even when verification succeeded, so always check the explorer page.

Then confirm on MonadVision and Monadscan:

- the source shows as verified
- the creator is the deployer
- the constructor argument is the admin
- `owner()` is the admin

---

## 6. Configure the production application

1. **Database first** (section 7): back up, then apply migrations.
2. **Set environment variables** in the hosting provider's secret store, Production scope, from [`production.env.template`](production.env.template):
   - Required for the app: `APP_ORIGIN`, `SESSION_SECRET`, `DATABASE_URL` (pooled), and `MONAD_RPC_URL` (a dedicated provider is recommended).
   - Required for payments: `NEXT_PUBLIC_CAMPAIGN_PAYMENTS_ADDRESS`, `CAMPAIGN_PAYMENTS_DEPLOY_BLOCK`, `CRON_SECRET`, and `PAYMENTS_PAUSED=true` for the first deployment (see step 5).
   - Optional: `NEXT_PUBLIC_USDC_ADDRESS`, `ALERT_WEBHOOK_URL`, `PAYMENT_CONFIRMATIONS`, `INDEXER_*`.
3. `NEXT_PUBLIC_*` values are baked in at build time. **Redeploy** after setting or changing them. Server-side variables also take effect only on a new deployment on Vercel.
4. **Indexer schedule:** call `GET /api/indexer/run` with `Authorization: Bearer $CRON_SECRET` every 1–5 minutes. Vercel Hobby cron runs only daily, so use Vercel Pro cron, a GitHub Actions schedule (minimum 5 minutes), or an external scheduler. At 400 ms blocks, Monad produces about 150 blocks per minute. With the defaults (100-block chunks, 50 chunks per run), one run covers about 5,000 blocks, so a run every 5 minutes keeps up with margin. Tune `INDEXER_MAX_CHUNKS_PER_RUN` so one run finishes well within your function time limit.
5. **First production deployment with `PAYMENTS_PAUSED=true`.** Run the post-deployment checklist (section 10), then set `PAYMENTS_PAUSED=false` and redeploy. **[APPROVAL GATE]**
6. **Roles:** after the operators sign in once, grant roles in SQL (there is deliberately no API for this):

   ```sql
   UPDATE "User" SET role = 'ADMIN'    WHERE address = '0x<lowercase admin wallet>';
   UPDATE "User" SET role = 'REVIEWER' WHERE address = '0x<lowercase reviewer wallet>';
   ```

7. **Reputation rules:** after the first deployment of rules version 2026-10.2, an admin runs `POST /api/reputation/recalculate` from a signed-in browser session on the production origin (the endpoint requires the session cookie and a same-origin request).

---

## 7. Database: migrations and backups

Migrations are forward-only (`prisma/migrations/`). The latest, `20261010071804_evidence_dedupe_keys`, rewrites stored data, and **its effect cannot be undone without a backup**.

### Before every production migration

```bash
# 1. Backup with the DIRECT (non-pooled) connection string. Store it encrypted, off the database host.
pg_dump --format=custom --no-owner --dbname "$DIRECT_DATABASE_URL" --file chog-$(date -u +%Y%m%dT%H%M%SZ).dump

# 2. Confirm the dump is readable.
pg_restore --list chog-*.dump | head

# 3. See what will run.
DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma migrate status

# 4. Apply.
DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma migrate deploy

# 5. Check for drift.
DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

- Enable the provider's point-in-time recovery and daily backups. Keep at least 14 days.
- **Test a restore** into a scratch database before launch and quarterly afterwards:

  ```bash
  createdb chog_restore_test && pg_restore --no-owner --dbname chog_restore_test chog-<timestamp>.dump
  ```

- Never run `prisma migrate dev` or `migrate reset` against production.

---

## 8. Logging, error reporting, and indexer recovery

### Logging and alerts

- Server logs are one JSON object per line (`src/server/log.ts`), collected by the host (Vercel Logs or a log drain). Fields named like secrets (cookies, tokens, signatures, keys, passwords, authorization) are redacted.
- `ALERT_WEBHOOK_URL` (https only) receives alerts for:
  - unexpected API errors (`api.unexpected_error`)
  - server rendering errors (`request.error`, via `src/instrumentation.ts`)
  - failed indexer runs (`indexer.run_failed`)

  Alerts never contain request headers or bodies.
- Every indexer run logs `indexer.run` with its block range, cursor, `lagBlocks`, and per-outcome counts.

### Monitoring

Poll `GET /api/indexer/status` (Bearer `CRON_SECRET`) from an uptime monitor. Alert when:

- the HTTP status is not 200
- `lagBlocks` exceeds about 3,000 (about 20 minutes behind)
- `paymentsPaused` is unexpectedly true

Also alert on any `indexer.run_failed` log line.

### Indexer recovery

The indexer is safe to re-run at any time. Raw events are unique per (chain, tx, log index), every payment update is conditional, and the first outcome recorded for an event is kept.

- **RPC outage:** nothing to do. A failed run keeps the last completed chunk, and the next run continues. Each run also re-scans the last `INDEXER_RECONCILE_BLOCKS` blocks.
- **Backlog after a long outage:** call the run endpoint in a loop until it reports `caughtUp: true`:

  ```bash
  until curl -sf -H "Authorization: Bearer $CRON_SECRET" https://<origin>/api/indexer/run | grep -q '"caughtUp":true'; do sleep 2; done
  ```

- **Re-scan a range** (for example, after an RPC returned incomplete logs): move the cursor back, then run the loop above. Re-processing is idempotent.

  ```sql
  UPDATE "IndexerCursor" SET "lastBlock" = <block - 1> WHERE id = 'campaign-payments';
  ```

- **Wrong `CAMPAIGN_PAYMENTS_DEPLOY_BLOCK`:** fix the env var, delete the cursor row (`DELETE FROM "IndexerCursor" WHERE id = 'campaign-payments';`), redeploy, and run the loop.

---

## 9. When is a payment "complete"?

The app shows a payment as paid only when the **server** has verified the on-chain result. The browser never decides.

- **Instructions come from the server.** The owner's wallet signs a call whose recipient, token, amount, campaign ID, and deliverable reference were fixed by the server (`preparePayment`).
- **The browser's hash is only a hint.** The server reads the receipt, requires `status = success`, and decodes `CreatorPaid` only from logs emitted by the configured contract. It then matches campaign, deliverable reference, creator, token, amount, and payer (the campaign owner) against the stored expectation. Anything different is `mismatch` or `failed`, never `confirmed`.
- **Confirmed means final.** The block must be at or below Monad's `finalized` head and at least `PAYMENT_CONFIRMATIONS` deep. Until then the status is `pending-confirmation`.
- **One proof, one payment.** An on-chain event can prove only one payment (unique `(txHash, logIndex)`), and the contract rejects a second payment for the same deliverable (`DeliverableAlreadyPaid`).
- **Payment is separate from acceptance.** Accepting a deliverable records the contribution and reputation; payment only adds a verified payment record.

**Tests that cover this:**

- `tests/payments.test.ts`: client hash alone, wrong recipient or amount, reverted receipts, wrong contract, interrupted confirmation, duplicates.
- `tests/release-readiness.test.ts`: finality and the pause switch.
- `tests/full-flow.e2e.test.ts`: the real contract on a local chain.

---

## 10. Checklists

### Pre-deployment checklist

- [ ] Section 0 gates all checked, including the **external audit** and **written approval**.
- [ ] Release tag created. `git status` is clean. Submodules are at the pinned revisions (`git submodule status`).
- [ ] All tests pass at the tag, with Postgres and anvil connected (section 2). No skipped suites.
- [ ] `forge build --force` reproduces the recorded runtime bytecode hash (section 4.1).
- [ ] Monad chain facts re-checked on docs.monad.xyz (section 1). `cast chain-id` prints 143.
- [ ] Admin multisig deployed on Monad mainnet; signers and threshold confirmed; a test signature collected.
- [ ] Deployer keystore created on the operator's machine and funded with about 2× the computed gas cost. No key exists anywhere else.
- [ ] Production database provisioned with TLS, PITR enabled, backup taken and **restore tested**, migrations applied, and no drift.
- [ ] Production env vars set with `NEXT_PUBLIC_CAMPAIGN_PAYMENTS_ADDRESS` **empty** and `PAYMENTS_PAUSED=true`.
- [ ] `ALERT_WEBHOOK_URL` tested. Uptime monitor configured. Indexer scheduler ready but not yet pointing at a contract.
- [ ] Incident contacts and the runbook reviewed by everyone on call.

### Post-deployment verification checklist

- [ ] `npm run release:verify-contract` passes every check with the recorded address, admin, block, and deploy transaction.
- [ ] Source verified on MonadVision and Monadscan. Explorer shows the expected admin as `owner()`.
- [ ] Unused MON returned from the deployer. The deployer is retired (it has no powers).
- [ ] App env updated (`NEXT_PUBLIC_CAMPAIGN_PAYMENTS_ADDRESS`, `CAMPAIGN_PAYMENTS_DEPLOY_BLOCK`), still `PAYMENTS_PAUSED=true`, and redeployed.
- [ ] `GET /api/indexer/status` returns `status: ok`, the correct contract, and a cursor advancing toward `confirmedHead`. A run returns `caughtUp: true`.
- [ ] Security headers present on the production origin: `curl -sI https://<origin> | grep -iE "content-security|x-frame|strict-transport"`.
- [ ] Sign-in works on the production origin. Admin and reviewer roles granted. Reputation recalculated once.
- [ ] Publishing while paused returns "paused". Publishing with the contract configured and payments unpaused shows registration instructions. **[APPROVAL GATE]** Lift the pause only with approval.
- [ ] **[APPROVAL GATE] Controlled first payment:** a small campaign between team wallets, paying the minimum amount, only with explicit approval. Confirm, in order:
  - the wallet shows the exact recipient and amount
  - the payment stays `pending-confirmation` until finality
  - it then shows `confirmed` with an explorer link
  - the creator's Passport shows the payment
  - `CreatorPaid` appears on the explorer with matching fields
  - a second payment attempt is rejected (`DeliverableAlreadyPaid`)
- [ ] Alerts fire for a deliberate indexer failure. Test this on a staging copy pointed at an unreachable RPC; an authentication error from a wrong `CRON_SECRET` is not an indexer failure and does not alert.
- [ ] Release notes record the contract address, deployment transaction, block, bytecode hash, admin, toolchain versions, and approvals.
