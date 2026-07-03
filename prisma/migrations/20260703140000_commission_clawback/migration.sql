-- Glosa de comissão REGISTRADA (não descontada automaticamente).
-- PURAMENTE ADITIVA: colunas nullable / com default 0. Nenhum dado reescrito.
-- Registra quanto o dono reconhece a glosar de um CommissionPayment quando o
-- pago excede o devido (venda do mês devolvida após o pagamento).

ALTER TABLE "CommissionPayment"
  ADD COLUMN "clawbackAmount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "clawbackAt" TIMESTAMP(3),
  ADD COLUMN "clawbackByUserId" TEXT;
