-- Adiciona ao enum SaasEmailType os valores gerados pelo fluxo de cobrança Asaas
-- (Fase Email-A). Aditivo e idempotente (IF NOT EXISTS): em produção os valores
-- já existem (aplicados pela migration 20260611120000 do worktree de cobrança);
-- esta migration alinha o histórico desta branch com o estado real do banco e
-- corrige a leitura de SaasEmailLog na tela /admin/configuracoes/emails, que
-- explodia com "value not found in enum 'SaasEmailType'".
ALTER TYPE "SaasEmailType" ADD VALUE IF NOT EXISTS 'INVOICE_CREATED';
ALTER TYPE "SaasEmailType" ADD VALUE IF NOT EXISTS 'INVOICE_DUE_SOON';
