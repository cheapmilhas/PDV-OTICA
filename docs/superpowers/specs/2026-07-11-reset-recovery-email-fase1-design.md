# Reset de senha alcança contas de username — Fase 1 (recoveryEmail)

**Data:** 2026-07-11
**Origem:** forja (painel adversarial 3×3, Codex=segurança) → brainstorming
**Escopo:** Fase 1 isolada. NÃO inclui campo `username` de primeira classe, telas de gestão dedicadas no super admin/dashboard, nem backfill em lote — tudo isso é Fase 2.

## Problema

O reset de senha self-service (lançado 2026-07-11) só alcança contas com e-mail entregável. Contas cujo login não é um e-mail real ficam de fora:

- **Sintéticas** `@login` / `@funcionario.interno`: 5 contas em prod (adopacajus, francisco em `@login`; Gabrielly, Vankerle, Berenice em `nome.TIMESTAMP@funcionario.interno`), todas VENDEDOR. O endpoint `esqueci-senha` as descarta via `INTERNAL_LOGIN_SUFFIXES` (não são endereços entregáveis).
- **E-mail de formato válido mas caixa inexistente**: ex. `admin@pdvotica.com` (ADMIN). O reset tenta enviar e a mensagem se perde — o sistema não tem como saber que a caixa não existe.

Fato central do domínio (verificado `auth.ts:64-115`): no Vis, e-mail NÃO identifica conta. A identidade real é o `userId` (cuid). Um valor de login sem `@` é resolvido como `${login}@login` e o login faz `findMany` multi-tenant. Mexer no `email` dessas contas quebraria o login delas.

## Objetivo

Permitir que essas contas tenham um **e-mail de contato real** e que o reset self-service passe a alcançá-las — sem quebrar o login atual de ninguém.

## Decisões (brainstorming, aprovadas pelo dono)

1. **Campo novo `recoveryEmail`, não reusar `email`.** Preserva o login (o `email=francisco@login` continua intacto; Francisco segue logando digitando "francisco"). Reversível.
2. **Sem unicidade.** `recoveryEmail` não tem índice único — dois funcionários podem compartilhar um e-mail da loja. Coerente com o reset multi-conta; o token amarra ao `userId`, não ao e-mail, então unicidade não agrega segurança e bloquearia um caso legítimo.
3. **Preenchido pelos forms existentes** (funcionários + usuários no dashboard), não por tela nova nem por escrita direta no banco.
4. **Busca do reset em `email` OR `recoveryEmail`.**
5. **Link vai para o e-mail que casou / o e-mail real da conta.**
6. **E-mail de reset mostra nome + loja, SEM role** (o painel de segurança vetou o role: endpoint público, incluir cargo vaza função a quem controla o inbox).
7. **As 5 contas atuais**: o dono/gerente preenche o `recoveryEmail` de cada uma pela tela depois do deploy (o sistema não pode adivinhar o e-mail real do vendedor).

## Componentes

### 1. Modelo de dados

`User.recoveryEmail String?` (nullable). Guarda o e-mail real de contato quando o `email` principal é sintético ou uma caixa inexistente. Não toca em `email`. Sem índice de unicidade. Sem backfill.

- Migração aditiva de uma coluna nullable — roda em prod sem lock relevante, reversível.
- ⚠️ Migração é **manual** em prod (mesmo banco Neon, sem dev isolado): `prisma migrate deploy` ANTES do deploy do código. Gerar o `.sql` sem tocar banco (padrão da Fase anterior: `prisma migrate diff`/hand-written + `prisma generate` + `prisma validate`).
- Normalização na escrita: `recoveryEmail` preenchido → valida formato de e-mail (zod `.email()`), grava lowercase. String vazia/whitespace → `NULL` (nunca `""`).

### 2. Endpoint `esqueci-senha` (busca + destino)

Arquivo: `src/app/api/auth/esqueci-senha/route.ts`.

**Busca (passo 4 atual):** hoje `findMany({ where: { email: { equals: emailLower, mode: insensitive } } })`. Passa a buscar em dois campos:
```
where: { OR: [
  { email:         { equals: emailLower, mode: "insensitive" } },
  { recoveryEmail: { equals: emailLower, mode: "insensitive" } },
] }
```
`include: { company: true }` permanece.

**Filtro de entregável (passo 5 atual):** hoje descarta contas cujo `email` termina em `@login`/`@funcionario.interno`. Passa a: uma conta é **entregável** se tiver um e-mail real — ou seja, `recoveryEmail != null` OU o `email` não é sintético. Regra:
```
deliverable = users.filter(u =>
  u.recoveryEmail != null || !INTERNAL_LOGIN_SUFFIXES.some(s => u.email.endsWith(s))
)
```

**Destino do link (passo 7/8 atual):** para cada conta entregável, o endereço de envio é:
```
targetEmail = recoveryEmail se preenchido
           senão email (que aqui é garantidamente não-sintético)
```
- Conta normal (achada por `email` real): link vai pro `email`.
- Conta sintética com `recoveryEmail`: link vai pro `recoveryEmail`.
- Conta com `email` de formato válido mas caixa fake + `recoveryEmail` preenchido: `recoveryEmail` (o real) tem prioridade.

Quando N contas casam o mesmo e-mail digitado, o e-mail continua sendo UM `sendEmail` com N botões (comportamento atual). Nota: se contas diferentes tiverem `targetEmail` diferentes (uma pelo email, outra pelo recoveryEmail), agrupar por `targetEmail` e enviar um e-mail por destino distinto (cada e-mail lista só as contas daquele destino) — não misturar contas de destinos diferentes num só envio.

**Preservado sem alteração:** resposta genérica 200 sempre idêntica; piso de latência 1200ms (`Promise.all([doWork, sleep])`); rate-limit por IP (429) e por e-mail (não curto-circuita); `NEXT_PUBLIC_APP_URL` como fonte única do link (anti-poisoning); token selector/verifier; `sendEmail` em try/catch que não relança.

### 3. Template de e-mail `password-reset`

Arquivo: `src/lib/emails/templates.ts` (case `password-reset`).

O rótulo de cada botão passa de `companyName` só para **`{name} · {companyName}`** (nome do usuário + loja). SEM role. `name` e `companyName` já são escapados (`escapeHtml`) — manter.

O endpoint passa a incluir `name` no payload de cada link (hoje só manda label derivado da company). O schema do template (`links: [{ label, url }]`) permanece — o endpoint monta o `label` com nome+loja. (Não adicionar `role` ao payload.)

### 4. Forms + rota de usuário

O campo opcional "E-mail de recuperação" entra nos dois forms do dashboard:

- `src/app/(dashboard)/dashboard/funcionarios/page.tsx` — hoje gera `@funcionario.interno` e não mostra campo de e-mail. Ganha o campo opcional.
- `src/app/(dashboard)/dashboard/usuarios/page.tsx` — hoje tem o campo "login" (vira `@login`). Ganha o campo opcional ao lado.

Ambos postam em `POST /api/users` (criar) e `PUT /api/users/[id]` (editar). A rota (`src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`) e/ou `src/services/user.service.ts` passam a aceitar e persistir `recoveryEmail`:
- validação: formato de e-mail ou vazio→null; grava lowercase;
- ajuda curta no campo: "Serve para a pessoa recuperar a senha sozinha por e-mail."

Isso permite ao dono/gerente abrir cada uma das 5 contas atuais (e contas ADMIN/GERENTE com e-mail fake como `admin@pdvotica.com`) e preencher o e-mail real — o reset passa a alcançá-las.

## Fluxo de dados (reset)

```
usuário digita e-mail X em /esqueci-senha
  → findMany OR(email=X, recoveryEmail=X)  [case-insensitive]
  → deliverable = contas com e-mail real (recoveryEmail!=null OU email não-sintético)
  → para cada: gera token (selector/verifier), targetEmail = recoveryEmail ?? email
  → agrupa por targetEmail → 1 sendEmail por destino, botões {name · loja}
  → SEMPRE resposta 200 genérica, após piso de latência
```

## Casos-limite / erros

- Conta sintética SEM `recoveryEmail` → continua descartada (não recebe nada). Correto.
- `recoveryEmail` = string vazia/whitespace → gravado `NULL`, não `""`.
- Mesmo `recoveryEmail` em N contas → cada conta recebe seu link (multi-conta).
- Conta achada tanto por `email` quanto por `recoveryEmail` (digitou o próprio recoveryEmail que por acaso é o email de outra) → dedup por `userId` (não gerar 2 tokens para o mesmo usuário no mesmo pedido).
- `sendEmail` falha (Resend fora) → logado, engolido, resposta genérica não revela. Token criado; usuário pode pedir de novo.
- Anti-enumeração: e-mail existente vs. inexistente → resposta idêntica, tempo uniforme.

## Testes (vitest)

- **Migração**: schema aplica `recoveryEmail` nullable; `prisma validate` ok.
- **Endpoint esqueci-senha**:
  - conta `email` sintético + `recoveryEmail` preenchido → 1 token, link enviado ao `recoveryEmail`;
  - conta sintética SEM `recoveryEmail` → nenhum token, nenhum envio, resposta genérica;
  - conta normal (email real) → inalterada, link ao `email`;
  - busca acha por `recoveryEmail` (digitou o recoveryEmail) → conta correta;
  - N contas com mesmo destino → 1 envio, N botões; destinos distintos → 1 envio por destino;
  - dedup por userId quando email e recoveryEmail apontam a mesma conta;
  - anti-enumeração: existente vs inexistente → corpo e status idênticos.
- **Template**: botão mostra `{name} · {loja}`, sem role; nome com caractere especial escapado.
- **Rota/forms**: `recoveryEmail` inválido → 400; vazio → persistido null; válido → persistido lowercase; criar e editar cobrem o campo.

## Fora de escopo (Fase 2)

Campo `username` de primeira classe; telas dedicadas de gestão de usuário no super admin e no dashboard (ver/ajustar/criar com username+email); backfill em lote; login por username como coluna própria (namespace disjunto por regex, índice único parcial — desenho já registrado na síntese da forja).

## Deploy

Merge → `prisma migrate deploy` em prod ANTES do `vercel deploy --prod` (a coluna precisa existir antes do código que a lê). `NEXT_PUBLIC_APP_URL=https://vis.app.br` já setado. Depois: dono preenche o `recoveryEmail` das 5 contas (+ contas de e-mail fake) pela tela e testa um reset real.
