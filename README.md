# Chog World Order

Passports, contribution reputation, and paid collaborations for people building in the Monad ecosystem.

**Contribute → Verify → Build reputation → Get hired → Complete work → Get paid.**

- **Chog Passport**: a wallet-based identity with illustrated crayon stamps for verified activity, plus contribution history. NFT ownership is optional.
- **Contribution Reputation**: a transparent score where every point traces back to a verified contribution or a stamp.
- **Collab Board**: projects publish paid campaigns, creators apply, submit work, and get paid.

## Status

| Area | State |
| --- | --- |
| Passport (stamps, evidence, reputation, profiles) | **Built.** Real data from PostgreSQL when configured |
| Wallet sign-in (Sign-In with Ethereum) | **Built.** Server sessions, no passwords, no seed phrases |
| Evidence verification | **Built** for on-chain receipts and reviewer approval. Campaign acceptance waits for the Collab Board |
| Collab Board | Frontend only, **mock data** |
| Leaderboard | Uses the real scoring rules over **mock data** |
| Smart contracts, tokens, payments | None. Nothing is deployed |

Mock data lives in `src/lib/mock/` and is always labelled "Sample" in the UI. No mock record is presented as verified activity.

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
| Planned | Solidity + Foundry + OpenZeppelin |

## Requirements

- Node.js 22 or newer
- npm 10+
- PostgreSQL 14+ for the Passport system (optional: without it the app runs with sample data only)

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
   | `MONAD_RPC_URL` | On-chain evidence | Monad mainnet RPC. Without it, on-chain claims are stored as `unavailable` |

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

Database integration tests run when `TEST_DATABASE_URL` points at a migrated, disposable database (they truncate its tables):

```bash
TEST_DATABASE_URL=postgresql://… npm test
```

## Routes

| Path | What it shows |
| --- | --- |
| `/` | Landing page |
| `/passport` | Your passport: connect, sign in, see stamps, reputation, and history (including pending claims), submit evidence. Also a labelled sample passport |
| `/profile/[address]` | Public passport: stamps, verified contributions only, reputation breakdown. Validates the address and handles missing profiles |
| `/collabs`, `/collabs/[id]` | Campaign discovery and details (mock data) |
| `/leaderboard` | Rankings with per-source breakdowns (mock data, real scoring rules) |

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

Every write requires an `Origin` header equal to `APP_ORIGIN` and a valid session. The acting wallet always comes from the session: request bodies are strict and reject fields like `address`, `status`, or `points`.

## How the Passport works

### Stamps

| Stamp | Earned by | Verified by |
| --- | --- | --- |
| Monad Explorer | Interaction with a supported Monad app | Transaction receipt and event logs, checked with viem |
| Community Contributor | Approved community contribution | Authorized reviewer |
| Builder | Code contribution | Maintainer (reviewer role) |
| Researcher | Research or technical analysis | Authorized reviewer |
| Collaborator | Accepted campaign deliverable | Collab Board acceptance (not available yet, so claims are `unavailable`) |
| Consistent Contributor | Verified contributions in 4 distinct ISO weeks | Derived from verified records |

A wallet holds at most one stamp per category. Stamps are database records; minting them as NFTs is optional and not built.

### Evidence lifecycle

```text
submit (signed-in wallet) → handler.prepare (validate + canonicalise + dedupe key)
  → stored as pending → handler.verifyOnSubmit
      on-chain:   verified | rejected | pending (not found yet) | unavailable (no RPC / app not supported)
      off-chain:  pending → reviewer approve/reject
      campaign:   unavailable (Collab Board not built)
  → verified → stamps + reputation issued in one transaction
```

- **Duplicates.** Every claim gets a canonical `dedupeKey` (lowercased tx hash, or a URL without tracking parameters, `www.`, trailing slashes, or fragments). It is unique across all users, so the same evidence can never be claimed twice. Stamps are unique per `(user, category)` and `(evidence, category)`, and reputation events per `(evidence, kind)` and per stamp. Issuance is idempotent.
- **Nothing is silently verified.** If a verification source is missing, the record is stored as `unavailable` with a reason.
- **Reviewers** cannot review their own evidence, cannot approve on-chain or campaign evidence, and cannot choose point values. Reviewer notes are never returned by public APIs.
- **Sessions.** The cookie holds a random token; only its SHA-256 hash is stored. Sessions expire after 7 days and are revoked on sign-out. SIWE nonces are single-use (unique in the database).

### Reputation

```text
score = Σ points per verified contribution + Σ points per stamp
```

| Verified contribution | Points | | Stamp | Points |
| --- | --- | --- | --- | --- |
| On-chain interaction | 10 | | Each category stamp | 15 |
| Community contribution | 25 | | Consistent Contributor | 30 |
| Code contribution | 40 | | | |
| Research | 35 | | | |
| Campaign deliverable | 50 | | | |

Pending, rejected, and unavailable claims earn nothing. Connecting a wallet earns nothing. Weights live in `src/lib/passport/reputation.ts`.

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
    reputation/             ReputationBreakdownCard, ReputationBar
    campaigns/, leaderboard/, layout/, ui/, wallet/
  lib/
    passport/               Shared domain: types, stamp catalogue, scoring, issuance rules,
                            address validation, labels
    client/                 Browser API client
    mock/                   MOCK DATA (labelled): contributors, evidence, campaigns
  server/                   Server-only
    auth/                   SIWE, sessions, cookies, guards
    passport/               Store interface, Prisma + in-memory stores, service
    verification/           Handlers: on-chain, reviewed, code, campaign; supported apps
    api/                    Request handlers, schemas, HTTP helpers
  generated/prisma/         Generated client (git-ignored)
tests/                      Vitest suites
```

## Known limitations

- No rate limiting on the API yet. Add it at the edge or in a proxy before production.
- Roles are granted with SQL; there is no admin UI or reviewer queue page yet (the API supports it).
- The leaderboard still ranks sample contributors.
- `npm audit` reports high-severity advisories in tooling, not in code that serves requests: `braces` (via `eslint-config-next`, lint only) and `mysql2` / `deepmerge-ts` (via the Prisma 7 CLI, used for migrations and client generation; `mysql2` is only for MySQL databases). The fix requires Prisma 8, which is not yet stable.
