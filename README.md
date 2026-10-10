# Chog World Order

Passports, contribution reputation, and paid collaborations for people building in the Monad ecosystem.

**Contribute → Verify → Build reputation → Get hired → Complete work → Get paid.**

- **Chog Passport**: a wallet-based identity with illustrated crayon stamps for verified activity, plus contribution history. NFT ownership is optional.
- **Contribution Reputation**: an explainable score where every point traces back to verified work, in an append-only ledger.
- **Collab Board**: projects publish campaigns, creators apply and submit work, owners review it, and pay creators on-chain from their own wallet.

## Status

| Area | State |
| --- | --- |
| Passport (stamps, evidence, profiles) | **Built.** Real data from PostgreSQL when configured |
| Wallet sign-in (Sign-In with Ethereum) | **Built.** Server sessions, no passwords, no seed phrases |
| Evidence verification | **Built** for on-chain receipts and reviewer approval. Campaign work is verified by Collab Board acceptance only |
| Reputation engine and leaderboard | **Built.** Append-only ledger, deterministic recalculation, audited corrections, database leaderboard |
| Collab Board | **Built.** Drafts, publication, applications, deliverables, reviews |
| `CampaignPayments.sol` | **Written and tested (Foundry). Not deployed, not audited.** See [`contracts/README.md`](contracts/README.md) |
| On-chain registration and payments | **Built**, switched off until `NEXT_PUBLIC_CAMPAIGN_PAYMENTS_ADDRESS` is set |

Without a database, the Collab Board shows sample campaigns from `src/lib/mock/`, always labelled "Sample". The leaderboard never ranks sample data. No mock record is presented as verified activity.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Cache Components, Partial Prefetching) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 4 |
| Wallet | wagmi 3, viem 2, TanStack Query 5 (injected / EIP-6963 wallets) |
| Database | PostgreSQL + Prisma 7 (`@prisma/adapter-pg`) |
| Validation | zod 4 |
| Tests | Vitest 5 |
| Contracts | Solidity 0.8.28, Foundry 1.5, OpenZeppelin Contracts 5.6 (git submodules in `contracts/lib`) |

## Mainnet release

Nothing is deployed. The release is prepared in [`docs/release/`](docs/release/):

- [`DEPLOYMENT.md`](docs/release/DEPLOYMENT.md): step-by-step deployment, contract verification, production configuration, database migration and backups, monitoring, checklists.
- [`RUNBOOK.md`](docs/release/RUNBOOK.md): pausing payments, disabling a token, incident response, rollback.
- [`RISKS.md`](docs/release/RISKS.md): outstanding risks, including the external audit that blocks deployment.
- [`production.env.template`](docs/release/production.env.template): every production variable with placeholders.

## Requirements

- Node.js 22 or newer
- npm 10+
- PostgreSQL 14+ for the Passport system (optional: without it the app runs with sample data only)
- Foundry, only to build or test the contract (`git submodule update --init --recursive` first)

## Install and run

```bash
npm install          # also runs `prisma generate`
npm run dev          # http://localhost:3000
```

The app runs without any configuration. Without a database, the Passport API answers `503 not_configured` and the UI says so instead of showing fake data.

### Enable the Passport system

1. Copy `.env.example` to `.env` and fill it in:

   | Variable | Required for | Notes |
   | --- | --- | --- |
   | `DATABASE_URL` | Passports, sign-in, evidence | PostgreSQL connection string |
   | `APP_ORIGIN` | Sign-in, all writes | Exact public origin, e.g. `http://localhost:3000`. Used as the SIWE domain and to reject cross-site requests |
   | `SESSION_SECRET` | Sign-in | 32+ random characters. Signs the sign-in nonce cookie |
   | `MONAD_RPC_URL` | On-chain evidence, registration and payment verification | Monad mainnet RPC. Without it, on-chain claims are stored as `unavailable` and payments stay unverified |
   | `NEXT_PUBLIC_CAMPAIGN_PAYMENTS_ADDRESS` | On-chain campaigns and payments | Deployed `CampaignPayments` address. Empty: campaigns publish off-chain and payment endpoints answer `503 payments_not_configured` |
   | `CAMPAIGN_PAYMENTS_DEPLOY_BLOCK` | Indexer | Block the contract was deployed in. The indexer starts there |
   | `PAYMENT_CONFIRMATIONS` | Registration and payments | Blocks required before an event counts. Default `2` |
   | `CRON_SECRET` | Indexer endpoint | 32+ random characters. Schedulers call `/api/indexer/run` with `Authorization: Bearer <CRON_SECRET>` |
   | `NEXT_PUBLIC_USDC_ADDRESS` | USDC campaigns | Monad USDC token address. Empty: only MON budgets are offered. The token must also be allowed in the contract with `setSupportedToken` |
   | `PAYMENTS_PAUSED` | Operations | `true` stops new registration and payment instructions; verification of sent transactions continues |
   | `INDEXER_MAX_BLOCK_RANGE`, `INDEXER_MAX_CHUNKS_PER_RUN`, `INDEXER_RECONCILE_BLOCKS` | Indexer | Defaults 100 / 50 / 500. Keep the range within your RPC's `eth_getLogs` limit (100 on the Monad Foundation public RPC) |
   | `ALERT_WEBHOOK_URL` | Operations | Optional https webhook for unexpected errors and indexer failures |

   Next.js reads `.env*` files; the Prisma CLI reads `.env` through `prisma.config.ts`.

2. Apply the migrations:

   ```bash
   npm run db:deploy      # production / CI
   npm run db:migrate     # local development (creates new migrations when the schema changes)
   ```

3. Grant reviewer access. Reviewers approve off-chain evidence. There is deliberately no API for changing roles; an operator does it in the database after the person has signed in once:

   ```sql
   UPDATE "User" SET role = 'REVIEWER' WHERE address = '0xabc…';   -- lowercase address
   ```

   Admins (`role = 'ADMIN'`) can also post reputation corrections and run full recalculations.

4. To verify on-chain evidence, add reviewed entries to `src/server/verification/supported-apps.ts` (contract addresses and the event that proves an interaction). The list ships empty, so no app is trusted by default.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (also type-checks) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` |
| `npm test` | Unit and API tests (Vitest) |
| `npm run db:validate` | `prisma validate` |
| `npm run db:migrate` / `db:deploy` | Create / apply migrations |
| `npm run contracts:build` / `contracts:test` | `forge build` / `forge test` in `contracts/` |
| `npm run contracts:abi` | Regenerate `src/lib/contracts/campaign-payments-abi.ts` from the Foundry build |

Database integration tests run when `TEST_DATABASE_URL` points at a migrated, disposable database (they truncate its tables):

```bash
TEST_DATABASE_URL=postgresql://… npm test
```

The end-to-end payment test runs the real contract on a local anvil chain (nothing touches Monad):

```bash
npm run contracts:build
anvil --chain-id 143 &
ANVIL_RPC_URL=http://127.0.0.1:8545 npx vitest run tests/anvil.e2e.test.ts
```

## Routes

| Path | What it shows |
| --- | --- |
| `/` | Landing page |
| `/passport` | Your passport: connect, sign in, see stamps, reputation, and history (including pending claims), submit evidence. Also a labelled sample passport |
| `/profile/[address]` | Public passport: stamps, verified contributions only, reputation breakdown. Validates the address and handles missing profiles |
| `/collabs` | Campaign discovery: search, category, sort, pagination (database, or labelled samples without one) |
| `/collabs/[id]` | Campaign details; apply, follow your application, submit deliverables, see payment status |
| `/collabs/dashboard` | Owner dashboard: drafts, publish and register, review applications and deliverables, pay creators |
| `/leaderboard` | Database rankings by total or category, with pagination and the scoring rules |

## API

All responses are JSON with `cache-control: no-store`. Errors look like `{ "error": { "code", "message" } }`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/auth/nonce` | — | One-time SIWE nonce (bound to a signed HttpOnly cookie, 10 min) |
| POST | `/api/auth/verify` | — | Verify a SIWE message + signature, open a session |
| GET | `/api/auth/session` | — | Current session (`authenticated`, `address`, `role`) |
| POST | `/api/auth/logout` | session | Revoke the session |
| GET | `/api/passports/{address}` | — | Public passport. The owner also sees pending/rejected claims |
| GET | `/api/passports/{address}/stamps` | — | Earned stamps |
| GET | `/api/passports/{address}/contributions` | — | Contribution history |
| GET | `/api/stamps` | — | Stamp catalogue |
| POST | `/api/evidence` | session | Submit an evidence claim for the signed-in wallet |
| GET | `/api/evidence?mine=1` | session | Your own claims |
| GET | `/api/evidence?status=pending` | reviewer | Review queue |
| POST | `/api/evidence/{id}/review` | reviewer | `approve` / `reject` (off-chain) or `recheck` (on-chain) |
| POST | `/api/stamps/issue` | reviewer | Re-run issuance for verified evidence (idempotent) |
| GET | `/api/reputation/{address}` | — | Score, tier, rank, breakdown, consistency weeks, snapshots |
| GET | `/api/reputation/{address}/events?page=` | — | Ledger events with their evidence (50 per page) |
| POST | `/api/reputation/{address}/recalculate` | reviewer | Re-run the engine for one passport. Takes no points |
| POST | `/api/reputation/{address}/adjustments` | admin | Correction with points and a reason. Never on your own score |
| POST | `/api/reputation/recalculate` | admin | Recalculate every passport |
| GET | `/api/leaderboard?category=&page=` | — | Database leaderboard (20 per page) |
| GET | `/api/campaigns?q=&category=&sort=&page=` | — | Published campaigns |
| POST | `/api/campaigns` | session | Create a draft owned by the session wallet |
| GET / PATCH | `/api/campaigns/{id}` | — / owner | Campaign (drafts only for their owner) / edit a draft |
| POST | `/api/campaigns/{id}/publish` | owner | Validate and publish. With the contract on, returns registration instructions and stays a draft until verified |
| POST | `/api/campaigns/{id}/registration` | owner | Verify registration; optional `txHash` hint, otherwise searches the chain |
| GET | `/api/campaigns/mine` | session | Owner dashboard data, including payments |
| GET / POST | `/api/campaigns/{id}/applications` | session | Your participation / apply |
| POST | `/api/applications/{id}/review` | owner | Accept or reject an application, with a reason |
| POST | `/api/applications/{id}/deliverables` | applicant | Submit work (URL + content hash) |
| GET | `/api/campaigns/{id}/deliverables` | owner | Deliverables with review history |
| POST | `/api/deliverables/{id}/review` | owner | Accept or reject, with a reason. Acceptance records verified campaign evidence |
| POST | `/api/deliverables/{id}/payment` | owner | Payment instructions for an accepted deliverable |
| POST | `/api/payments/{id}/transaction` | owner | Report the wallet's transaction hash (a hint, verified on the server) |
| GET | `/api/payments/{id}` | owner or creator | Payment status, re-verified while open |
| GET / POST | `/api/indexer/run` | `CRON_SECRET` | Index `CampaignRegistered` and `CreatorPaid` events |

Every write requires an `Origin` header equal to `APP_ORIGIN` and a valid session. The acting wallet always comes from the session: request bodies are strict and reject fields like `address`, `status`, or `points`.

## How the Passport works

### Stamps

| Stamp | Earned by | Verified by |
| --- | --- | --- |
| Monad Explorer | Interaction with a supported Monad app | Transaction receipt and event logs, checked with viem |
| Community Contributor | Approved community contribution | Authorized reviewer |
| Builder | Code contribution | Maintainer (reviewer role) |
| Researcher | Research or technical analysis | Authorized reviewer |
| Collaborator | Accepted campaign deliverable | The campaign owner's acceptance on the Collab Board (manual claims are refused) |
| Consistent Contributor | Verified contributions in 4 distinct ISO weeks | Derived from verified records |

A wallet holds at most one stamp per category. Stamps are database records; minting them as NFTs is optional and not built.

### Evidence lifecycle

```text
submit (signed-in wallet) → handler.prepare (validate + canonicalise + dedupe key)
  → stored as pending → handler.verifyOnSubmit
      on-chain:   verified | rejected | pending (not found yet) | unavailable (no RPC / app not supported)
      off-chain:  pending → reviewer approve/reject
      campaign:   only created by Collab Board acceptance
  → verified → stamps + reputation issued in one transaction
```

- **Duplicates.** Every claim gets a canonical `dedupeKey`, unique across all users. Links are normalised (host case, `www.`, trailing dots, `twitter.com` → `x.com`, repeated slashes, escaped characters, tracking parameters in any case, fragments, PR-number leading zeros; short commit SHAs are refused) and keyed without the claimed kind, so one link earns once. On-chain keys include the claimant's wallet, because only a transaction's sender can verify it; a stranger's claim cannot block the sender. A rejected claim releases its key. Each wallet can have at most 20 claims waiting for review. Stamps are unique per `(user, category)` and `(evidence, category)`, and reputation events per `(evidence, kind)` and per stamp. Issuance is idempotent.
- **Nothing is silently verified.** If a verification source is missing, the record is stored as `unavailable` with a reason.
- **Reviewers** cannot review their own evidence, cannot approve on-chain or campaign evidence, and cannot choose point values. Reviewer notes are never returned by public APIs.
- **Sessions.** The cookie holds a random token; only its SHA-256 hash is stored. Sessions expire after 7 days and are revoked on sign-out. SIWE nonces are single-use (unique in the database).

### Reputation

Reputation is an append-only ledger (`ReputationEvent`). The engine (`src/lib/reputation/engine.ts`) is a pure function of a passport's verified evidence and the versioned rules in `src/lib/reputation/config.ts` (version `2026-10.2`):

| Verified work | Points | Daily cap | Monthly cap |
| --- | --- | --- | --- |
| Accepted campaign deliverable | 10 | 3 | 20 |
| Protocol interaction (on-chain) | 3 | 2 | 10 |
| Content | 5 | 3 | 15 |
| Research | 5 | 2 | 8 |
| Code | 8 | 5 | 30 |

Caps count contributions, not points. Consistency bonus: +2 for each ISO week with verified work, at most 8 per month. Tiers: Curious Chog (0), Chog Scout (10), Chog Contributor (40), Chog Builder (100), Chog Legend (250).

- Evidence is processed in verification order, so recalculating from scratch always gives the same ledger as incremental updates. Changes are written as new events plus reversals; nothing is edited or deleted.
- Every event records its reason, rules version, and supporting evidence. A snapshot is written whenever the score changes.
- Wallet balances, NFTs, transaction volume, applying, publishing, submitting work, and payments earn nothing. Stamps earn nothing on their own.
- Admin corrections are separate `ADJUSTMENT` events with a reason and the acting admin, and are never allowed on the admin's own score.

### Campaign payments

```text
publish → registration pending → owner's wallet: registerCampaign(salt)
        → server verifies CampaignRegistered (receipt or log search, owner, confirmations) → published
accept deliverable → owner: POST /payment → wallet: payNative / payToken (approve first for ERC-20)
        → POST /transaction {txHash} → server verifies → confirmed | pending-confirmation | failed | mismatch
indexer (cron) → reads confirmed blocks only → applies the same checks to every event
```

- Before any registration or payment instructions are issued, the server proves the configured address is CampaignPayments on Monad: the RPC must report chain 143, the address must hold code, and the contract's `computeCampaignId` must match the app's own calculation. Otherwise the endpoints answer `503 contract_unverified`, so a mistyped address can never receive MON.
- Nothing is decided before `PAYMENT_CONFIRMATIONS` blocks, including mismatches. Verified events are stored with the observed token, amount, payer, and creator, whether the browser's report or the indexer found them.
- The server never holds keys or signs transactions. The browser only reports a hash; the server reads the receipt, requires the transaction to target the configured contract, decodes `CreatorPaid` from that contract only, and compares campaign, deliverable reference, recipient, token, amount, and payer with what it expected. Anything different is `mismatch`; reverted or unrelated transactions are `failed`.
- A payment counts after `PAYMENT_CONFIRMATIONS` blocks. One payment per deliverable, and an on-chain event can prove only one payment (unique `(txHash, logIndex)`). Raw events are stored once per `(chain, tx, log index)`.
- The indexer re-scans the last 500 blocks every run and never advances its cursor after an RPC error, so interrupted confirmations and outages catch up. Run it every few minutes with any scheduler (Vercel Hobby cron is limited to once a day).
- Payment is separate from deliverable acceptance: acceptance is what records the contribution and reputation; payment only adds a verified payment record to it.

## Project structure

```text
prisma/                     schema.prisma, migrations/
prisma.config.ts            Prisma 7 config (datasource URL from the environment)
src/
  app/                      Pages and /api route handlers
  components/
    passport/               PassportView, PassportCover, PassportStamp, StampCard,
                            StampCollection, MyPassport (connected wallet)
    evidence/               EvidenceList, EvidenceReference, VerificationStatusBadge,
                            EvidenceClaimForm
    reputation/             ReputationCard, ReputationBar, ScoreEvents
    campaigns/              Cards, filters, detail, creator panel, owner dashboard,
                            onchain-actions (registration + payment flows)
    leaderboard/, layout/, ui/, wallet/
  lib/
    passport/               Shared domain: types, stamp catalogue, issuance rules,
                            address validation, labels
    reputation/             Rules config, engine, tiers
    collabs/                Campaign types, tokens, budget and deadline rules
    contracts/              CampaignPayments ABI (generated) and helpers
    client/                 Browser API client
    mock/                   MOCK DATA (labelled): contributors, evidence, campaigns
  server/                   Server-only
    auth/                   SIWE, sessions, cookies, guards
    passport/               Store interface, Prisma + in-memory stores, service
    reputation/             Recalculation, corrections, leaderboard
    collabs/                Campaign store and service
    payments/               Registration and payment verification, indexer
    verification/           Handlers: on-chain, reviewed, code, campaign; supported apps
    api/                    Request handlers, schemas, HTTP helpers
  generated/prisma/         Generated client (git-ignored)
tests/                      Vitest suites
contracts/                  Foundry project: CampaignPayments.sol, tests, deploy script (not run)
```

## Known limitations

- No rate limiting on the API yet. Add it at the edge or in a proxy before production.
- Roles are granted with SQL; there is no admin UI or reviewer queue page yet (the API supports it).
- `CampaignPayments` is not deployed or audited. On-chain registration and payments stay off until it is.
- There is no reviewer queue page yet; reviewers use the API.
- `npm audit` reports high-severity advisories in tooling, not in code that serves requests: `braces` (via `eslint-config-next`, lint only) and `mysql2` / `deepmerge-ts` (via the Prisma 7 CLI, used for migrations and client generation; `mysql2` is only for MySQL databases). The fix requires Prisma 8, which is not yet stable.
