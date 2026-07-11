# Gestão de usuário no super admin (Fase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recomendado) ou executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Super admin gerencia usuário de qualquer ótica com campos certos — login read-only no editar (fecha bug que trava a tela), editável no criar aceitando login-curto ou e-mail, campo "E-mail de recuperação" nos dois modais — e corrige o bug cross-tenant do PATCH.

**Architecture:** SEM campo username, SEM migração, SEM tocar em `auth.ts`. Função pura `normalizeLoginEmail` compartilhada (espelha a regra do auth). Login read-only no editar → o `email` sai do update → BUG-1 neutralizado. `recoveryEmail` (Fase 1, já em prod) exposto nos modais do super admin, alimentado pelo GET de LISTA (o modal de edição vem da lista, não de GET individual).

**Tech Stack:** Next 16 App Router, Prisma+Neon, zod, React + shadcn, vitest.

**Environment notes:** Branch `feat/gestao-usuario-super-admin`. **SEM migração** (recoveryEmail já existe no schema). Deploy: `vercel deploy --prod` direto, NADA de `migrate deploy`. Comandos: `npm test`, `./node_modules/.bin/tsc --noEmit`. `normalizeRecoveryEmail` já existe e é exportada em `src/services/user.service.ts:19`. Spec: `docs/superpowers/specs/2026-07-11-gestao-usuario-super-admin-fase2-design.md`.

---

## File Structure
- Create: `src/lib/normalize-login.ts` + `.test.ts` (função pura `normalizeLoginEmail`).
- Modify: `src/app/api/admin/companies/[id]/users/route.ts` (POST: schema email→min(1)+recoveryEmail, normaliza; GET lista: +recoveryEmail no select) + `.test.ts` se houver.
- Modify: `src/app/api/admin/companies/[id]/users/[userId]/route.ts` (PATCH: remove email do schema, +recoveryEmail, corrige BUG-2; GET: +recoveryEmail no select).
- Modify: `src/app/admin/(painel)/clientes/[id]/company-users.tsx` (interface UserData +recoveryEmail; EditUserModal login read-only + campo recovery, para de enviar email; CreateUserModal login type=text + campo recovery).
- Modify: `src/app/(dashboard)/dashboard/usuarios/page.tsx` (rótulo "Login (usuário)" + usa normalizeLoginEmail).

---

## Task 1: Função `normalizeLoginEmail` (pura)

**Files:** Create `src/lib/normalize-login.ts` + `src/lib/normalize-login.test.ts`.

- [ ] **Step 1: teste** (`normalize-login.test.ts`):
```ts
import { describe, it, expect } from "vitest";
import { normalizeLoginEmail } from "./normalize-login";

describe("normalizeLoginEmail", () => {
  it("valor sem @ vira <valor>@login minúsculo", () => {
    expect(normalizeLoginEmail("Matheusr")).toBe("matheusr@login");
    expect(normalizeLoginEmail("  ADO  ")).toBe("ado@login");
  });
  it("valor com @ fica minúsculo + trim", () => {
    expect(normalizeLoginEmail("  Joao@X.com ")).toBe("joao@x.com");
  });
});
```
- [ ] **Step 2: rodar → falha.** `npm test -- src/lib/normalize-login.test.ts`
- [ ] **Step 3: implementar:**
```ts
/**
 * Normaliza um valor de LOGIN para o formato que o banco/authorize esperam.
 * sem "@" → "<valor>@login" (sintético); com "@" → minúsculo + trim.
 * Espelha auth.ts:72-74 — o que é gravado é sempre alcançável no login.
 */
export function normalizeLoginEmail(raw: string): string {
  const v = raw.trim();
  return v.includes("@") ? v.toLowerCase() : `${v.toLowerCase()}@login`;
}
```
- [ ] **Step 4: rodar → passa.**
- [ ] **Step 5: commit** — `feat(fase2): normalizeLoginEmail compartilhado (espelha auth)`

---

## Task 2: Rota POST super admin (criar) + GET lista

**Files:** Modify `src/app/api/admin/companies/[id]/users/route.ts` (+ `.test.ts` se existir).

Contexto: `createUserSchema` (linha 82) tem `email: z.string().email()`. Checagem de duplicidade JÁ escopada por companyId (linhas 156-161, `mode:"insensitive"`). GET de LISTA select (linhas 51-63) NÃO devolve recoveryEmail.

- [ ] **Step 1: teste** — se houver `route.test.ts`, adicionar; senão criar seguindo o padrão de mock admin do projeto. Casos:
  - criar com `email: "matheusr"` (login-curto) → `prisma.user.create` recebe `email: "matheusr@login"`.
  - criar com `email: "Joao@X.com"` → recebe `email: "joao@x.com"`.
  - criar com `recoveryEmail: "  R@Y.com "` → recebe `recoveryEmail: "r@y.com"`; vazio → null.
  - duplicidade: mesmo login na mesma empresa → 400; (o mock de findFirst controla).
  (Se testar a rota admin for custoso pelo getAdminSession/scope, focar no essencial mockando a sessão admin como os outros testes de rota admin fazem.)
- [ ] **Step 2: rodar → falha.**
- [ ] **Step 3: implementar:**
  - `createUserSchema` (linha 82): `email: z.string().email()` → **`email: z.string().min(1)`**; adicionar `recoveryEmail: z.string().email().or(z.literal("")).nullable().optional()`.
  - Importar `normalizeLoginEmail` (Task 1) e `normalizeRecoveryEmail` de `@/services/user.service`.
  - ⚠️ O `email` vem do `parsed.data`. Normalizar UMA vez logo após o parse: `const email = normalizeLoginEmail(parsed.data.email)`. Usar esse `email` na checagem de duplicidade (156-161).
  - ⚠️ O `create` real é `tx.user.create` DENTRO de um `$transaction` (linhas **207-216**), escrevendo `email: email.toLowerCase().trim()` na **linha 211**. Trocar a linha 211 por `email,` (já normalizado acima — NÃO re-aplicar toLowerCase) e adicionar `recoveryEmail: normalizeRecoveryEmail(parsed.data.recoveryEmail),` no mesmo `data`.
  - GET de lista (select 51-63): adicionar `recoveryEmail: true`.
  - (Opcional) a resposta 201 do POST não devolve recoveryEmail — só adicionar se algum consumidor precisar; a lista (GET) já basta para o modal.
- [ ] **Step 4: rodar → passa.** + `./node_modules/.bin/tsc --noEmit` sem novos erros.
- [ ] **Step 5: commit** — `feat(fase2): POST super admin aceita login-curto (normalizado) + recoveryEmail; GET lista devolve recoveryEmail`

---

## Task 3: Rota PATCH super admin (editar) + GET individual

**Files:** Modify `src/app/api/admin/companies/[id]/users/[userId]/route.ts`.

Contexto: `updateUserSchema` (54-60) tem `email: z.string().email().optional()`. Checagem de duplicidade (98-100) é `findFirst({ where: { email, id: { not } } })` SEM companyId (BUG-2). Persistência usa `...(campo && { campo })` (110-115). GET individual select (28-42) sem recoveryEmail.

- [ ] **Step 1: teste** — casos:
  - editar usuário de login-curto (email `matheusr@login`) sem enviar email → 200, `user.update` NÃO altera email.
  - `recoveryEmail: "x@y.com"` → update recebe `recoveryEmail: "x@y.com"`; `recoveryEmail: ""` → recebe `null` (LIMPA, não no-op).
  - recoveryEmail inválido → 400.
- [ ] **Step 2: rodar → falha.**
- [ ] **Step 3: implementar:**
  - `updateUserSchema` (54-60): **remover a linha `email: z.string().email().optional()`**; adicionar `recoveryEmail: z.string().email().or(z.literal("")).nullable().optional()`.
  - **Remover o bloco de checagem de email duplicado (linhas ~97-104)** — o email não é mais editável, o bloco fica morto. (Isso elimina o BUG-2: a checagem cross-tenant deixa de existir.)
  - No `data` do `user.update` (110-115): remover `...(email && { email: ... })`; adicionar persistência de recoveryEmail que LIMPA vazio:
    ```ts
    ...(("recoveryEmail" in parsed.data) && { recoveryEmail: normalizeRecoveryEmail(parsed.data.recoveryEmail) }),
    ```
    (Importar `normalizeRecoveryEmail` de `@/services/user.service`.)
  - GET individual (select 28-42): adicionar `recoveryEmail: true`.
- [ ] **Step 4: rodar → passa.** + tsc sem novos erros.
- [ ] **Step 5: commit** — `fix(fase2): PATCH super admin — login read-only (fecha BUG-1), recoveryEmail limpa vazio, remove checagem cross-tenant (BUG-2)`

---

## Task 4: Modais do super admin (`company-users.tsx`)

**Files:** Modify `src/app/admin/(painel)/clientes/[id]/company-users.tsx`.

Contexto: `interface UserData` (41-49) sem recoveryEmail. `CreateUserModal` (399): state `email` (411), `type="email"` (482), body `{name, email, password, role, branchId}` (427). `EditUserModal` (706): state `email` (720), body `{name, email, role, branchId}` (~735), campo `type="email" required` (~783).

- [ ] **Step 1: teste (jsdom, se viável)** — seguir padrão .tsx do projeto. Mínimo: EditUserModal renderiza login como read-only (input `readOnly` ou texto) mostrando parte legível (sem `@login`) + campo "E-mail de recuperação"; CreateUserModal tem campo login `type="text"` + campo recovery. Se render completo for inviável (deps), documentar e cobrir o essencial. Mocke `fetch`.
- [ ] **Step 2: rodar → falha.**
- [ ] **Step 3: implementar:**
  - `interface UserData` (41-49): adicionar `recoveryEmail?: string | null;`.
  - **EditUserModal:**
    - state: adicionar `const [recoveryEmail, setRecoveryEmail] = useState(user.recoveryEmail ?? "")`. **REMOVER a declaração `const [email, setEmail] = useState(user.email)` (linha 720) inteira** — o login vira read-only usando `user.email` direto, então o state `email`/`setEmail` fica órfão (código morto; remover para não deixar var não-usada).
    - campo de login: virar READ-ONLY. Trocar por um Input `readOnly` (ou texto) com `value={user.email.endsWith("@login") ? user.email.replace("@login","") : user.email}`, `className` com `bg-muted`, `aria-readonly`, SEM `type="email"`, SEM `required`. Label "Login (usuário)". Nota discreta se sintético: "não é um e-mail — é o usuário de acesso".
    - adicionar campo "E-mail de recuperação": `<Label>` + `<Input type="email" value={recoveryEmail} onChange={e=>setRecoveryEmail(e.target.value)} />` + ajuda "Para onde enviamos o link se a senha for esquecida."
    - body do PATCH (~735): trocar `{name, email, role, branchId}` por `{name, role, branchId, recoveryEmail}` (SEM email).
  - **CreateUserModal:**
    - campo login (482): `type="email"` → **`type="text"`**, placeholder "ex: matheusr ou email@exemplo.com", Label "Login (usuário)", ajuda "Nome curto de acesso; não precisa ser e-mail."
    - state: adicionar `const [recoveryEmail, setRecoveryEmail] = useState("")` + campo "E-mail de recuperação" (type="email", opcional, mesma ajuda).
    - body do POST (427): adicionar `recoveryEmail`.
- [ ] **Step 4: rodar → passa.** + tsc sem novos erros.
- [ ] **Step 5: commit** — `feat(fase2): modais super admin — login read-only/editável certo + campo e-mail de recuperação`

---

## Task 5: Dashboard `usuarios/page.tsx` (rótulo + normalização)

**Files:** Modify `src/app/(dashboard)/dashboard/usuarios/page.tsx`.

Contexto: campo de login rotulado hoje; normalização inline `${login}@login` nas linhas 144 e 196; exibição legível na 122/345. `funcionarios/page.tsx` NÃO tem campo de login → NÃO tocar.

- [ ] **Step 1: teste (jsdom, se viável)** — o form de criar mostra label "Login (usuário)"; comportamento de submit inalterado. Se inviável, teste mínimo/documentar.
- [ ] **Step 2: rodar → falha (ou ajustar assert do rótulo).**
- [ ] **Step 3: implementar:**
  - Rótulo do campo de login → **"Login (usuário)"** — há DOIS labels a trocar: o de criar (`<Label>Login *</Label>` ~linha 444) e o de editar (`<Label>Login</Label>` ~linha 520). + microcopy `text-xs text-muted-foreground` "Nome curto que a pessoa usa para entrar; não precisa ser e-mail." (ao menos no de criar).
  - Importar `normalizeLoginEmail` e substituir as 2 cópias inline (144, 196): `loginValue.includes("@") ? loginValue : ${loginValue.toLowerCase()}@login` → `normalizeLoginEmail(loginValue)`. Comportamento idêntico.
- [ ] **Step 4: rodar → passa.** + tsc.
- [ ] **Step 5: commit** — `feat(fase2): dashboard usuarios — rótulo "Login (usuário)" + normalizeLoginEmail`

---

## Task 6: Verificação final (MANDATORY)

- [ ] **Step 1: Typecheck** — `./node_modules/.bin/tsc --noEmit` → 0 erros.
- [ ] **Step 2: Suíte completa** — `npm test` → todos passam.
- [ ] **Step 3: Build** — `./node_modules/.bin/next build` → sucesso.
- [ ] **Step 4: Codex review** — diff completo:
`export PATH="$HOME/.nvm/versions/node/v22.18.0/bin:$PATH"; codex exec --sandbox read-only "revise este diff de gestão de usuário no super admin. Foco: normalizeLoginEmail espelha o auth (conta-fantasma fechada)? login read-only no editar realmente impede alterar email? recoveryEmail LIMPA com vazio (não no-op)? a remoção da checagem de email duplicado no PATCH fechou o BUG-2 cross-tenant sem abrir outra brecha? o POST escopa duplicidade por companyId? algum multi-tenant/IDOR? $(git diff main...HEAD)" </dev/null`
Corrigir achados reais; rejeitar falso-positivo com justificativa.
- [ ] **Step 5: Commit final** — `chore(fase2): verificação final (typecheck+testes+build+codex)`

## Deploy (dono decide)
SEM migração. Merge → `vercel deploy --prod`. Testar: pelo super admin, editar uma conta de login-curto (não quebra), criar uma conta de login-curto, preencher recoveryEmail de uma conta e conferir que o reset alcança; limpar o recoveryEmail e conferir que zera.
