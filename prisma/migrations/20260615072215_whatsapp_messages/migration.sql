-- CreateTable
CREATE TABLE "WhatsappConversation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "contactName" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzedAt" TIMESTAMP(3),
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT,
    "mediaUrl" TEXT,
    "evolutionId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappConversation_companyId_lastMessageAt_idx" ON "WhatsappConversation"("companyId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "WhatsappConversation_companyId_analyzedAt_idx" ON "WhatsappConversation"("companyId", "analyzedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappConversation_companyId_contactNumber_key" ON "WhatsappConversation"("companyId", "contactNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMessage_evolutionId_key" ON "WhatsappMessage"("evolutionId");

-- CreateIndex
CREATE INDEX "WhatsappMessage_companyId_conversationId_idx" ON "WhatsappMessage"("companyId", "conversationId");

-- CreateIndex
CREATE INDEX "WhatsappMessage_conversationId_receivedAt_idx" ON "WhatsappMessage"("conversationId", "receivedAt");

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsappConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

