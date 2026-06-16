-- CreateTable
CREATE TABLE "AiGlobalConfig" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "anthropicKeyEnc" TEXT,
    "usdBrlRate" DECIMAL(10,4) NOT NULL DEFAULT 5.5,
    "markupPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "creditTokenFactor" INTEGER NOT NULL DEFAULT 1000,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiGlobalConfig_pkey" PRIMARY KEY ("id")
);

