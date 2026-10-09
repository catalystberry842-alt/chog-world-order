-- CreateEnum
CREATE TYPE "CampaignCategory" AS ENUM ('ART', 'CONTENT', 'DEVELOPMENT', 'COMMUNITY', 'RESEARCH', 'VIDEO');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('NOT_REGISTERED', 'PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "CampaignCategory" NOT NULL,
    "objectives" TEXT[],
    "deliverables" TEXT[],
    "eligibility" TEXT[],
    "acceptanceCriteria" TEXT[],
    "requiredSkills" TEXT[],
    "paymentToken" TEXT NOT NULL,
    "amountPerCreator" DECIMAL(78,0) NOT NULL,
    "slots" INTEGER NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "chainCampaignId" TEXT,
    "registrationStatus" "RegistrationStatus" NOT NULL DEFAULT 'NOT_REGISTERED',
    "registrationTxHash" TEXT,
    "registrationError" TEXT,
    "registeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignApplication" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "proposal" TEXT NOT NULL,
    "evidenceIds" TEXT[],
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "decisionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "contentUrl" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "notes" TEXT,
    "revision" INTEGER NOT NULL,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliverableReview" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "DeliverableStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverableReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_chainCampaignId_key" ON "Campaign"("chainCampaignId");

-- CreateIndex
CREATE INDEX "Campaign_status_deadline_idx" ON "Campaign"("status", "deadline");

-- CreateIndex
CREATE INDEX "Campaign_category_status_idx" ON "Campaign"("category", "status");

-- CreateIndex
CREATE INDEX "Campaign_ownerId_idx" ON "Campaign"("ownerId");

-- CreateIndex
CREATE INDEX "CampaignApplication_campaignId_status_idx" ON "CampaignApplication"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignApplication_applicantId_idx" ON "CampaignApplication"("applicantId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignApplication_campaignId_applicantId_key" ON "CampaignApplication"("campaignId", "applicantId");

-- CreateIndex
CREATE INDEX "Deliverable_campaignId_status_idx" ON "Deliverable"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Deliverable_applicationId_contentHash_key" ON "Deliverable"("applicationId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "Deliverable_applicationId_revision_key" ON "Deliverable"("applicationId", "revision");

-- CreateIndex
CREATE INDEX "DeliverableReview_deliverableId_createdAt_idx" ON "DeliverableReview"("deliverableId", "createdAt");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignApplication" ADD CONSTRAINT "CampaignApplication_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignApplication" ADD CONSTRAINT "CampaignApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignApplication" ADD CONSTRAINT "CampaignApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CampaignApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableReview" ADD CONSTRAINT "DeliverableReview_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableReview" ADD CONSTRAINT "DeliverableReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
