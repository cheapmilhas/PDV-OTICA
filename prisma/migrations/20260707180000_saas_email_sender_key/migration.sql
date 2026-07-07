-- Config de e-mail auto-suficiente: remetente + chave Resend editáveis pela UI.
-- resendApiKeyEnc guarda a chave CIFRADA (aes-256-gcm, mesmo padrão da chave de IA).
-- Todos nullable, sem backfill: enquanto nulos, o código cai no fallback das
-- variáveis de ambiente (RESEND_API_KEY / EMAIL_FROM / EMAIL_REPLY_TO).
ALTER TABLE "SaasEmailConfig"
  ADD COLUMN "resendApiKeyEnc" TEXT,
  ADD COLUMN "emailFrom" TEXT,
  ADD COLUMN "emailReplyTo" TEXT;
