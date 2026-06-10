-- BUG-05 (Fase 2) — impede 2 parcelas com o mesmo (saleId, installmentNumber).
-- Hoje AccountReceivable não tem unique combinado; um retry de transação abortada
-- na criação da venda pode recriar as parcelas, duplicando cobrança.
--
-- ⚠️ ATENÇÃO — DIFERENTE da migration de CNPJ: esta NÃO desduplica automaticamente.
-- Parcela é cobrança de cliente real; apagar a parcela errada = cobrar o cliente
-- errado. Se a detecção encontrar duplicatas, a LIMPEZA é um passo SEPARADO,
-- revisado caso-a-caso (manter a parcela que tem histórico de pagamento/baixa),
-- executado ANTES desta migration na MESMA janela de deploy. Se houver duplicatas
-- pendentes, este CREATE UNIQUE INDEX vai FALHAR de propósito — é o comportamento
-- correto (não deixa criar o índice por cima de dados ambíguos).
--
-- Índice PARCIAL: só onde saleId IS NOT NULL (AR avulso, sem venda, não se aplica).

CREATE UNIQUE INDEX "AccountReceivable_saleId_installmentNumber_unique"
  ON "AccountReceivable" ("saleId", "installmentNumber")
  WHERE "saleId" IS NOT NULL;
