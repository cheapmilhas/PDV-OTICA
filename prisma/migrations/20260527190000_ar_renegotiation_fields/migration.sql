-- Q7.3 P2-9: rastreabilidade de renegociação em AR.
-- renegotiatedFromId aponta pra AR original (FK soft — sem constraint pra
-- permitir cascade quando AR original é deletada por data-management).
-- renegotiatedAt + originalAmount preservam evidência mesmo se notes editado.

ALTER TABLE "AccountReceivable"
  ADD COLUMN "renegotiatedFromId" TEXT,
  ADD COLUMN "renegotiatedAt" TIMESTAMP(3),
  ADD COLUMN "originalAmount" DECIMAL(12,2);

CREATE INDEX "AccountReceivable_renegotiatedFromId_idx"
  ON "AccountReceivable" ("renegotiatedFromId");
