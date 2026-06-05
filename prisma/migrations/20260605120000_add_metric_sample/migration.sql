-- CreateTable
CREATE TABLE "MetricSample" (
    "id" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowMin" INTEGER NOT NULL,
    "route" TEXT,
    "reqCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "p50Ms" INTEGER,
    "p95Ms" INTEGER,
    "slowQueries" INTEGER NOT NULL DEFAULT 0,
    "cacheHits" INTEGER NOT NULL DEFAULT 0,
    "cacheMisses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MetricSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetricSample_capturedAt_idx" ON "MetricSample"("capturedAt");
