-- Reset de senha self-service (token selector/verifier + revogação de sessão).
--
-- 1) Coluna aditiva em User: passwordChangedAt (nullable). Contas existentes
--    ficam NULL — nada é revogado retroativamente. Usada no callback jwt (M12)
--    para invalidar sessões emitidas antes da última troca de senha.
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- 2) Tabela de tokens de reset. selector público (link, lookup O(1)) + verifierHash
--    (SHA-256 do segredo, nunca em claro). Uso único via usedAt. FK com ON DELETE
--    CASCADE: apagar o usuário limpa os tokens.
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selector" TEXT NOT NULL,
    "verifierHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_selector_key" ON "PasswordResetToken"("selector");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Índice único PARCIAL (hand-written de propósito — o Prisma não expressa
--    índice parcial, então NÃO declaramos @@unique([userId]) no schema; senão o
--    migrate diff ficaria trocando o parcial pelo comum em loop). Garante no
--    máximo 1 token ATIVO (usedAt IS NULL) por usuário, deixando o histórico de
--    tokens já consumidos livre. É o gate que sustenta o "invalida token anterior
--    ao pedir um novo" do endpoint esqueci-senha.
CREATE UNIQUE INDEX "PasswordResetToken_userId_active_unique"
    ON "PasswordResetToken"("userId") WHERE "usedAt" IS NULL;
