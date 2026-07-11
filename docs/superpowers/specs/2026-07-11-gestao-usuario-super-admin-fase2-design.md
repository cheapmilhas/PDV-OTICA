# Gestão de usuário no super admin + desambiguação login/recuperação — Fase 2 — Design

**Data:** 2026-07-11
**Origem:** forja (painel 3×3: username KILL/YAGNI, base = Proposta A reforçada) → brainstorming
**Escopo:** SEM campo `username` de primeira classe, SEM migração, SEM mexer em `auth.ts`. Login continua funcionando como hoje (valor-sem-@ → `@login` sintético).

## Problema

Três coisas, todas confirmadas no código:
1. O super admin gerencia usuário de qualquer ótica (modais Editar/Novo em `company-users.tsx`), mas o campo "Email" desses modais **é o LOGIN** (identidade), não um e-mail de contato — e nada na tela deixa isso claro. O dono se confunde (achou que o campo "Email" já servia de e-mail de recuperação).
2. **BUG-1 (trava a tela):** a validação de login no super admin exige formato de e-mail (`z.string().email()`) tanto no criar (`route.ts:84`) quanto no editar (`[userId]/route.ts:56`) → **rejeita contas de login-curto** (`matheusr@login`). "Editar/Novo Usuário" quebra para essas contas.
3. **BUG-2 (cross-tenant, em prod):** o PATCH de editar (`.../users/[userId]/route.ts:98-100`) checa e-mail duplicado com `findFirst({ where: { email, id: { not } } })` **SEM `companyId`** → checagem GLOBAL, mas o e-mail é único POR EMPRESA. (O POST de criar JÁ escopa por `companyId` corretamente — `route.ts:156-161` — o bug é só no PATCH.)

O `recoveryEmail` (Fase 1, já em prod) resolve o reset das contas sem e-mail real, mas hoje só é editável no dashboard da ótica — não pelo super admin.

## Decisões (brainstorming, aprovadas pelo dono)

1. **Editar (super admin): login READ-ONLY.** Trocar o login é raro e arriscado; o super admin edita Nome, Cargo, Filial e o novo "E-mail de recuperação". Como o login não vai no update, o BUG-1 e o BUG-2 deixam de ser alcançáveis pelo editar (corrigimos o BUG-2 mesmo assim, por higiene).
2. **Criar (super admin): login EDITÁVEL, aceita login-curto OU e-mail**, normalizado server-side + "E-mail de recuperação".
3. **recoveryEmail no super admin: normal e editável**, sem mascaramento (o super admin é o dono, já tem acesso total por design).
4. **Dashboard: só alinhar rótulos + microcopy** (o campo recoveryEmail já existe lá da Fase 1). NÃO unificar os 2 forms.
5. Sem username, sem migração, sem tocar `auth.ts`.

## Normalização de login (fonte única)

Extrair a regra que HOJE já existe inline no dashboard (`usuarios/page.tsx:144,196`) para uma função pura compartilhada:

```ts
// normaliza um valor de LOGIN para o formato que o banco/authorize esperam.
// sem "@" → "<valor>@login" (sintético, minúsculo); com "@" → minúsculo + trim.
// Espelha auth.ts:72-74 — o que é gravado é sempre alcançável no login.
export function normalizeLoginEmail(raw: string): string {
  const v = raw.trim();
  return v.includes("@") ? v.toLowerCase() : `${v.toLowerCase()}@login`;
}
```

Local sugerido: `src/lib/normalize-login.ts` (ou junto de um util de user existente). Usada no POST do super admin e reusada no dashboard (substitui as 2 cópias inline, sem mudar comportamento).

## Componentes

### 1. Rota super admin — POST (criar) `src/app/api/admin/companies/[id]/users/route.ts`

DECISÃO CRAVADA (sem "OU"): **manter a chave `email` no schema**, relaxando a validação — o modal já envia `email`, menor diff.
- `createUserSchema` (linha 82): trocar `email: z.string().email()` por **`email: z.string().min(1)`**. Adicionar `recoveryEmail: z.string().email().or(z.literal("")).nullable().optional()`.
- Antes de criar: `const email = normalizeLoginEmail(parsed.email)`. A checagem de duplicidade JÁ é escopada por `companyId` (**linhas 156-161**) — manter, usando o `email` normalizado.
- Persistir `recoveryEmail` normalizado (reusar `normalizeRecoveryEmail` de `user.service.ts:19` — exportá-la se ainda não estiver, ou replicar a lógica trim/lowercase/vazio→null).

### 2. Rota super admin — PATCH (editar) `.../users/[userId]/route.ts`

DECISÃO CRAVADA: **remover `email` do `updateUserSchema`** (linha 54-60) — login é read-only, não editável. O modal para de enviar `email` (ver §3). Se alguma chave `email` chegar, o Zod default (`.strip()`) a ignora. Resultado: o login NÃO é alterado por esta rota → BUG-1 neutralizado.
- Adicionar `recoveryEmail: z.string().email().or(z.literal("")).nullable().optional()` ao `updateUserSchema` e persistir normalizado.
- **Corrigir BUG-2 (cravado, não condicional):** adicionar `companyId` ao `where` da checagem de duplicidade (linhas 98-100), seguindo o padrão correto do POST (156-161). Fazer isso mesmo com o email virando read-only, por higiene (a checagem hoje é cross-tenant e está em prod). Nota: com `email` fora do schema, o bloco `if (email && ...)` fica morto — remover o bloco inteiro OU corrigi-lo; preferir remover (login não muda mais).
- **GET individual** `[userId]/route.ts` (select linhas 28-42): adicionar `recoveryEmail: true`.
- ⚠️ **GET de LISTA** `route.ts` (select linhas 51-63): adicionar `recoveryEmail: true` TAMBÉM — o `EditUserModal` é alimentado pelo objeto da LISTA (`fetchUsers`), não por um GET individual (ver §3). Sem isso o modal de edição não pré-preenche.

### 3. Modal Editar Usuário (`EditUserModal` em `company-users.tsx`)

⚠️ O `EditUserModal` recebe `user={showEditModal}` vindo da LISTA (`fetchUsers`), tipada por `interface UserData` (linha 41). NÃO faz GET individual. Então:
- Adicionar `recoveryEmail?: string | null` à **`interface UserData`** (linha 41-49) — casa com o `recoveryEmail` que o GET de lista passa a devolver (§2).
- **Parar de enviar `email` no PATCH:** o `handleSubmit` do EditUserModal hoje inclui `email` no body — remover `email` do body (o login é read-only, não muda). Remover também `type="email"`/`required` do campo de login.
- **"Login (usuário)"** — READ-ONLY (`readOnly` + `bg-muted` + `aria-readonly`). Exibe só a parte legível: `email.endsWith("@login") ? email.replace("@login","") : email` (mesmo padrão do dashboard, `usuarios/page.tsx:122`); se `@login`/`@funcionario.interno`, nota discreta "não é um e-mail — é o usuário de acesso". Sem `type="email"`.
- **"E-mail de recuperação"** — NOVO, editável, `type="email"`, opcional. Ajuda "Para onde enviamos o link se a senha for esquecida." State inicial `user.recoveryEmail ?? ""`. Enviar `recoveryEmail` no body do PATCH.
- Nome / Cargo / Filial — inalterados. Botão "Redefinir senha" — inalterado.

### 4. Modal Novo Usuário (`CreateUserModal` em `company-users.tsx:399`)

- **"Login (usuário)"** — editável, **`type="text"`** (não `email`), placeholder "ex: matheusr ou email@exemplo.com", ajuda "Nome curto de acesso; não precisa ser e-mail." Envia o valor cru; a rota normaliza.
- **"E-mail de recuperação"** — NOVO, editável, `type="email"`, opcional, mesma ajuda do editar.
- Nome / Senha / Cargo / Filial — inalterados.

### 5. Dashboard

⚠️ Só `usuarios/page.tsx` tem campo de login visível. `funcionarios/page.tsx` NÃO tem campo de login (o e-mail é auto-gerado `${slug}.${Date.now()}@funcionario.interno`, sem input) — seus campos são Nome / Comissão / E-mail de recuperação.
- **`usuarios/page.tsx`**: rótulo do campo de login → **"Login (usuário)"** + microcopy "Nome curto que a pessoa usa para entrar; não precisa ser e-mail." Substituir as 2 cópias inline de `${login}@login` (linhas 144, 196) por `normalizeLoginEmail` (refactor sem mudança de comportamento).
- **`funcionarios/page.tsx`**: NÃO tem campo de login → nada de rótulo de login. Só garantir que a ajuda do "E-mail de recuperação" está consistente (a frase já é a mesma nos dois — apenas conferir).
- O campo "E-mail de recuperação" já existe nos dois (Fase 1) — manter.

## Design system (leve — modais existentes, admin light azul #2E6BFF)

Segue o padrão shadcn já usado no admin. Princípios aplicados (universais, não a paleta genérica sugerida pela busca):
- `Label` com `htmlFor`; nunca placeholder-only. Campo read-only visualmente distinto (fundo `bg-muted`, sem borda de foco de edição) e com `aria-readonly`/`readOnly`.
- **Cor nunca é o único indicador** — a distinção login vs recuperação vem do RÓTULO e da AJUDA textual, não de cor.
- Ajuda curta em `text-xs text-muted-foreground` sob cada campo.
- Erros inline `role="alert"` perto do campo. Botão desabilitado durante async. Focus visível. Alvos ≥44px.
- Transições 150-200ms. Sem emoji como ícone.
- Copy de desambiguação (fonte única para os dois modais e o dashboard):
  - Login: **"Login (usuário)"** + "Nome curto de acesso; não precisa ser e-mail."
  - Recuperação: **"E-mail de recuperação"** + "Para onde enviamos o link se a senha for esquecida."

## Fluxo de dados

```
CRIAR (super admin): modal envia {name, login, password, role, branchId, recoveryEmail}
  → rota: email = normalizeLoginEmail(login); recoveryEmail normalizado
  → checa duplicidade POR companyId (padrão existente) → cria
EDITAR (super admin): modal envia {name, role, branchId, recoveryEmail}  (login NÃO)
  → rota: atualiza campos; recoveryEmail normalizado; login intacto
GET (super admin): devolve ...+ recoveryEmail → modal edição pré-preenche
```

## Casos-limite / erros

- Login-curto no criar (`matheusr`) → normaliza para `matheusr@login`. Login com e-mail → lowercased.
- Duplicidade de login na MESMA empresa → 400 "já em uso"; mesma string em OUTRA empresa → permitido (escopo companyId).
- `recoveryEmail` vazio → null; inválido → 400; válido → lowercased.
- Editar conta de login-curto → salva sem erro (login read-only, não revalida formato). Fecha BUG-1.
- Conta com login sintético → modal mostra a parte legível, não `matheusr@login`.

## Testes (vitest)

- `normalizeLoginEmail` (pura): sem "@" → `x@login`; com "@" → lowercased; espaços trimados.
- Rota POST super admin: criar login-curto → grava `@login`; criar e-mail → grava lowercased; duplicidade por empresa (mesma bloqueia, outra não); recoveryEmail persistido/normalizado; recoveryEmail inválido → 400.
- Rota PATCH super admin: editar usuário de login-curto → 200 sem erro (não rejeita); recoveryEmail atualizado; login NÃO alterado; GET devolve recoveryEmail.
- Modais (jsdom, se viável): editar mostra login read-only + parte legível; criar tem campo login `type="text"` e recoveryEmail; ambos enviam recoveryEmail no body.
- Dashboard: rótulo "Login (usuário)" presente; comportamento de submit inalterado.

## Fora de escopo (registrado)

Campo `username` de primeira classe (painel julgou YAGNI — login-sem-@ já funciona); migração; mudança em `auth.ts`; unificar os 2 forms do dashboard; mascaramento de PII (dono decidiu mostrar normal). Fase 2b (username dedicado) só se o dono pedir um handle de identidade real.

## Deploy

SEM migração (não há mudança de schema). Merge → `vercel deploy --prod`. Nada de `migrate deploy`. Testar: pelo super admin, criar uma conta de login-curto e editar uma existente sem erro; preencher recoveryEmail de uma conta e conferir que o reset alcança.
