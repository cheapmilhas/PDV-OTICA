# Reset alcança contas de username (recoveryEmail) — Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) ou executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Contas cujo login não é e-mail entregável passam a ter um `recoveryEmail` opcional, e o reset self-service passa a alcançá-las enviando o link para esse e-mail real.

**Architecture:** Campo `User.recoveryEmail` nullable (sem unicidade). O endpoint `esqueci-senha` busca `email` OU `recoveryEmail`, considera entregável quem tem `recoveryEmail` OU `email` não-sintético, e envia ao e-mail real (recoveryEmail ?? email), agrupando por destino. O template mostra nome+loja (sem role). Os forms de usuário/funcionário ganham o campo; a rota/serviço persistem com normalização e tratam o `sanitizeUserDTO` que engole `""`.

**Tech Stack:** Next 16 App Router, Prisma+Neon, next-auth v5 (JWT), Resend, zod, vitest.

**Environment notes:** Branch `feat/reset-recovery-email` (em cima de `feat/reset-senha-self-service`). ⚠️ MIGRAÇÃO MANUAL: gerar o `.sql` SEM tocar banco (o `.env DATABASE_URL` = mesmo Neon de prod, não há dev isolado; `migrate dev` rodaria contra prod). Hand-written seguindo o padrão das migrações do repo + `prisma generate` + `prisma validate`. Aplicar em prod com `./node_modules/.bin/prisma migrate deploy` ANTES do `vercel deploy --prod`. `NEXT_PUBLIC_APP_URL` já setado. Comandos: `npm test` (=vitest run), `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/prisma`. GlobalAudit NÃO envolvido aqui. Spec: `docs/superpowers/specs/2026-07-11-reset-recovery-email-fase1-design.md`.

---

## File Structure
- Modify: `prisma/schema.prisma` (campo `recoveryEmail String?` no model User) + `.sql` manual.
- Modify: `src/lib/validations/user.schema.ts` (campo nos 2 schemas + `sanitizeUserDTO` preserva recoveryEmail).
- Modify: `src/services/user.service.ts` (normalização + 4 selects).
- Modify: `src/app/api/auth/esqueci-senha/route.ts` (busca OR, filtro, destino, agrupamento, label nome+loja) + `.test.ts`.
- Modify: `src/app/(dashboard)/dashboard/funcionarios/page.tsx` e `.../usuarios/page.tsx` (campo no form).

---

## Task 1: Migração (campo recoveryEmail)

**Files:** Modify `prisma/schema.prisma`; Create migração SQL.

- [ ] **Step 1: Adicionar ao schema** — no model `User` (após a linha `email String` / junto aos escalares), adicionar:
```prisma
  // Reset de senha: e-mail de contato REAL para contas cujo `email` principal é
  // sintético (@login/@funcionario.interno) ou uma caixa inexistente. Nullable,
  // sem unicidade (dois funcionários podem compartilhar um e-mail da loja). O
  // reset envia o link para cá quando preenchido. NÃO afeta o login (que usa email).
  recoveryEmail              String?
```

- [ ] **Step 2: Validar schema** — Run: `./node_modules/.bin/prisma validate`. Expected: "The schema at prisma/schema.prisma is valid".

- [ ] **Step 3: Criar a migração à mão (NÃO rodar migrate dev).** Create `prisma/migrations/20260711140000_user_recovery_email/migration.sql`:
```sql
-- Reset self-service alcança contas de username: e-mail de contato real, opcional.
-- Aditiva, nullable, sem índice (sem unicidade — pode ser compartilhado). Zero lock
-- relevante em User. Reversível.
ALTER TABLE "User" ADD COLUMN "recoveryEmail" TEXT;
```

- [ ] **Step 4: Gerar o client** — Run: `./node_modules/.bin/prisma generate`. Expected: "Generated Prisma Client". (NÃO conecta no banco.)

- [ ] **Step 5: Commit**
```bash
git add prisma/schema.prisma prisma/migrations/20260711140000_user_recovery_email/
git commit -m "feat(reset-fase1): campo User.recoveryEmail (nullable, sem unicidade)"
```

---

## Task 2: Schema de validação + sanitizeUserDTO

**Files:** Modify `src/lib/validations/user.schema.ts`.

Contexto: `createUserSchema` e `updateUserSchema` são `z.object`; o campo `email` deles é `z.string().min(1)` (é LOGIN, não e-mail — não confundir). `sanitizeUserDTO(data)` hoje descarta TODO campo `""`/`null`/`undefined` — isso engoliria `recoveryEmail:""` no update, impedindo LIMPAR o campo.

- [ ] **Step 1: Escrever o teste** — Create/append em `src/lib/validations/user.schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createUserSchema, updateUserSchema, sanitizeUserDTO } from "./user.schema";

describe("recoveryEmail no schema de usuário", () => {
  it("aceita e-mail válido, vazio e ausente; rejeita inválido", () => {
    expect(createUserSchema.safeParse({ name: "A", email: "a", password: "12345678", role: "VENDEDOR", recoveryEmail: "x@y.com" }).success).toBe(true);
    expect(createUserSchema.safeParse({ name: "A", email: "a", password: "12345678", role: "VENDEDOR", recoveryEmail: "" }).success).toBe(true);
    expect(createUserSchema.safeParse({ name: "A", email: "a", password: "12345678", role: "VENDEDOR" }).success).toBe(true);
    expect(createUserSchema.safeParse({ name: "A", email: "a", password: "12345678", role: "VENDEDOR", recoveryEmail: "nao-email" }).success).toBe(false);
  });
  it("sanitizeUserDTO PRESERVA recoveryeMail e mapeia vazio para null (permite limpar)", () => {
    expect(sanitizeUserDTO({ name: "A", recoveryEmail: "" }).recoveryEmail).toBeNull();
    expect(sanitizeUserDTO({ name: "A", recoveryEmail: "x@y.com" }).recoveryEmail).toBe("x@y.com");
    expect("recoveryEmail" in sanitizeUserDTO({ name: "A" })).toBe(false); // ausente → não aparece
  });
});
```

- [ ] **Step 2: Rodar → falha.** `npm test -- src/lib/validations/user.schema.test.ts`

- [ ] **Step 3: Implementar.** Em `createUserSchema` e `updateUserSchema`, adicionar o campo (após `defaultCommissionPercent`):
```ts
  recoveryEmail: z.string().email("E-mail de recuperação inválido").or(z.literal("")).nullable().optional(),
```
E reescrever `sanitizeUserDTO` para preservar `recoveryEmail` (mapeando `""`→`null`), sem quebrar o resto:
```ts
export function sanitizeUserDTO(data: any) {
  const result: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "recoveryEmail") {
      // Preserva SEMPRE recoveryEmail: "" ou null → null (permite LIMPAR no update);
      // string → mantém. Não pode ser engolido como os demais campos vazios.
      result[key] = value === "" || value === null ? null : value;
      continue;
    }
    if (value !== "" && value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}
```

- [ ] **Step 4: Rodar → passa.** `npm test -- src/lib/validations/user.schema.test.ts`

- [ ] **Step 5: Commit** — `feat(reset-fase1): recoveryEmail nos schemas + sanitizeUserDTO preserva (vazio→null)`

---

## Task 3: Serviço de usuário (normalização + selects)

**Files:** Modify `src/services/user.service.ts`.

Contexto: `create` (linhas ~123-178) e `update` (~183-233). O `email` é normalizado com `.toLowerCase().trim()` (create linha 148, update 212-214). Há 4 `select` explícitos que omitem recoveryEmail: list (~66), getById (~100), create (~152), update (~220).

- [ ] **Step 1: Escrever o teste** — em `src/services/user.service.test.ts` (append; se não existir, criar seguindo o padrão de mock de prisma dos testes de service do projeto):
```ts
// Testa a NORMALIZAÇÃO de recoveryEmail em create/update.
// Mock: prisma.user.create/update captura o `data` recebido.
// Assere: recoveryEmail "  X@Y.COM " → "x@y.com"; "" → null.
```
(Implementer: seguir o padrão de mock já usado nos `*.service.test.ts` do repo; se o service não tiver teste hoje, o teste pode focar numa função pura de normalização extraída — ver Step 3.)

- [ ] **Step 2: Rodar → falha.**

- [ ] **Step 3: Implementar.**
  (a) Extrair um helper local no topo do service (ou inline nos dois pontos):
  ```ts
  const normalizeRecoveryEmail = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim().toLowerCase();
    return t === "" ? null : t;
  };
  ```
  (b) No `create` (dentro do `data:` do `prisma.user.create`), após `email: ...`:
  ```ts
      recoveryEmail: normalizeRecoveryEmail((data as any).recoveryEmail),
  ```
  (c) No `update`, após o bloco de normalização do email (linha ~214), antes do `prisma.user.update`:
  ```ts
    if ("recoveryEmail" in updateData) {
      updateData.recoveryEmail = normalizeRecoveryEmail(updateData.recoveryEmail);
    }
  ```
  (d) Adicionar `recoveryEmail: true,` aos QUATRO `select` (list ~66, getById ~100, create ~152, update ~220).

- [ ] **Step 4: Rodar → passa.** + `./node_modules/.bin/tsc --noEmit` sem novos erros.

- [ ] **Step 5: Commit** — `feat(reset-fase1): normaliza recoveryEmail (lowercase/trim/vazio→null) + selects`

---

## Task 4: Endpoint esqueci-senha (busca OR + filtro + destino + agrupamento + label)

**Files:** Modify `src/app/api/auth/esqueci-senha/route.ts` + `src/app/api/auth/esqueci-senha/route.test.ts`.

Contexto: hoje o `doWork` faz `findMany({ where: { email } })`, filtra `INTERNAL_LOGIN_SUFFIXES`, monta `links: [{selector, verifier, companyName}]`, e envia UM `sendEmail({ to: emailLower, ... })` com N botões via `renderEmailTemplate("password-reset", { links: [{label, url}] })`.

- [ ] **Step 1: Escrever/adicionar testes.** Em `route.test.ts` (o arquivo já mocka prisma.user.findMany, $transaction, passwordResetToken, sendEmail). Novos casos:
```ts
it("conta sintética COM recoveryEmail: token criado e link enviado ao recoveryEmail", async () => {
  findMany.mockResolvedValueOnce([
    { id: "u1", name: "Francisco", email: "francisco@login", recoveryEmail: "fs@gmail.com", company: { name: "Loja A" } },
  ]);
  const res = await callWithFloor(makeReq({ email: "fs@gmail.com" }, "10.9.0.1"));
  expect(res.status).toBe(200);
  expect($transaction).toHaveBeenCalledTimes(1);
  expect(sendEmail).toHaveBeenCalledTimes(1);
  expect((sendEmail.mock.calls[0][0] as { to: unknown }).to).toBe("fs@gmail.com");
});
it("conta sintética SEM recoveryEmail: nenhum token, nenhum envio, 200 genérico", async () => {
  findMany.mockResolvedValueOnce([
    { id: "u2", name: "Ada", email: "ada@login", recoveryEmail: null, company: { name: "Loja A" } },
  ]);
  const res = await callWithFloor(makeReq({ email: "ada@login" }, "10.9.0.2"));
  expect(res.status).toBe(200);
  expect($transaction).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
});
it("label do botão mostra nome + loja, sem role", async () => {
  findMany.mockResolvedValueOnce([
    { id: "u3", name: "Leila", email: "leila@x.com", recoveryEmail: null, company: { name: "Atacadão" } },
  ]);
  await callWithFloor(makeReq({ email: "leila@x.com" }, "10.9.0.3"));
  const arg = sendEmail.mock.calls[0][0] as { html: string };
  expect(arg.html).toContain("Leila");
  expect(arg.html).toContain("Atacadão");
});
it("destinos distintos (email real vs recoveryEmail): um envio por destino", async () => {
  findMany.mockResolvedValueOnce([
    { id: "u4", name: "A", email: "a@x.com", recoveryEmail: null, company: { name: "L1" } },
    { id: "u5", name: "B", email: "b@login", recoveryEmail: "b@gmail.com", company: { name: "L2" } },
  ]);
  await callWithFloor(makeReq({ email: "a@x.com" }, "10.9.0.4"));
  // Só a conta cujo email/recoveryEmail casa "a@x.com" é elegível → 1 envio.
  // (Este teste garante que a busca OR + agrupamento não vaza a conta B.)
  expect(sendEmail).toHaveBeenCalledTimes(1);
  expect((sendEmail.mock.calls[0][0] as { to: unknown }).to).toBe("a@x.com");
});
```
(Ajustar os mocks de findMany para INCLUIR `name` e `recoveryEmail` nos objetos — os testes existentes que não têm esses campos continuam válidos com `recoveryEmail: undefined`.)

- [ ] **Step 2: Rodar → novos falham.** `npm test -- src/app/api/auth/esqueci-senha/route.test.ts`

- [ ] **Step 3: Implementar em `doWork`.**
  (a) Busca OR (o `where` do findMany):
  ```ts
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: { equals: emailLower, mode: "insensitive" } },
          { recoveryEmail: { equals: emailLower, mode: "insensitive" } },
        ],
      },
      include: { company: true },
    });
  ```
  (b) Filtro de entregável — substituir o filter atual por:
  ```ts
    const deliverable = users.filter(
      (u) =>
        u.recoveryEmail != null ||
        !INTERNAL_LOGIN_SUFFIXES.some((suffix) => u.email.endsWith(suffix))
    );
  ```
  (c) No loop que cria tokens, coletar também `name` e `targetEmail`:
  ```ts
    const links: { selector: string; verifier: string; companyName?: string; name: string; targetEmail: string }[] = [];
    for (const u of deliverable) {
      const { selector, verifier, verifierHash } = generateTokenParts();
      await prisma.$transaction([ /* deleteMany + create como já é */ ]);
      links.push({
        selector, verifier,
        companyName: u.company?.name,
        name: u.name,
        targetEmail: (u.recoveryEmail ?? u.email),
      });
    }
  ```
  (d) Agrupar por `targetEmail` e enviar um `sendEmail` por destino; label = nome + loja:
  ```ts
    const byDest = new Map<string, typeof links>();
    for (const l of links) {
      const arr = byDest.get(l.targetEmail) ?? [];
      arr.push(l); byDest.set(l.targetEmail, arr);
    }
    for (const [targetEmail, group] of byDest) {
      const templateLinks = group.map((l) => ({
        label: l.companyName ? `${l.name} · ${l.companyName}` : l.name,
        url: `${baseUrl}/redefinir-senha?t=${l.selector}.${l.verifier}`,
      }));
      const { html, text } = renderEmailTemplate("password-reset", { links: templateLinks });
      try {
        await sendEmail({ to: targetEmail, subject: "Recuperar acesso ao Vis", html, text });
      } catch (err) {
        log.error("Falha ao enviar e-mail de recuperação", { error: err instanceof Error ? err.message : String(err) });
      }
    }
  ```
  (Remover o envio único anterior. `baseUrl` continua vindo de `NEXT_PUBLIC_APP_URL` com o guard atual.)

- [ ] **Step 4: Rodar → todos passam** (novos + antigos do arquivo). `npm test -- src/app/api/auth/esqueci-senha/route.test.ts`

- [ ] **Step 5: Commit** — `feat(reset-fase1): reset busca email OR recoveryEmail, envia ao real, label nome+loja`

---

## Task 5: Campo nos forms (funcionarios + usuarios)

**Files:** Modify `src/app/(dashboard)/dashboard/funcionarios/page.tsx`, `src/app/(dashboard)/dashboard/usuarios/page.tsx`.

Contexto: ambos postam em `POST /api/users` (criar) e `PUT /api/users/[id]` (editar). `funcionarios` gera `@funcionario.interno` e não mostra e-mail; `usuarios` tem o campo "login". A rota já usa `createUserSchema`/`updateUserSchema` (Task 2) e o service (Task 3), então basta o FRONT enviar `recoveryEmail` no body e pré-preencher na edição.

- [ ] **Step 1: Teste (jsdom).** Em cada `page.test.tsx` (seguir o padrão de teste .tsx do projeto): renderiza o form, existe um input "E-mail de recuperação"; ao submeter, o body do fetch inclui `recoveryEmail`. (Se testar o form completo for custoso, ao menos um teste que confirme o campo presente e ligado ao state.)

- [ ] **Step 2: Rodar → falha.**

- [ ] **Step 3: Implementar** nos dois forms:
  - Adicionar `recoveryEmail: ""` ao state do form.
  - Um `<Input type="email">` com `<Label>E-mail de recuperação</Label>` + texto de ajuda "Serve para a pessoa recuperar a senha sozinha por e-mail." (opcional).
  - Incluir `recoveryEmail: form.recoveryEmail || undefined` no body do POST e do PUT.
  - Na edição, pré-preencher `recoveryEmail` a partir do usuário carregado (o service agora retorna o campo).

- [ ] **Step 4: Rodar → passa.**

- [ ] **Step 5: Commit** — `feat(reset-fase1): campo e-mail de recuperação nos forms de usuário e funcionário`

---

## Task 6: Verificação final (MANDATORY)

- [ ] **Step 1: Typecheck** — `./node_modules/.bin/tsc --noEmit` → 0 erros.
- [ ] **Step 2: Suíte completa** — `npm test` → todos passam.
- [ ] **Step 3: Build** — `./node_modules/.bin/next build` → sucesso.
- [ ] **Step 4: Codex review** — a dupla revisa o diff:
`export PATH="$HOME/.nvm/versions/node/v22.18.0/bin:$PATH"; codex exec --sandbox read-only "revise este diff de reset-recovery-email. Foco: a busca OR email/recoveryEmail vaza cross-tenant ou enumera? o filtro de entregável está correto (conta sintética sem recoveryEmail continua excluída)? o agrupamento por targetEmail não mistura destinos? sanitizeUserDTO agora permite limpar recoveryEmail sem quebrar os outros campos? normalização lowercase aplicada? $(git diff main...HEAD)" </dev/null`
Corrigir achados reais; rejeitar falso-positivo com justificativa.
- [ ] **Step 5: Commit final** — `chore(reset-fase1): verificação final (typecheck+testes+build+codex)`

## Deploy (dono decide)
Merge → main. ⚠️ `./node_modules/.bin/prisma migrate deploy` em prod ANTES do `vercel deploy --prod`. Depois: dono preenche o `recoveryEmail` das 5 contas (+ contas de e-mail fake) pela tela e testa um reset real.
