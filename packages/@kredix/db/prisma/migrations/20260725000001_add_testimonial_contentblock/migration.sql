-- CreateTable: Testimonial — témoignages clients affichés sur la landing
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT,
    "authorLocation" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 5,
    "content" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'de',
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- Index pour requêtes publiques (getVisibleTestimonials)
CREATE INDEX "Testimonial_locale_isVisible_order_idx" ON "Testimonial"("locale", "isVisible", "order");

-- CreateTable: ContentBlock — sections CMS éditables (engagements, services...)
CREATE TABLE "ContentBlock" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'de',
    "eyebrow" TEXT,
    "title" TEXT,
    "lead" TEXT,
    "items" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentBlock_pkey" PRIMARY KEY ("id")
);

-- 1 block par (section, locale) — upsert côté admin
CREATE UNIQUE INDEX "ContentBlock_section_locale_key" ON "ContentBlock"("section", "locale");
CREATE INDEX "ContentBlock_section_locale_idx" ON "ContentBlock"("section", "locale");
