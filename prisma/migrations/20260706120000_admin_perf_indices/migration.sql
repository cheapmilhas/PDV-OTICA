-- Índices de performance para o super admin (Fase 4 do plano de melhorias 2026-07-06).
-- Todos são CREATE INDEX puros (sem lock de escrita relevante em tabelas deste porte)
-- e idempotentes via IF NOT EXISTS, para reaplicar com segurança.

-- Página Saúde: WHERE healthScore IS NOT NULL [+ healthCategory] ORDER BY healthScore.
-- Sem índice = seq scan + sort em memória a cada carga.
CREATE INDEX IF NOT EXISTS "Company_healthCategory_healthScore_idx"
  ON "Company"("healthCategory", "healthScore");

-- Listas do admin ordenam por createdAt (com tiebreaker por id).
CREATE INDEX IF NOT EXISTS "Company_createdAt_idx"
  ON "Company"("createdAt");

-- Agregações "recebido no mês": WHERE status = 'PAID' AND paidAt BETWEEN ...
-- O índice [dueDate, status] existente não cobre paidAt.
CREATE INDEX IF NOT EXISTS "Invoice_status_paidAt_idx"
  ON "Invoice"("status", "paidAt");
