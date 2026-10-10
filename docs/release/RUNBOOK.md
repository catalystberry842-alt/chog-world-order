# Chog World Order: incident response and rollback runbook

Use this for production incidents involving payments, the contract, the indexer, the database, or the app. Any action that sends a transaction or changes production needs approval from the incident lead, who is named before launch.

## Severity

| Level | Examples | Response |
| --- | --- | --- |
| SEV1 | Funds at risk or misdirected; admin multisig or a signer key compromised; payments shown as confirmed that are not on-chain | Pause immediately, page everyone, public notice |
| SEV2 | Indexer down or far behind; RPC failing; wrong token behaviour; database unavailable | Pause if payments are affected; fix within hours |
| SEV3 | Single failed payment; UI bug; delayed confirmations | Normal working hours |

## First five minutes (any payment-related SEV1/SEV2)

1. **Pause new payments in the app:** set `PAYMENTS_PAUSED=true` in production env, then redeploy (on Vercel, env changes apply on the next deployment). New registration and payment instructions now return `503 payments_paused`. Verification of transactions already sent continues, so nothing in flight is lost.
2. **If a token is involved, delist it on-chain:** from the admin multisig, call `setSupportedToken(<token>, false)`:

   ```bash
   cast calldata "setSupportedToken(address,bool)" <token> false   # submit via the multisig UI
   ```

   Every later `payToken` with that token reverts. Native MON payments are not affected.
3. **Post a status notice** for users: "Payments are temporarily paused. Funds already sent are unaffected; we will confirm them when service resumes."
4. **Preserve evidence:** export recent logs, run `GET /api/indexer/status`, and take a database snapshot.

## What the contract can and cannot do in an incident

- **No pause function.** Native MON payments cannot be stopped on-chain. They only move the campaign owner's own funds, signed by that owner, so the app-level pause covers the app's flows.
- **Token kill switch:** `setSupportedToken(token, false)` (admin only).
- **No custody, no upgrade, no admin withdrawal.** There are no funds in the contract to rescue or freeze, and the code cannot be changed. Replacing the contract means deploying a new one (see "Contract replacement").

## Playbooks

### Compromised or failing token (e.g. USDC incident, depeg, blocklist issue)

1. Pause (step 1) and delist on-chain (step 2).
2. Unset `NEXT_PUBLIC_USDC_ADDRESS` and redeploy so the token is no longer offered for new campaigns.
3. Campaigns priced in that token cannot be paid until it is re-listed. Contact affected owners.

### Admin multisig signer compromised

1. Pause (step 1).
2. With the remaining honest signers, rotate the compromised signer out of the multisig.
3. If the threshold itself is compromised, the attacker can only list or delist tokens. The impact: a listed malicious token could be offered to owners **only if the app is also configured with it**, and the app only offers `NEXT_PUBLIC_USDC_ADDRESS`. Check `SupportedTokenUpdated` events, delist anything unexpected, and transfer ownership to a new multisig (`transferOwnership`, then `acceptOwnership` from the new one).

### Deployer key compromised

The deployer has no powers after deployment. Move any remaining MON out and retire it.

### Payment shown as confirmed but not on-chain (should be impossible)

SEV1.

1. Pause.
2. Look up the payment's `txHash` and `logIndex` on the explorer.
3. Compare against the `ChainEvent` row and the logs.
4. Mark the record for manual review; do not edit it silently. Keep it, and document the correction in the incident report.
5. Root-cause before unpausing.

### Mismatched payment (wrong amount or recipient on-chain)

This is terminal by design. The deliverable reference is used up on-chain (`DeliverableAlreadyPaid`), so it cannot be paid again through the contract.

- Settle with the creator off-band.
- Record the resolution in the incident log.

### RPC outage or rate limiting

- The indexer keeps the last completed chunk; nothing is lost. Verification responses show "pending" with a retry message.
- Switch `MONAD_RPC_URL` to a backup provider and redeploy. Keep `INDEXER_MAX_BLOCK_RANGE` at or below the new provider's `eth_getLogs` limit.
- Then run the catch-up loop (DEPLOYMENT.md §8).

### Indexer stuck or behind

1. `GET /api/indexer/status`: check `cursor`, `confirmedHead`, and `lagBlocks`.
2. Check logs for `indexer.run_failed` and its reason. Typical causes:
   - **Range limit:** lower `INDEXER_MAX_BLOCK_RANGE`.
   - **Time limit:** lower `INDEXER_MAX_CHUNKS_PER_RUN`.
   - **RPC down:** switch provider.
   - **Contract check failing:** wrong address or RPC on the wrong chain.
3. Run the catch-up loop. To re-scan a range, move the cursor back (DEPLOYMENT.md §8). This is idempotent.

### Database incident

1. Pause.
2. Restore from point-in-time recovery or the latest dump into a **new** database:

   ```bash
   pg_restore --no-owner --dbname "$NEW_DIRECT_URL" chog-<timestamp>.dump
   ```

3. Point `DATABASE_URL` at it and redeploy.
4. Then rebuild chain-derived state:
   - move the indexer cursor back to before the restore point (or delete the cursor row to re-scan from the deploy block)
   - run the catch-up loop
   - payments and registrations made on-chain after the backup are re-applied from events
5. Ask reviewers to re-check anything reviewed after the backup.

## Rollback

### Application rollback

- **Vercel:** promote the previous production deployment (Instant Rollback).
- **Database compatibility:** migrations are forward-only. Rolling the app back **past** `20261010071804_evidence_dedupe_keys` also requires restoring the database backup taken before that migration, because older code computes duplicate keys in the old format. Rolling back between deployments that share the same migrations is safe.
- **Rules version:** rolling back across a rules-version change needs a reputation recalculation afterwards (`POST /api/reputation/recalculate` as admin).

### Configuration rollback

To switch on-chain payments off entirely, clear `NEXT_PUBLIC_CAMPAIGN_PAYMENTS_ADDRESS` and redeploy.

- Campaigns stop offering on-chain registration and payment.
- Existing records stay as they are.
- Prefer `PAYMENTS_PAUSED=true` for short incidents, because it keeps verification of in-flight transactions running.

### Contract replacement (new deployment)

The contract cannot be upgraded. A new deployment has a new address, and campaign IDs include the contract address, so campaigns registered on the old contract **cannot** be paid through the new one.

1. Pause.
2. Let in-flight payments on the old contract confirm.
3. List campaigns with unpaid accepted deliverables and agree how to settle them: on the old contract, which still works if not compromised, or off-band.
4. Deploy and verify the new contract (DEPLOYMENT.md §4–5).
5. Update `NEXT_PUBLIC_CAMPAIGN_PAYMENTS_ADDRESS` and `CAMPAIGN_PAYMENTS_DEPLOY_BLOCK`, and delete the indexer cursor row.
6. Redeploy, then unpause.
7. Old campaigns' registration and payment records remain as history. The app is configured for one contract at a time (RISKS.md R9).

## After the incident

- Write an incident report: timeline, impact (with transaction hashes), root cause, fixes, and follow-ups.
- Unpause only after the post-deployment checklist items that touch the affected area pass again.
