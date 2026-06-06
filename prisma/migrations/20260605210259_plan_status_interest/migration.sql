-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "highlightFeatures" JSONB,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "PlanInterest" (
    "id" TEXT NOT NULL,
    "planSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "companyName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanInterest_planSlug_idx" ON "PlanInterest"("planSlug");

-- CreateIndex
CREATE INDEX "PlanInterest_createdAt_idx" ON "PlanInterest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlanInterest_email_planSlug_key" ON "PlanInterest"("email", "planSlug");

