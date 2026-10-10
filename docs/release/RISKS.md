# Outstanding security and operational risks

As of 2026-10-10, before any mainnet deployment. This is not an audit and not a security certification.

## Contract security review: what is complete and what is not

| Review | Status |
| --- | --- |
| Internal design review and two internal code reviews of `CampaignPayments.sol` | Done. Findings fixed: once-per-deliverable payment guard; clear error when a token lowers the creator's balance |
| Foundry test suite (36 tests, including reentrancy, fee-on-transfer, no-return and false-return tokens, rejecting receivers, ownership) | Done; all pass |
| End-to-end tests against the real bytecode on a local Monad-configured chain | Done; all pass |
| **Independent external audit** | **Not done. Blocks deployment.** |
| Formal verification / invariant fuzzing campaign | Not done (recommended) |
| Review of the exact deployed bytecode on mainnet | Pending deployment (`npm run release:verify-contract`) |
| Static analysis with Slither/Aderyn | Not run (tools not available in the preparation environment). Run before the audit |

## Risks

| ID | Risk | Severity | Mitigation / next step |
| --- | --- | --- | --- |
| R1 | Contract not externally audited | High | Commission an audit; deploy only after findings are resolved |
| R2 | No rate limiting. Sign-in (an RPC call per attempt), evidence submission, and payment polling can be abused for load and RPC cost | High (operational) | Add a shared-store limiter (Redis/KV) or edge/WAF rate rules before public launch |
| R3 | Monad facts (verifier URLs, EVM fork, RPC limits) re-checked only through search results, because docs.monad.xyz was blocked during preparation | Medium | Re-verify DEPLOYMENT.md §1 and §5.2 on the day |
| R4 | Public RPC rate limits and the 100-block log range | Medium | Use a dedicated RPC provider; keep `INDEXER_MAX_BLOCK_RANGE` within its limit; monitor `lagBlocks` |
| R5 | Indexer scheduling: Vercel Hobby cron runs daily only | Medium | External scheduler or Vercel Pro; alert on lag |
| R6 | Native MON payments cannot be paused on-chain (no pause function) | Medium | App-level `PAYMENTS_PAUSED`; the contract holds no funds and only the campaign owner can pay. Decide before audit whether to add a pausable flag (would change the bytecode and require re-audit) |
| R7 | Multisig availability on Monad mainnet not confirmed during preparation | Medium | Confirm Safe or another multisig is deployed and supported before deployment |
| R8 | A mismatched payment permanently uses up the deliverable reference on-chain | Low–Medium | Settle off-band (RUNBOOK); UI shows the exact recipient and amount before signing |
| R9 | One contract address at a time; a replacement contract orphans campaigns registered on the old one | Medium | RUNBOOK "Contract replacement" procedure |
| R10 | Sybil reputation: an owner can accept work from their own second wallet | Medium | Caps limit it; consider requiring a confirmed payment or minimum budget before campaign reputation counts |
| R11 | No script Content-Security-Policy, only framing, base-uri, object, and form protections | Medium | Nonce-based CSP would disable static/partial prerendering; revisit after launch |
| R12 | Smart-contract wallets: framing is blocked (no Safe App); Safe owners need EIP-1271 sign-in | Low | Product decision |
| R13 | Backdating within an account's lifetime; content hashes reusable across campaigns; same wallet can resubmit a rejected link (within the 20-claim cap); small race on the claim cap | Low | Reviewer judgement; monitor |
| R14 | `npm audit`: high advisories in the Prisma CLI (mysql2, deepmerge-ts; not loaded at runtime with the Postgres adapter) and lint tooling (braces) | Low | Track Prisma releases; no runtime exposure found |
| R15 | Session cookie has no `__Host-` prefix; a passport reads its first 500 evidence records | Low | Follow-up hardening |
| R16 | Existing pre-migration data: old link keys keep their old normalisation; already-verified cross-kind duplicates keep their points | Low | No production data exists yet; review if migrating real data |
| R17 | Reorg beyond Monad finality after confirmation | Very low | Confirmation requires the `finalized` head; incident playbook covers manual correction |
| R18 | USDC blocklisting or upgrade by Circle | Low | Token kill switch (`setSupportedToken(false)`); MON unaffected |
