-- CreateEnum
CREATE TYPE "SnapshotCause" AS ENUM ('VERIFICATION', 'RECALCULATION', 'ADJUSTMENT');

-- Reputation engine (rules version 2026-10.1).
--
-- Events written under the previous rules (stamp points, old weights) cannot be
-- expressed in the new ledger format. They are removed here. After migrating,
-- an admin calls POST /api/reputation/recalculate to rebuild every ledger from
-- verified evidence with the current rules. No user-submitted data is lost:
-- evidence, stamps, and sessions are untouched.
DELETE FROM "ReputationEvent";

-- AlterEnum
BEGIN;
CREATE TYPE "ReputationEventKind_new" AS ENUM ('CONTRIBUTION', 'CONSISTENCY_BONUS', 'ADJUSTMENT', 'REVERSAL');
ALTER TABLE "ReputationEvent" ALTER COLUMN "kind" TYPE "ReputationEventKind_new" USING ("kind"::text::"ReputationEventKind_new");
ALTER TYPE "ReputationEventKind" RENAME TO "ReputationEventKind_old";
ALTER TYPE "ReputationEventKind_new" RENAME TO "ReputationEventKind";
DROP TYPE "public"."ReputationEventKind_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "ReputationEvent" DROP CONSTRAINT "ReputationEvent_stampId_fkey";

-- DropIndex
DROP INDEX "ReputationEvent_evidenceId_kind_key";

-- DropIndex
DROP INDEX "ReputationEvent_stampId_key";

-- AlterTable: add the category column, backfill it from the evidence kind, then require it.
ALTER TABLE "Evidence" ADD COLUMN     "category" TEXT,
ADD COLUMN     "verificationData" JSONB;

UPDATE "Evidence" SET "category" = CASE "kind"
  WHEN 'CAMPAIGN_DELIVERABLE' THEN 'campaign'
  WHEN 'ONCHAIN_INTERACTION' THEN 'protocol'
  WHEN 'COMMUNITY_CONTRIBUTION' THEN 'content'
  WHEN 'RESEARCH_CONTRIBUTION' THEN 'research'
  WHEN 'CODE_CONTRIBUTION' THEN 'code'
END;

ALTER TABLE "Evidence" ALTER COLUMN "category" SET NOT NULL;

-- AlterTable
ALTER TABLE "ReputationEvent" DROP COLUMN "source",
DROP COLUMN "stampId",
ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "calculationVersion" TEXT NOT NULL,
ADD COLUMN     "category" TEXT NOT NULL,
ADD COLUMN     "dedupeKey" TEXT NOT NULL,
ADD COLUMN     "periodKey" TEXT,
ADD COLUMN     "planKey" TEXT,
ADD COLUMN     "reversesEventId" TEXT;

-- CreateTable
CREATE TABLE "ReputationSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "tier" TEXT NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "cause" "SnapshotCause" NOT NULL,
    "eventCount" INTEGER NOT NULL,
    "triggeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReputationSnapshot_userId_createdAt_idx" ON "ReputationSnapshot"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Evidence_category_status_idx" ON "Evidence"("category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReputationEvent_dedupeKey_key" ON "ReputationEvent"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReputationEvent_reversesEventId_key" ON "ReputationEvent"("reversesEventId");

-- CreateIndex
CREATE INDEX "ReputationEvent_userId_category_idx" ON "ReputationEvent"("userId", "category");

-- CreateIndex
CREATE INDEX "ReputationEvent_planKey_idx" ON "ReputationEvent"("planKey");

-- AddForeignKey
ALTER TABLE "ReputationEvent" ADD CONSTRAINT "ReputationEvent_reversesEventId_fkey" FOREIGN KEY ("reversesEventId") REFERENCES "ReputationEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationEvent" ADD CONSTRAINT "ReputationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationSnapshot" ADD CONSTRAINT "ReputationSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationSnapshot" ADD CONSTRAINT "ReputationSnapshot_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

