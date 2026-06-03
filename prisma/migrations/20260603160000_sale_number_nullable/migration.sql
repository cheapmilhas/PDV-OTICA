-- Migration A (Rotina de Testes Óticas Ultra / F4): apenas adiciona a coluna
-- `number` como NULLABLE. Sem default, sem constraint. Aplicar em prod ANTES
-- de deployar o código que numera (F4.4b). A Migration B (backfill + NOT NULL +
-- unique) só vem DEPOIS do código já estar numerando, para nunca haver janela
-- de insert sem número sob a constraint NOT NULL.
ALTER TABLE "Sale" ADD COLUMN "number" INTEGER;
