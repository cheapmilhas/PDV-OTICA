# Reset de Senha Self-Service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) ou executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Lojista clica "Esqueci minha senha" → recebe e-mail com link → redefine a senha sozinho, com segurança (token selector/verifier, uso único, revogação de sessão).

**Architecture:** Token selector/verifier (selector público indexado + verifier secreto hasheado SHA-256). 2 endpoints públicos (request + confirm). Revogação de sessão via `passwordChangedAt` no callback jwt existente. Envio de e-mail inline (fora do cron diário) com piso de latência anti-enumeração.

**Tech Stack:** Next.js 16 App Router, Prisma+Neon, next-auth v5 (JWT), bcrypt, Resend, vitest.

**Environment notes:** Branch `feat/reset-senha-self-service`. ⚠️ MIGRAÇÃO MANUAL em prod: `./node_modules/.bin/prisma migrate deploy` ANTES do deploy. Índice parcial (`WHERE usedAt IS NULL`) precisa de SQL manual editado no `.sql` da migração (Prisma `@@unique` não expressa índice parcial). RESEND já ativo em prod. NÃO tocar: nada além dos arquivos listados. Comandos: `npm test` (=vitest run), `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/prisma`. Gotcha: `GlobalAudit.actorId` tem FK para `AdminUser` (schema:2674) — usar `actorId:null`. Spec: `docs/superpowers/specs/2026-07-11-reset-senha-self-service-design.md`.

---

## File Structure
- Migração: `prisma/schema.prisma` (model PasswordResetToken + campo passwordChangedAt) + `.sql` manual do índice parcial.
- Create: `src/services/password-reset.service.ts` (gerar/verificar/consumir token) + `.test.ts`.
- Create: `src/app/api/auth/esqueci-senha/route.ts` + `.test.ts`.
- Create: `src/app/api/auth/redefinir-senha/route.ts` + `.test.ts`.
- Modify: `src/auth.ts` (jwt: grava + revoga por passwordChangedAt).
- Modify: `src/lib/emails/templates.ts` (case "password-reset" + "password-changed").
- Create: `src/app/(auth)/esqueci-senha/page.tsx` + `src/app/(auth)/redefinir-senha/page.tsx`.
- Modify: `src/app/(auth)/login/page.tsx` (link → /esqueci-senha).

---

## Task 1: Migração (schema + campo + índice parcial)

**Files:** Modify `prisma/schema.prisma`; Create migração SQL.

- [ ] **Step 1: Adicionar ao schema** — model `PasswordResetToken` (campos do spec: id cuid, userId, user relation `onDelete: Cascade`, selector `@unique`, verifierHash, expiresAt, usedAt, createdAt, `@@index([userId])`, `@@index([expiresAt])`); adicionar `passwordResetTokens PasswordResetToken[]` e `passwordChangedAt DateTime?` ao model `User`.

- [ ] **Step 2: Gerar migração SEM aplicar**
Run: `./node_modules/.bin/prisma migrate dev --name password_reset_token --create-only`
Expected: cria `prisma/migrations/<ts>_password_reset_token/migration.sql` sem aplicar.

- [ ] **Step 3: Editar o .sql — adicionar índice parcial manual** (Prisma não expressa):
```sql
CREATE UNIQUE INDEX "PasswordResetToken_userId_active_unique"
  ON "PasswordResetToken"("userId") WHERE "usedAt" IS NULL;
```

- [ ] **Step 4: Aplicar em dev**
Run: `./node_modules/.bin/prisma migrate dev`
Expected: aplica; `prisma generate` roda; 0 erros.

- [ ] **Step 5: Commit** — `git add prisma/ && git commit -m "feat(reset-senha): schema PasswordResetToken + passwordChangedAt + índice parcial"`

---

## Task 2: Service de token (`password-reset.service.ts`)

**Files:** Create `src/services/password-reset.service.ts` + `src/services/password-reset.service.test.ts`.

Funções puras/testáveis: `generateTokenParts()` → `{ selector, verifier, verifierHash }`; `hashVerifier(verifier)` → sha256 hex; `splitToken(t)` → `{selector, verifier}` ou null; `verifyToken(row, verifier)` → bool via `timingSafeEqual`. Node `crypto` nativo.

- [ ] **Step 1: Escrever testes** (falham):
```ts
import { describe, it, expect } from "vitest";
import { generateTokenParts, hashVerifier, splitToken, verifyToken } from "./password-reset.service";

describe("password-reset token", () => {
  it("gera selector+verifier+hash; hash é sha256 do verifier, nunca o verifier em claro", () => {
    const { selector, verifier, verifierHash } = generateTokenParts();
    expect(selector.length).toBeGreaterThan(10);
    expect(verifier.length).toBeGreaterThan(20);
    expect(verifierHash).toBe(hashVerifier(verifier));
    expect(verifierHash).not.toContain(verifier);
  });
  it("splitToken parseia selector.verifier e rejeita malformado", () => {
    expect(splitToken("abc.def")).toEqual({ selector: "abc", verifier: "def" });
    expect(splitToken("semponto")).toBeNull();
    expect(splitToken("")).toBeNull();
  });
  it("verifyToken aceita verifier correto e rejeita errado (timingSafeEqual)", () => {
    const { verifier, verifierHash } = generateTokenParts();
    expect(verifyToken({ verifierHash }, verifier)).toBe(true);
    expect(verifyToken({ verifierHash }, "errado")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar → falha.** `npm test -- src/services/password-reset.service.test.ts`

- [ ] **Step 3: Implementar** — `crypto.randomBytes(16/32).toString("base64url")`, `crypto.createHash("sha256").update(verifier).digest("hex")`, `verifyToken` com `crypto.timingSafeEqual(Buffer.from(hashVerifier(verifier)), Buffer.from(row.verifierHash))` (guardar contra tamanhos diferentes).

- [ ] **Step 4: Rodar → passa.**

- [ ] **Step 5: Commit** — `feat(reset-senha): service selector/verifier (sha256 + timingSafeEqual)`

---

## Task 3: Endpoint `POST /api/auth/esqueci-senha`

**Files:** Create `route.ts` + `.test.ts`.

Lógica (spec §Endpoint 1): rate-limit IP+email; `findMany` User por email lower, FILTRAR contas com email entregável (excluir terminados em `@login`/`@funcionario.interno`); para cada, transação `deleteMany({userId, usedAt:null})` + `create` token; 1 `sendEmail` awaited com N links `${baseUrl}/redefinir-senha?t=${selector}.${verifier}` rotulados por company.name; **piso de latência**: `await Promise.all([<trabalho>, sleep(1200)])`; caminho SIMÉTRICO (sem conta → executa trabalho dummy); resposta SEMPRE `200 { message genérica }`.

- [ ] **Step 1: Teste** — anti-enumeração (email existente e inexistente → mesma resposta 200 + corpo idêntico); filtra @login (conta só com @login → nenhum token, resposta genérica); N contas homônimas → N tokens criados. Mockar prisma + sendEmail. (Ver padrão de mock em `src/app/api/**/route.test.ts` existentes.)
- [ ] **Step 2: Rodar → falha.**
- [ ] **Step 3: Implementar** conforme spec. Reusar `rateLimitResponse`/`clientIp` de `src/lib/rate-limit.ts`, `sendEmail` de `src/lib/emails/resend.ts`. `sleep = (ms)=>new Promise(r=>setTimeout(r,ms))`.
- [ ] **Step 4: Rodar → passa.**
- [ ] **Step 5: Commit** — `feat(reset-senha): endpoint esqueci-senha (anti-enumeração, multi-conta, piso latência)`

---

## Task 4: Endpoint `POST /api/auth/redefinir-senha`

**Files:** Create `route.ts` + `.test.ts`.

Lógica (spec §Endpoint 2): rate-limit clientIp; valida senha 8-72; `splitToken`; `findUnique({selector})`; `verifyToken` (timingSafeEqual) + `usedAt==null && expiresAt>now`; consumo ATÔMICO em `$transaction`: `updateMany({where:{selector, usedAt:null}, data:{usedAt:now}})` → se `count===0` aborta; `bcrypt.hash(senha,12)`; `user.update({passwordHash, passwordChangedAt:now})`; `deleteMany` demais tokens do userId; `GlobalAudit({action:"USER_PASSWORD_RESET_SELF", actorId:null, actorType:"USER", metadata:{userId, companyId, via:"self-service-email"}})`. Após: `sendEmail` "password-changed". Bcrypt SÓ após token validado.

- [ ] **Step 1: Teste** — token válido → senha trocada + usedAt setado; verifier errado → 400; expirado → 400; já usado → 400; consumo atômico (2 chamadas concorrentes, mockar updateMany retornando count 1 e depois 0 → só 1 sucede); senha <8 ou >72 → 400; reset invalida demais tokens do userId (deleteMany chamado); GlobalAudit com actorId null.
- [ ] **Step 2: Rodar → falha.**
- [ ] **Step 3: Implementar.** Reusar `bcrypt`, `prisma.$transaction`.
- [ ] **Step 4: Rodar → passa.**
- [ ] **Step 5: Commit** — `feat(reset-senha): endpoint redefinir-senha (consumo atômico + bcrypt + audit + revoga tokens)`

---

## Task 5: Revogação de sessão no `auth.ts`

**Files:** Modify `src/auth.ts`.

- [ ] **Step 1: Teste** — simular callback jwt: token com `passwordChangedAt` antigo + User com `passwordChangedAt` mais novo → `jwt()` retorna null; iguais/token mais novo → mantém sessão. (Se testar o callback isolado for difícil, testar a função de decisão extraída.)
- [ ] **Step 2: Rodar → falha.**
- [ ] **Step 3: Implementar:** (a) no ramo `if (user)` (~linha 167), gravar `token.passwordChangedAt = user.passwordChangedAt ?? null`; (b) no bloco M12 (`auth.ts:200-254`), adicionar `passwordChangedAt: true` ao `select` do `findUnique`; (c) após obter `fresh`, se `fresh.passwordChangedAt && (!token.passwordChangedAt || fresh.passwordChangedAt.getTime() > new Date(token.passwordChangedAt).getTime())` → `return null`. **NÃO** atualizar `token.passwordChangedAt` a partir de `fresh` (senão sobrescreve o baseline). Falha de DB não desloga (já é o padrão do M12). TTL = o do M12 (5min).
- [ ] **Step 4: Rodar → passa** + `./node_modules/.bin/tsc --noEmit` sem novos erros em auth.ts.
- [ ] **Step 5: Commit** — `feat(reset-senha): revoga sessão via passwordChangedAt no jwt (bloco M12)`

---

## Task 6: Templates de e-mail

**Files:** Modify `src/lib/emails/templates.ts`.

- [ ] **Step 1: Teste** — `renderEmailTemplate("password-reset", {links:[{label, url}]})` retorna html com os botões/urls; `renderEmailTemplate("password-changed", {when})` retorna html com aviso. (Seguir padrão de teste de templates se existir.)
- [ ] **Step 2: Rodar → falha.**
- [ ] **Step 3: Implementar** 2 novos `case` no `switch` de `renderEmailTemplate` (molde: `renderInviteEmail`, botão + link copiável, escapeHtml). "password-reset": assunto "Recuperar acesso ao Vis", 1 botão por link (loja), "vale por 1 hora", "não pediu? ignore". "password-changed": "sua senha foi alterada", horário, "não foi você? suporte".
- [ ] **Step 4: Rodar → passa.**
- [ ] **Step 5: Commit** — `feat(reset-senha): templates password-reset e password-changed`

---

## Task 7: Páginas UI (esqueci-senha + redefinir-senha)

**Files:** Create `src/app/(auth)/esqueci-senha/page.tsx`, `src/app/(auth)/redefinir-senha/page.tsx`; Modify `src/app/(auth)/login/page.tsx`.

Design system: spec §Design system (irmão do login). Reusar layout/tokens do `login/page.tsx` e `login-side-panel`. `"use client"`.

- [ ] **Step 1: Teste (jsdom)** — esqueci-senha: renderiza campo email + botão; após submit (mock fetch) → estado sucesso com mensagem genérica. redefinir-senha: renderiza 2 campos senha + toggle; senhas divergentes → erro "não coincidem"; medidor de força aparece. (jsdom, `.toBeTruthy/.toBeNull`, sem jest-dom.)
- [ ] **Step 2: Rodar → falha.**
- [ ] **Step 3: Implementar** ambas as páginas conforme design system. `/redefinir-senha`: no mount, ler `t` da query, guardar em state, `history.replaceState` pra limpar URL; medidor de força client-side (heurística comprimento+variedade, só visual, com rótulo textual). Adicionar headers `Referrer-Policy: no-referrer` + `Cache-Control: no-store` (via metadata/route config ou middleware da rota). Toggle Eye/EyeOff. Estados de erro (role=alert) e sucesso.
- [ ] **Step 4: Modificar login** — em `src/app/(auth)/login/page.tsx`, trocar `href={FORGOT_PASSWORD_WHATSAPP_URL}` do "Esqueci minha senha" por `<Link href="/esqueci-senha">`. Remover `FORGOT_PASSWORD_WHATSAPP_URL` se ficar órfão.
- [ ] **Step 5: Rodar testes → passa.**
- [ ] **Step 6: Commit** — `feat(reset-senha): páginas esqueci-senha e redefinir-senha + link no login`

---

## Task 8: Verificação final (MANDATORY)

- [ ] **Step 1: Typecheck** — `./node_modules/.bin/tsc --noEmit -p tsconfig.json` → 0 erros.
- [ ] **Step 2: Suíte completa** — `npm test` → todos passam.
- [ ] **Step 3: Build** — `./node_modules/.bin/next build` → sucesso.
- [ ] **Step 4: Codex review de segurança** — a dupla revisa o diff completo:
`export PATH="$HOME/.nvm/versions/node/v22.18.0/bin:$PATH"; codex exec --sandbox read-only "revise adversarialmente este diff de RESET DE SENHA. Foco segurança: consumo atômico realmente atômico? timingSafeEqual correto? anti-enumeração (tempo+resposta)? revogação de sessão dispara? GlobalAudit não viola FK (actorId null)? token não vaza? rate limit nos 2 endpoints? senha 8-72? $(git diff main...HEAD)" </dev/null`
Corrigir achados reais; rejeitar falso-positivo com justificativa.
- [ ] **Step 5: Verificação manual da revogação** (não automatizável fácil): logar, resetar a senha, confirmar que a sessão antiga cai no login em ≤5min.
- [ ] **Step 6: Commit final** — `git add -A && git commit -m "chore(reset-senha): verificação final (typecheck+testes+build+codex)"`

## Deploy (fora do plano de código — dono decide)
Merge PR → main. ⚠️ `./node_modules/.bin/prisma migrate deploy` em prod ANTES do `vercel deploy --prod`. RESEND já ativo. Testar o fluxo real em prod com um e-mail próprio.
