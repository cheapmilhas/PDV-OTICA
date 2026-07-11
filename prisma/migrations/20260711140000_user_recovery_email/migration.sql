-- Reset self-service alcança contas de username: e-mail de contato real, opcional.
-- Aditiva, nullable, SEM índice (sem unicidade — pode ser compartilhado entre
-- funcionários da mesma loja). Zero lock relevante em User. Reversível.
ALTER TABLE "User" ADD COLUMN "recoveryEmail" TEXT;
