-- Race condition fix (Finding A1 — auditoria 2026-05-26).
-- cash.service.ts:30-43 faz findFirst + create em check-then-act,
-- permitindo dois turnos OPEN simultâneos na mesma branch.
-- Partial unique index garante no nivel do DB que so existe 1 OPEN por branch.

CREATE UNIQUE INDEX "CashShift_branchId_open_unique"
  ON "CashShift" ("branchId")
  WHERE "status" = 'OPEN';
