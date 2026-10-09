-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('AWAITING_TRANSACTION', 'PENDING_CONFIRMATION', 'CONFIRMED', 'FAILED', 'MISMATCH');

-- CreateTable
CREATE TABLE "CampaignPayment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "chainCampaignId" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "tokenKey" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "creatorAddress" TEXT NOT NULL,
    "payerAddress" TEXT NOT NULL,
    "deliverableRef" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'AWAITING_TRANSACTION',
    "submittedTxHash" TEXT,
    "txHash" TEXT,
    "logIndex" INTEGER,
    "blockNumber" BIGINT,
    "blockHash" TEXT,
    "failureReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainEvent" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerCursor" (
    "id" TEXT NOT NULL,
    "lastBlock" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPayment_deliverableId_key" ON "CampaignPayment"("deliverableId");

-- CreateIndex
CREATE INDEX "CampaignPayment_status_idx" ON "CampaignPayment"("status");

-- CreateIndex
CREATE INDEX "CampaignPayment_chainCampaignId_deliverableRef_idx" ON "CampaignPayment"("chainCampaignId", "deliverableRef");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPayment_txHash_logIndex_key" ON "CampaignPayment"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "ChainEvent_eventName_blockNumber_idx" ON "ChainEvent"("eventName", "blockNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ChainEvent_chainId_txHash_logIndex_key" ON "ChainEvent"("chainId", "txHash", "logIndex");

-- AddForeignKey
ALTER TABLE "CampaignPayment" ADD CONSTRAINT "CampaignPayment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPayment" ADD CONSTRAINT "CampaignPayment_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
