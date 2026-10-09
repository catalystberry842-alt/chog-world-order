-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CONTRIBUTOR', 'REVIEWER', 'ADMIN');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('ONCHAIN_INTERACTION', 'COMMUNITY_CONTRIBUTION', 'CODE_CONTRIBUTION', 'RESEARCH_CONTRIBUTION', 'CAMPAIGN_DELIVERABLE');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('ONCHAIN_RECEIPT', 'REVIEWER_APPROVAL', 'MAINTAINER_APPROVAL', 'CAMPAIGN_ACCEPTANCE');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "StampCategory" AS ENUM ('MONAD_EXPLORER', 'COMMUNITY_CONTRIBUTOR', 'BUILDER', 'RESEARCHER', 'COLLABORATOR', 'CONSISTENT_CONTRIBUTOR');

-- CreateEnum
CREATE TYPE "ReputationEventKind" AS ENUM ('CONTRIBUTION_VERIFIED', 'STAMP_ISSUED', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CONTRIBUTOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "verificationMethod" "VerificationMethod" NOT NULL,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "chainId" INTEGER,
    "txHash" TEXT,
    "appId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "statusReason" TEXT,
    "reviewerNote" TEXT,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassportStamp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "StampCategory" NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,

    CONSTRAINT "PassportStamp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReputationEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ReputationEventKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceId" TEXT,
    "stampId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReputationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_address_key" ON "User"("address");

-- CreateIndex
CREATE UNIQUE INDEX "WalletSession_tokenHash_key" ON "WalletSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "WalletSession_nonce_key" ON "WalletSession"("nonce");

-- CreateIndex
CREATE INDEX "WalletSession_userId_idx" ON "WalletSession"("userId");

-- CreateIndex
CREATE INDEX "WalletSession_expiresAt_idx" ON "WalletSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_dedupeKey_key" ON "Evidence"("dedupeKey");

-- CreateIndex
CREATE INDEX "Evidence_userId_status_idx" ON "Evidence"("userId", "status");

-- CreateIndex
CREATE INDEX "Evidence_status_createdAt_idx" ON "Evidence"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Evidence_kind_status_idx" ON "Evidence"("kind", "status");

-- CreateIndex
CREATE INDEX "PassportStamp_userId_issuedAt_idx" ON "PassportStamp"("userId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PassportStamp_userId_category_key" ON "PassportStamp"("userId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "PassportStamp_evidenceId_category_key" ON "PassportStamp"("evidenceId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ReputationEvent_stampId_key" ON "ReputationEvent"("stampId");

-- CreateIndex
CREATE INDEX "ReputationEvent_userId_createdAt_idx" ON "ReputationEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReputationEvent_evidenceId_kind_key" ON "ReputationEvent"("evidenceId", "kind");

-- AddForeignKey
ALTER TABLE "WalletSession" ADD CONSTRAINT "WalletSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportStamp" ADD CONSTRAINT "PassportStamp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportStamp" ADD CONSTRAINT "PassportStamp_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassportStamp" ADD CONSTRAINT "PassportStamp_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationEvent" ADD CONSTRAINT "ReputationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationEvent" ADD CONSTRAINT "ReputationEvent_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReputationEvent" ADD CONSTRAINT "ReputationEvent_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "PassportStamp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
