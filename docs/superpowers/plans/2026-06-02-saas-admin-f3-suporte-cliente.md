# F3 — Suporte completo do cliente + notificações

> Plano executável. Fase 3 do plano de resolução do SaaS Admin
> (ver `docs/superpowers/specs/2026-06-02-saas-admin-resolucao-design.md`).
> Esforço **G** (a maior). **PEDIDO CENTRAL.**

## Objetivo (o dono vê)

A ótica (cliente) **abre, responde e acompanha** ticket de suporte pelo próprio app.
Quando o cliente abre/responde → o **sino do admin acende**. Quando o admin responde/muda
status → o **cliente é notificado in-app**. Fim a fim, fechando o loop.

## Estado atual (levantado no código)

**Já existe (lado ADMIN):**
- Models `SupportTicket`, `SupportMessage`, `SLAPolicy`, `TicketResponseTemplate`, `TicketTag` completos
  (`prisma/schema.prisma:2247+`). `SupportTicket.slaDeadline` existe mas **nunca é populado**.
- `SupportMessage.authorType` ("ADMIN"|"CLIENT"), `isInternal` (notas privadas do admin).
- Rotas admin: `POST /api/admin/tickets`, `POST /api/admin/tickets/[id]/messages`,
  `PATCH /api/admin/tickets/[id]/status`, `GET /api/admin/export/tickets`.
- UI admin: `/admin/suporte/tickets[/novo|/[id]]`.
- Model `AdminNotification` + enum `AdminNotificationType` + sino com polling 30s
  (`src/components/admin/NotificationBell.tsx`) + rotas `/api/admin/notifications*`.
- `createAdminNotification` (`src/services/admin-notification.service.ts`) — **dead code** (nunca chamada).
- Guards: `getAdminSession`, `requireCompanyScope`, `canAccessCompany` (`src/lib/admin-session.ts`, `admin-scope.ts`).

**NÃO existe (a construir):**
- Qualquer rota do **cliente** para ticket (criar/listar/responder).
- Qualquer UI do **cliente** para suporte.
- Qualquer **notificação do lado do cliente** (model, rota, sino persistente). O sino atual do
  header do cliente (`src/components/layout/header.tsx`) é só alertas operacionais efêmeros (OS atrasada,
  estoque baixo, caixa aberto) — não persiste, sem model.
- Cálculo de `slaDeadline`.
- Camada de serviço (`support.service.ts`) — hoje a lógica está inline nas rotas admin.

**Bug achado (corrigir nesta fase) — AS 4 ROTAS ADMIN:** nenhuma valida escopo, e
`messages`/`status` nem validam que o ticket existe:
- `POST /api/admin/tickets` — não chama `requireCompanyScope`.
- `POST /api/admin/tickets/[id]/messages` — cria `SupportMessage` sem `findUnique` do ticket
  (ticketId inválido → FK 500; admin restrito posta em ticket de empresa fora do escopo).
- `PATCH /api/admin/tickets/[id]/status` — `update({ where: { id } })` sem resolver/validar `companyId`.
- `GET /api/admin/export/tickets` — `GET()` sem filtro de escopo; admin restrito exporta tudo.
  ⚠️ `AdminPayload` (`admin-session.ts:11`) **não carrega `scopedCompanyIds`** — o filtro do export
  precisa buscar o `AdminUser` no banco (como `requireCompanyScope` faz).

## Decisões aprovadas (dono)

1. **Notif. cliente:** novo model `CompanyNotification` escopado por `companyId` + rota `/api/notifications`
   + **sino persistente** no header do dashboard (espelho do admin). Loop fim-a-fim.
2. **Bug de escopo:** corrigir `requireCompanyScope` nas rotas admin de ticket junto nesta fase.
3. **slaDeadline:** ler `SLAPolicy` do banco pela prioridade; **fallback** em código se não houver política
   (URGENT=4h, HIGH=8h, MEDIUM=24h, LOW=48h — `resolutionH`).

### Decisões adicionais da revisão de plano (incorporadas)

4. **Prioridade do cliente (C2):** o cliente **NÃO escolhe `URGENT`**. Whitelist Zod server-side =
   `LOW | MEDIUM | HIGH`, **default `MEDIUM`**. Só o admin pode reclassificar para URGENT. Evita que
   toda ótica abra tudo como URGENT e estoure SLA/spam de sino.
5. **`category` (H1):** ticket aberto pelo cliente herda `category = "SUPORTE"` (fixo, como o admin já faz).
   Cliente não escolhe categoria nesta fase.
6. **Notificações fora da transação (H4):** `createAdminNotification`/`createCompanyNotification` são
   disparadas **APÓS o commit** da `$transaction` que cria/responde o ticket — nunca dentro. Mantêm a
   semântica fail-silent sem arriscar rollback do ticket por falha de notificação.
7. **`where` da rota de notificação do cliente (H2):** `{ companyId, OR: [{ userId }, { userId: null }] }`.
   **NÃO** copiar o `OR` cru do admin (que é global). `userId=null` é broadcast só DENTRO da empresa.
8. **Destinatário da notificação de ticket (M4):** resposta/status de ticket notifica **o autor do ticket**
   (`userId = ticket.userId`), não a empresa toda. Só `BILLING`/`SYSTEM` usam broadcast (`userId=null`).
9. **`firstResponseAt` (M1):** setado **só** em `addAdminMessage`, **só se `null`**. Marca a 1ª resposta
   do admin. Ticket aberto pelo cliente nasce sem `firstResponseAt`.
10. **`number` sequencial (H3):** tratar `P2002` com **retry** (rebusca count, regera number) — padrão já
    usado no projeto (M1/M14). Não deixar como mera dívida; self-service aumenta a concorrência.
11. **Status visíveis ao cliente (M2):** cliente vê todos os 5 status (traduzidos na UI). Cliente **só
    responde** em ticket não-terminal; responder em `RESOLVED`/`CLOSED` → 409 (orientar a abrir novo). Resposta
    do cliente em `WAITING_CUSTOMER` → volta a `OPEN`.
12. **`isInternal=false` em TODA saída (M3):** regra única no serviço — nenhuma query servida ao cliente
    retorna `isInternal=true`, incluindo preview/última-mensagem na LISTA, não só no detalhe.

## Fora de escopo (NÃO entra — confirmado pela spec)

- E-mail / push externos (in-app fecha o loop).
- Base de conhecimento / FAQ.
- Atribuição automática / round-robin.
- Anexos com upload novo (campo `attachments[]` já existe; manter como hoje, sem novo storage).
- Reusar a notificação na F5 (dunning) — só deixar `createCompanyNotification` pronto para a F5 chamar.

---

## Arquitetura

### Camada de serviço (nova) — `src/services/support.service.ts`
Centraliza a lógica hoje espalhada nas rotas admin + nova lógica do cliente. Funções puras de tx
quando possível, idempotência onde fizer sentido.

- `computeSlaDeadline(priority, createdAt, tx)` → lê `SLAPolicy` da prioridade (`resolutionH`), fallback const.
- `createTicketByClient({ companyId, userId, subject, description, priority })` →
  gera `number` sequencial, cria ticket `OPEN` + 1ª `SupportMessage` (authorType CLIENT, isInternal=false),
  seta `slaDeadline`, dispara `createAdminNotification` (broadcast, type `TICKET_URGENT` se URGENT senão genérico
  via título), grava `logActivity` + `globalAudit`. Tudo numa `$transaction`.
- `addClientMessage({ ticketId, companyId, userId, message })` → valida ticket pertence à `companyId`;
  cria `SupportMessage` (CLIENT, isInternal=false); se ticket estava `WAITING_CUSTOMER` → volta a `OPEN`;
  seta `firstResponseAt` se ainda null e a msg for de cliente após resposta admin? (não — firstResponse é do admin);
  dispara notificação ao admin (sino acende).
- `addAdminMessage(...)` / `updateTicketStatus(...)` → refatorar das rotas admin para o serviço,
  setando `firstResponseAt` na 1ª resposta do admin, e disparando **CompanyNotification** ao cliente.

### Notificação do cliente (nova)
- **Model `CompanyNotification`** (migration): `id`, `companyId` (FK Company, indexado), `userId?` (FK User,
  null = broadcast p/ toda a empresa), `type` (enum `CompanyNotificationType`), `title`, `message`, `link?`,
  `metadata? Json`, `isRead` (default false), `readAt?`, `createdAt`. Índices `(companyId, isRead, createdAt)`
  e `(userId, isRead, createdAt)`.
- **Enum `CompanyNotificationType`**: `TICKET_REPLY`, `TICKET_STATUS`, `BILLING` (p/ F5 reusar), `SYSTEM`.
- **Service `src/services/company-notification.service.ts`**: `createCompanyNotification(params)`
  (espelho de `createAdminNotification`, falha silenciosa, não quebra a operação principal).
- **Rotas cliente** (escopadas por `getCompanyId()`/`getUserId()` via `requireAuth`):
  - `GET /api/notifications?unread=&limit=` → notificações da empresa do usuário (broadcast + dele).
  - `PATCH /api/notifications/[id]/read`
  - `PATCH /api/notifications/read-all`
- **Sino persistente** no header do dashboard: novo `src/components/layout/NotificationBell.tsx`
  (espelho do admin: badge não-lidas, polling 30s, marca lida). **Separado** do sino de alertas
  operacionais atual (que fica como está) — adiciona um 2º ícone OU integra como aba; ver UI abaixo.

### Rotas do cliente para ticket (novas) — escopadas por `companyId`
- `POST /api/support/tickets` → `createTicketByClient`.
- `GET /api/support/tickets` → lista tickets da empresa do usuário (não vê de outras).
- `GET /api/support/tickets/[id]` → 1 ticket + mensagens **com `isInternal=false`** (cliente não vê nota interna);
  valida pertence à `companyId` (404 senão — anti-leak).
- `POST /api/support/tickets/[id]/messages` → `addClientMessage`.

### UI do cliente (nova) — `/dashboard/suporte`
Espelho enxuto de `admin/suporte/*`, usando **/ui-ux-pro-max** para a tela nova.
- `/dashboard/suporte` — lista dos tickets da ótica (status, prioridade, última atualização) + botão "Abrir chamado".
- `/dashboard/suporte/novo` — form (assunto, descrição, prioridade).
- `/dashboard/suporte/[id]` — thread de mensagens (sem notas internas) + responder + status read-only.

### Ativar `createAdminNotification` (sai de dead code)
Disparar em: **ticket novo do cliente**, **resposta do cliente**, e **SLA** (deixar hook pronto;
o disparo de SLA breach por cron fica fora — só o helper `computeSlaDeadline` entra aqui).
Sino do admin passa a acender de verdade.

---

## Tarefas (executar 1 por vez — NÃO paralelizar tasks com git commit)

### T1 — Migration + models de notificação do cliente
- Add `CompanyNotification` + enum `CompanyNotificationType` no `schema.prisma`.
- `prisma migrate dev` local → gera migration. **NÃO** colocar `migrate deploy` no build (lição do F2:
  aplicar manual antes do deploy). Migration aditiva e segura (tabela nova, sem destrutivo).
- `prisma generate`.
- Gate parcial: `tsc` compila com o client novo.

### T2 — Serviço de notificação do cliente + rotas
- `src/services/company-notification.service.ts` (`createCompanyNotification`, falha silenciosa).
- `GET /api/notifications` com `where: { companyId, OR: [{ userId }, { userId: null }] }` (H2 — NÃO copiar
  o `OR` cru do admin), `PATCH /api/notifications/[id]/read` (valida companyId), `PATCH /api/notifications/read-all`.
  Escopadas por `requireAuth` + `getCompanyId`/`getUserId`.
- Teste de unidade do serviço + escopo das rotas (broadcast NÃO vaza entre empresas; usuário não lê notificação
  de outro usuário da mesma empresa quando `userId` setado).

### T3 — Serviço de suporte + slaDeadline + escopo admin + ativar notificações (funde o antigo T5 — L2)
- `src/services/support.service.ts`:
  - `computeSlaDeadline(priority, createdAt, tx)` — SLAPolicy + fallback (URGENT=4h/HIGH=8h/MEDIUM=24h/LOW=48h).
  - `createTicketByClient(...)` — number com **retry P2002** (H3); `category="SUPORTE"` (H1); prioridade
    validada `LOW|MEDIUM|HIGH` default MEDIUM (C2); seta `slaDeadline`. Notificação ao admin **fora da tx** (H4).
  - `addClientMessage(...)` — valida ticket ∈ companyId; **bloqueia** se `RESOLVED`/`CLOSED` (409, M2);
    `WAITING_CUSTOMER → OPEN`; notifica admin **pós-commit**.
  - `addAdminMessage(...)` / `updateTicketStatus(...)` — refatorados das rotas admin; setam `firstResponseAt`
    só se null, só na resposta admin (M1); notificam **o autor do ticket** (`ticket.userId`, M4) **pós-commit**.
- **Escopo admin (C1) — as 4 rotas:** `requireCompanyScope` em `POST /api/admin/tickets`; `messages` e `status`
  resolvem `companyId` via `findUnique` do ticket (404 se não existe) e validam escopo; export filtra por escopo
  (buscar `AdminUser.scopedCompanyIds` no banco — `AdminPayload` não tem; M5).
- Ativar `createAdminNotification` (ticket novo do cliente / resposta do cliente) — sai de dead code.
- Disparar `createCompanyNotification` ao autor (admin respondeu / mudou status).
- Testes: slaDeadline com e sem SLAPolicy; retry P2002; resposta do cliente reabre WAITING_CUSTOMER e bloqueia
  em RESOLVED; firstResponseAt só na 1ª resposta admin; admin escopado recebe 403/404 fora do escopo nas 4 rotas;
  notificação disparada nos dois lados e ao autor correto.

### T4 — Rotas do cliente para ticket
- `POST/GET /api/support/tickets`, `GET /api/support/tickets/[id]`, `POST /api/support/tickets/[id]/messages`.
- **Filtro `isInternal=false` em TODA saída ao cliente** (detalhe E preview da lista — M3).
- Validação `companyId` (anti-leak, 404 cross-tenant).
- Prioridade do body validada por Zod (whitelist sem URGENT — C2).
- Testes de integração: cliente não vê ticket de outra empresa; não vê nota interna (nem no preview);
  criar dispara sino admin; URGENT no body é rejeitado/coagido.

### T5 — UI do cliente (/ui-ux-pro-max)
- Sino persistente no header do dashboard (`NotificationBell` do cliente). Decidir antes (L1):
  consolidar com o sino de alertas operacionais existente numa lista com 2 seções, OU 2 ícones.
- `/dashboard/suporte`, `/dashboard/suporte/novo` (form sem URGENT), `/dashboard/suporte/[id]` (thread, status traduzido).
- Link no menu lateral do dashboard.

### T6 — Gate final + merge + deploy
- `tsc` limpo · `vitest run` verde · `next build` exit 0.
- `code-reviewer` (caçar regressão; corrigir CRITICAL/HIGH).
- Checagem de bugs (multi-tenant: nenhum vazamento; idempotência das notificações).
- merge `--no-ff` na main → push.
- **Aplicar migration manualmente em prod ANTES do deploy** (`npm run migrate:deploy` ou equivalente; conferir
  count de migrations repo vs banco como no F2).
- Deploy prod → smoke (home/login=200; `/api/support/tickets` sem auth=401; `/api/notifications` sem auth=401;
  `/admin`=307).
- Atualizar memória ([[saas-admin-resolucao]], [[retomar-aqui]]).

---

## Riscos & cuidados

- **Migration:** aditiva (tabela+enum novos) → segura, sem DOWN destrutivo. Aplicar manual antes do deploy
  (build não roda `migrate deploy` desde o F2).
- **Multi-tenant:** todas as rotas do cliente escopadas por `getCompanyId()`; servir mensagem ao cliente
  SEMPRE com `isInternal=false`. Rotas admin de ticket ganham `requireCompanyScope`.
- **Idempotência das notificações:** `createCompanyNotification`/`createAdminNotification` falham em silêncio
  (não quebram criar/responder ticket). Sem unique — duplo-clique pode gerar 2 notificações (aceitável; não é
  dinheiro). Se virar problema, anti-spam por (companyId,type,link,janela) numa fase futura.
- **Sino do cliente vs alertas operacionais:** são coisas distintas. Decisão de UI (T6): provavelmente 2 ícones
  (alertas operacionais ⚠️ + notificações 🔔) ou consolidar numa só lista com seções. Resolver no /ui-ux-pro-max.
- **`number` sequencial** via `count()+1` tem corrida sob concorrência (igual ao admin hoje). Self-service do
  cliente aumenta a chance de colisão `@unique`. **Decisão (H3): tratar `P2002` com retry** (rebusca count,
  regera number) já nesta fase — padrão já usado no projeto (M1/M14). Troca por sequência de banco fica para
  fase futura (dívida menor), mas o retry fecha o vetor de 500 para o cliente agora.

## Pronto quando
- Cliente abre ticket pelo app → sino do admin acende.
- Admin responde → cliente vê + é notificado in-app.
- `slaDeadline` populado na criação.
- Escopo admin corrigido.
- tsc/vitest/build verdes; code-review sem CRITICAL/HIGH aberto; deploy + smoke OK.
