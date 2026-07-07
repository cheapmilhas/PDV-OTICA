-- Saúde do Sistema (Fase S1): batimento de crons + feed de incidentes.

-- CreateTable
CREATE TABLE "CronHeartbeat" (
    "id" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "lastStartedAt" TIMESTAMP(3),
    "lastSucceededAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "lastDurationMs" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolveNote" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CronHeartbeat_jobKey_key" ON "CronHeartbeat"("jobKey");

-- CreateIndex
CREATE UNIQUE INDEX "SystemEvent_dedupeKey_key" ON "SystemEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "SystemEvent_status_createdAt_idx" ON "SystemEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SystemEvent_source_createdAt_idx" ON "SystemEvent"("source", "createdAt");
