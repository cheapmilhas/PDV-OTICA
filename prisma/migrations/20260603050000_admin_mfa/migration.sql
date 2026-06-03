-- Q8.3.1: campos de MFA (TOTP) do AdminUser.
-- mfaSecret: segredo base32 (null = não cadastrado).
-- mfaEnabled: só true após o admin confirmar o 1º código.
-- mfaRecoveryCodes: hashes SHA-256 dos códigos de recuperação (uso único).
-- Migration ADITIVA, idempotente.

ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "mfaRecoveryCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
