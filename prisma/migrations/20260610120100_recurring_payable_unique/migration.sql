-- RACE-02 (Fase 2) — impede gerar 2x o mesmo pagável recorrente no mesmo mês.
-- A geração (/api/recurring-expenses/generate) faz findFirst + create FORA de
-- transação: dois disparos concorrentes (duplo-clique / retry) podem criar dois
-- AccountPayable para a mesma RecurringExpense na mesma competência.
--
-- Garante no banco: 1 pagável por (recurringExpenseId, mês de dueDate).
-- date_trunc('month', "dueDate") normaliza a competência (qualquer dia do mês).
--
-- ⚠️ Como na BUG-05: NÃO desduplica automaticamente. Pagável pode ter baixa
-- (pagamento) registrada — apagar o errado = perder registro financeiro real.
-- Se a detecção achar duplicatas, limpeza é passo separado e revisado (manter o
-- que tem pagamento), ANTES desta migration, na mesma janela. Se houver duplicata
-- pendente, este índice falha de propósito.
--
-- Parcial: só onde recurringExpenseId IS NOT NULL (pagável avulso não se aplica).

CREATE UNIQUE INDEX "AccountPayable_recurring_month_unique"
  ON "AccountPayable" ("recurringExpenseId", (date_trunc('month', "dueDate")))
  WHERE "recurringExpenseId" IS NOT NULL;
