-- Evidence duplicate keys (security review, 2026-10-10). Data only; no schema change.
--
-- 1. Rejected claims release their key, so a link or transaction that someone
--    else claimed and had rejected can still be claimed by its real author.
UPDATE "Evidence"
SET "dedupeKey" = 'released:' || "id" || ':' || "dedupeKey"
WHERE "status" = 'REJECTED' AND "dedupeKey" NOT LIKE 'released:%';

-- 2. On-chain keys are scoped to the claimant's wallet (only the sender can verify a transaction).
UPDATE "Evidence" e
SET "dedupeKey" = e."dedupeKey" || ':' || u."address"
FROM "User" u
WHERE u."id" = e."userId" AND e."dedupeKey" LIKE 'onchain:%' AND e."dedupeKey" NOT LIKE '%:0x%:0x%';

-- 3. Link keys no longer include the claimed kind: one link earns once.
--    If the same link was claimed under several kinds, the verified (then oldest)
--    record keeps the key and the others are released for manual review.
WITH rekeyed AS (
  SELECT
    "id",
    'url:' || substring("dedupeKey" FROM position(':' IN "dedupeKey") + 1) AS "newKey",
    row_number() OVER (
      PARTITION BY substring("dedupeKey" FROM position(':' IN "dedupeKey") + 1)
      ORDER BY ("status" = 'VERIFIED') DESC, "createdAt", "id"
    ) AS "rank"
  FROM "Evidence"
  WHERE "dedupeKey" LIKE 'community-contribution:%'
     OR "dedupeKey" LIKE 'research-contribution:%'
     OR "dedupeKey" LIKE 'code:%'
)
UPDATE "Evidence" e
SET "dedupeKey" = CASE WHEN r."rank" = 1 THEN r."newKey" ELSE 'released:' || e."id" || ':' || r."newKey" END
FROM rekeyed r
WHERE e."id" = r."id";

-- 4. A released duplicate that is still waiting for review is closed, so it can never be
--    approved later and earn the same link twice.
UPDATE "Evidence"
SET "status" = 'REJECTED',
    "statusReason" = 'Duplicate of another claim of the same link.',
    "updatedAt" = now()
WHERE "status" = 'PENDING' AND "dedupeKey" LIKE 'released:%';

-- Rules version 2026-10.2 buckets limits by verification time. After deploying,
-- an admin runs POST /api/reputation/recalculate to rewrite the ledger (reversals + new events).
