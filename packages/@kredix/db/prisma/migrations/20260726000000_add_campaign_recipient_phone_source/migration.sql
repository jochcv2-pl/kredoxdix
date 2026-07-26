-- AlterTable
ALTER TABLE "CampaignRecipient" ADD COLUMN "phone" TEXT;
ALTER TABLE "CampaignRecipient" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'lead';
