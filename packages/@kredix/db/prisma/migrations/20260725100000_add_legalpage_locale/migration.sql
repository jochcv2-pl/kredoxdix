-- AlterTable
ALTER TABLE "LegalPage" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'de';

-- CreateIndex
CREATE INDEX "LegalPage_locale_isActive_idx" ON "LegalPage"("locale", "isActive");
