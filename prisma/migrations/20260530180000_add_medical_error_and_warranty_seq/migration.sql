-- Sprint 4: tipo "erro médico" + numeração de exibição de garantia/retrabalho.
-- Tudo aditivo e nullable/com default — seguro, sem backfill obrigatório.
--
-- isMedicalError / medicalErrorReason: terceiro tipo (além de garantia/retrabalho).
-- warrantySeq: sequência de exibição por (OS original + tipo) -> #1234-G1, #1234-G2,
--   #1234-RT1, #1234-M1. O `number` interno continua único/sequencial; isto é só
--   para a camada de exibição, não viola @@unique([companyId, number]).

ALTER TABLE "ServiceOrder"
  ADD COLUMN "isMedicalError" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "medicalErrorReason" TEXT,
  ADD COLUMN "warrantySeq" INTEGER;
