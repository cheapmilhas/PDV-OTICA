-- Saúde do Sistema (Fase S3): coluna de idempotência do e-mail de alerta.
-- alertedAt = quando o e-mail de alerta do evento foi ENFILEIRADO. Null = ainda
-- não alertado. O cron health-alert só e-maila eventos abertos com alertedAt
-- nulo e o marca, garantindo UM e-mail por incidente (sem tabela dedicada).
ALTER TABLE "SystemEvent" ADD COLUMN "alertedAt" TIMESTAMP(3);
