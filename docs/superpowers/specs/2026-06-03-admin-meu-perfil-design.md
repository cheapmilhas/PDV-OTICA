# Design — "Meu Perfil" do Admin (painel `/admin` do SaaS)

**Data:** 2026-06-03
**Contexto:** painel `/admin` (super-admin do SaaS "Vis"), NÃO o dashboard do lojista.
**Modelo de dados:** `AdminUser` (separado do `User` lojista), auth próprio via cookie `admin.session-token` (JWT `AdminPayload`).

## Problema

O super-admin logado não tem nenhuma tela para editar os **próprios** dados. Hoje:

- A tela `/admin/configuracoes/equipe` edita **outros** admins e exige `SUPER_ADMIN`.
- A rota `PATCH /api/admin/users/[id]` só aceita `name/role/active` (**não troca senha, não troca email**) e exige `SUPER_ADMIN`.
- A página `/admin/configuracoes` (raiz) é um `redirect("/admin/configuracoes/planos")` — rota morta.
- O MFA/2FA já existe em `/admin/configuracoes/seguranca` (em produção, Q8.3.1) e atua sobre o admin logado — é a única peça "de perfil" que existe.

## Escopo

**Implementar agora:**
1. **"Meu Perfil"** self-service do admin logado: editar **nome**, **email** (login) e **trocar senha**.
2. Aba/seção **"Usuários" com cadeado 🔒** — placeholder visual "em breve", sem rota funcional. A lógica fina (criar/gerenciar admins pelo perfil) será desenhada em conversa futura.

**Fora de escopo (decidido):**
- Reemissão de JWT do admin (não mexer na emissão de token que está em prod).
- Gestão de outros usuários a partir do perfil (fica só o cadeado).
- Avatar/foto.

## Decisões (do dono)

| Tema | Decisão |
|---|---|
| Quem edita o quê | Perfil = qualquer admin edita o próprio; configs de sistema seguem restritas. |
| Email (é o login, `@unique`) | **Editável, exigindo a senha atual** para confirmar + valida unicidade. |
| Navegação | A `/admin/configuracoes` raiz (redirect morto) **vira o "Meu Perfil"**. |
| Pós-edição de nome/email | **Só avisar** ("topo atualiza no próximo login"), **sem deslogar** e sem reemitir token. |
| Aba Usuários | Criar com **cadeado** (em breve), sem implementação. |

## Arquitetura

### 1. Navegação (`src/app/admin/admin-nav.tsx`)

- Item `{ href: "/admin/configuracoes", label: "Config", exact: true }` muda label para **"Meu Perfil"**, ícone `UserCircle`. Continua apontando para `/admin/configuracoes`.
- Os itens existentes (Planos, Equipe, Logs) permanecem inalterados.

### 2. Backend — nova rota `PATCH /api/admin/me`

Espelha o padrão de `/api/users/[id]/profile` (lojista), adaptado ao `AdminUser`.

- Autentica via **`getAdminSession()`** (NÃO `requireAdmin()` — este faz `redirect()`, válido só para Server Components; em route handler retorna 401 JSON manualmente, como `api/admin/users/route.ts` já faz). **Atua sempre sobre `session.id`** — nunca recebe `id` por parâmetro (elimina "editar o admin errado").
- **Revalida `active` no banco:** após `getAdminSession()`, carrega o `AdminUser` por `session.id` e rejeita se `!active` (401). Fecha a janela de cookie válido de admin desativado (mesmo padrão de `requireCompanyScope`).
- **Rate limit:** em requests que carregam senha (troca de email ou senha), aplica `rateLimitResponse(\`admin-me:${session.id}\`, {...})` de `src/lib/rate-limit.ts` → retorna 429 pronto ao estourar. Mesmo helper que `api/admin/auth/login` usa (ex.: `admin-mfa:${admin.id}`).
- Hash idêntico ao create existente: `bcryptjs`, `bcrypt.hash(pwd, 10)` / `bcrypt.compare`. (Confirmado em `src/app/api/admin/users/route.ts:66`.)
- Validação Zod:
  - `name`: string 2–100 (opcional).
  - `email`: string email (opcional), **normalizado `.trim().toLowerCase()`** no transform (o `@unique` do Postgres é case-sensitive; login compara normalizado).
  - `currentPassword`: string (obrigatória quando muda email OU senha).
  - `newPassword`: string min 8 (opcional).
- Regras:
  - **Detecção de mudança:** `emailChanged = emailNormalizado !== admin.email` (comparado **após** normalizar — enviar o próprio email atual, mesmo com case diferente, é no-op e NÃO exige senha). `currentPassword` só é exigida quando `emailChanged || newPassword`.
  - **Trocar email** (quando `emailChanged`): exige `currentPassword` correta (`bcrypt.compare` contra `AdminUser.password`); valida formato; valida **unicidade** (`findFirst({ where: { email: emailNormalizado, id: { not: session.id } } })`) → senão `EMAIL_TAKEN` (409, mensagem genérica "Email já está em uso").
  - **Trocar senha:** exige `currentPassword` correta; grava `bcrypt.hash(newPassword, 10)`.
  - **Trocar só nome:** não exige senha.
  - **Payload vazio / nada mudou:** se não há name novo, nem `emailChanged`, nem `newPassword` → short-circuit 200 no-op (sem `requiresRelogin`). Não escreve no banco.
- Resposta: `successResponse({ id, name, email, role })` + flag `requiresRelogin: true` quando nome ou email mudaram (para o front exibir o aviso).
- Erros padronizados: `UNAUTHORIZED` (401), `INVALID_PASSWORD` (400), `EMAIL_TAKEN` (409), `VALIDATION_ERROR` (400), `RATE_LIMITED` (429).

**Sem migration** — `AdminUser` já tem `name`, `email`, `password`.

### 3. Borda da sessão (motivação do aviso)

O JWT `AdminPayload` (`src/lib/admin-session.ts:10-16`) carrega `email` e `name` embutidos no cookie. Logo, após trocar nome/email o cookie fica desatualizado até relogar.

- **Trocar senha:** senha não está no JWT → nenhum efeito de sessão.
- **Trocar nome/email:** banco muda, cookie não. Decisão: **front exibe aviso amarelo** "Dados atualizados. O topo do painel será atualizado no próximo login." Sem logout automático, sem reemissão de token.
- **Por que isso é seguro (não só UX):** `name`/`email` não carregam autorização — o `role` NÃO é editável por esta rota, então não há escalonamento. A defasagem do cookie é limitada pelo max-age do `admin.session-token` (expira e força relogin). `requiresRelogin` é puramente um flag de UX, sem peso de segurança.

### 4. Frontend — `/admin/configuracoes/page.tsx` vira "Meu Perfil"

Server Component carrega o admin logado (`requireAdmin()` + `prisma.adminUser.findUnique({ where: { id }, select: { id, name, email, role, mfaEnabled, lastLoginAt, createdAt } })`) e passa a um client component (`perfil-client.tsx`) que faz os `PATCH /api/admin/me`. Visual escuro do admin (`bg-gray-*`, `indigo`), seguindo `equipe-client.tsx`/`seguranca`. Implementação via `/frontend-design` + `/ui-ux-pro-max`.

Cards verticais:

1. **Meus Dados** — `name` + `email` editáveis. Ao salvar (quando email mudou) exige campo `currentPassword`. Em sucesso de nome/email mostra o aviso de relogin.
2. **Trocar Senha** — `currentPassword`, `newPassword`, confirmar nova senha (confirmação só no client). Botão *Alterar senha*.
3. **Segurança (2FA)** — mostra status do MFA (`mfaEnabled`) + botão *Gerenciar* → link para `/admin/configuracoes/seguranca` (existente, intocada).
4. **Informações da conta** (read-only) — `role` (badge, reusa `ROLE_LABELS`/`ROLE_STYLES` de `equipe-client.tsx`), `lastLoginAt`, `createdAt`.
5. **Usuários 🔒** — card/aba bloqueado, ícone de cadeado, texto "Gestão de usuários — em breve", sem ação.

## Componentes e responsabilidades

| Unidade | Responsabilidade | Depende de |
|---|---|---|
| `PATCH /api/admin/me` | Self-service do admin logado (nome/email/senha) | `requireAdmin`, `prisma.adminUser`, `bcryptjs`, Zod |
| `configuracoes/page.tsx` (SC) | Carregar admin logado + render | `requireAdmin`, `prisma` |
| `perfil-client.tsx` (CC) | Form, validação client, chamadas PATCH, avisos | `/api/admin/me` |
| `admin-nav.tsx` | Item de menu "Meu Perfil" | — |

## Tratamento de erros

- Toda entrada validada por Zod no boundary.
- `currentPassword` conferida com `bcrypt.compare` antes de qualquer escrita sensível.
- Mensagens de erro não vazam se o email existe de forma enumerável além do necessário para o próprio admin (mensagem genérica "Email já está em uso").
- Falha de rede no client → toast de erro, sem perder o que foi digitado.

## Testes (cobrir caminhos sensíveis — senha/email)

- Troca de nome isolada → 200, sem exigir senha.
- Troca de email com `currentPassword` correta → 200; com senha errada → 400 `INVALID_PASSWORD`; email já usado por outro admin → 409 `EMAIL_TAKEN`.
- Troca de senha sem `currentPassword` → 400; com `currentPassword` errada → 400.
- Rota sempre opera sobre `session.id` (nunca aceita id externo) — teste garante que admin A não altera admin B.
- `newPassword` < 8 → 400 `VALIDATION_ERROR`.
- **Email normalizado:** enviar o próprio email atual com case/whitespace diferente → no-op, NÃO exige senha. Email novo é gravado em lowercase/trimmed.
- **Payload vazio `{}`** → 200 no-op, sem escrita, sem `requiresRelogin`.
- **Admin desativado** (`active=false`) com cookie válido → 401 (revalidação no banco).
- **Rate limit:** N tentativas de senha errada → 429 `RATE_LIMITED`.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Cookie com nome/email defasado confunde o admin | Aviso explícito de relogin no front. |
| Afrouxar a rota `/users/[id]` para self-service abriria escalonamento de role | Rota nova dedicada `/me` que **nunca** aceita `role` nem `id` externo. |
| Incompatibilidade de hash com logins existentes | Mesmo `bcryptjs` rounds=10 do create atual. |
| Tocar no MFA em prod | Não tocar; só linkar para a página existente. |
| Admin desativado edita o próprio acesso via cookie ainda válido | Revalida `active` no banco a cada request da rota `/me`. |
| Brute-force da senha atual via endpoint autenticado | `checkRateLimit` por `session.id` → 429. |
| Colisão de email por case-sensitivity do `@unique` Postgres | Normaliza `.trim().toLowerCase()` antes da checagem e da escrita. |

## Entregáveis

1. `PATCH /api/admin/me` + testes.
2. `/admin/configuracoes/page.tsx` reescrita (Server Component) + `perfil-client.tsx`.
3. Ajuste de label/ícone em `admin-nav.tsx`.
4. Card "Usuários" com cadeado (placeholder).
5. **Zero migration.**
