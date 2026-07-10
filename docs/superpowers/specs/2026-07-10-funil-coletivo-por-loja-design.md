# Funil coletivo por loja — Design

**Data:** 2026-07-10
**Origem:** Leads do robô de IA não apareciam para vendedores no funil (visibilidade era por vendedor). Passou pela forja (painel adversarial) → matou o sistema de "claim" (YAGNI) e o rename de coluna `sellerUserId` (destrutivo). Abordagem sobrevivente + 2 decisões do dono.
**HEAD de referência:** `a32ba953`.
**Migração de banco:** nenhuma.

---

## Problema

No funil de leads, os leads criados pelo robô de qualificação de IA não apareciam para os vendedores, porque a visibilidade de leads é **por vendedor** (`listLeads` filtra `sellerUserId = usuário logado` para quem não tem `leads.view_all`). O robô cria os leads com vendedor = usuário-bot "IA (Funil WhatsApp)", então um vendedor logado não os vê.

**Modelo de operação do dono (define o design):** usa **1 login por loja** (não login individual por vendedor). A fila do funil é **coletiva por dia** — qualquer atendente pega o próximo. O vendedor real só é definido **na venda** (PDV). Logo, atribuir vendedor ao lead e filtrar visibilidade por ele está contra o fluxo real.

## Decisões (travadas com o dono)

1. **Visibilidade coletiva VIA PERMISSÃO** — conceder `LEADS_VIEW_ALL` ao papel `SELLER` no seed. Sem flag nova (o mecanismo por-vendedor × coletivo já existe via essa permissão). Óticas que quiserem por-vendedor só não concedem. **VENDAS intocadas.**
2. **Robô para de atribuir vendedor** — lead do robô nasce com `sellerUserId = null` (card "da loja"). Semântica: `data.sellerUserId === null` = sem dono de propósito; `undefined` = usa quem criou.
3. **Backfill** dos leads do robô já existentes (`sellerUserId` do bot → null), para coerência.

---

## Seção 1 — Visibilidade coletiva via permissão

**Mudança:** em `src/lib/permissions.ts`, no `ROLE_PERMISSIONS.SELLER` (bloco ~209-253), adicionar `Permission.LEADS_VIEW_ALL` (SELLER hoje só tem `LEADS_VIEW_OWN` na linha ~223).

**Efeito:** `viewAll = role===ADMIN OR userHasPermission("leads.view_all")` (`/api/leads/route.ts:30-32`) passa a ser `true` para SELLER → `listLeads` (`lead.service.ts:164`) não filtra por `sellerUserId` → o vendedor vê **todos** os leads da loja.

**Escopo — o que NÃO muda:**
- `SALES_VIEW_ALL` continua **fora** do SELLER (vendas seguem por vendedor). Só o funil vira coletivo.
- MANAGER (`:140`) e ADMIN já têm `LEADS_VIEW_ALL`. CASHIER/STOCK_MANAGER não acessam o funil.
- `getLeadById`, `getLeadStats`, move, convert já são companyId-only (coletivos) — intocados.

**Aplicação em produção:** a permissão vive no seed. Após deploy, o admin roda `POST /api/permissions/seed` (cirúrgico, usa o enum — nunca inventa código). Sem re-seed, óticas existentes não recebem a permissão nova. É passo pós-deploy documentado.

---

## Seção 2 — Robô cria lead sem vendedor

**Obstáculo verificado:** `createLead(data, companyId, userId, branchId, aiFields?)` grava `sellerUserId: data.sellerUserId ?? userId` (`lead.service.ts:133`). O robô hoje chama (`conversation-qualifier.service.ts:340-349`): `createLead({...}, conv.companyId, sellerUserId_do_bot, null, {...})` — o bot entra como o 3º parâmetro `userId`, então `?? userId` sempre preenche. **Passar null ingênuo não basta.**

**Solução (opção b — semântica de null explícito):**

**Passo 0 (obrigatório, senão não compila):** alargar o tipo. `CreateLeadDTO = z.infer<typeof createLeadSchema>` e hoje `sellerUserId: z.string().optional()` → tipo `string | undefined` (nunca `null`). Comparar `data.sellerUserId === null` seria "always-false" no TS e o robô passar `sellerUserId: null` seria erro de tipo. Mudar em `createLeadSchema` (arquivo de validação de lead) para `sellerUserId: z.string().nullable().optional()` → `CreateLeadDTO.sellerUserId` vira `string | null | undefined`. Teste: `createLeadSchema.parse({ name, sellerUserId: null })` deve passar.

- Em `createLead`, distinguir `data.sellerUserId === null` (explícito → grava `null`) de `undefined` (não informado → usa `userId`). Trocar `sellerUserId: data.sellerUserId ?? userId` por lógica que respeite `null` explícito:
  ```
  sellerUserId: data.sellerUserId === null ? null : (data.sellerUserId ?? userId)
  ```
  (Callers humanos que passam `undefined` continuam virando dono; só quem passa `null` explícito fica sem dono.)
- No robô (`conversation-qualifier.service.ts`): **remover** a chamada `getOrCreateAiSellerUser(conv.companyId)` (linha 330) e passar `sellerUserId: null` explícito no `data` do `createLead`. Como o 3º param `userId` é obrigatório na assinatura e o robô não tem usuário humano, garantir que `data.sellerUserId = null` está setado para vencer o fallback. (Se a assinatura exigir um `userId` string, passar o `null` via `data.sellerUserId` é o caminho — o `userId` posicional deixa de importar porque `data.sellerUserId === null` curto-circuita.)

**Validação:** `assertLeadFksOwnedByCompany` (`lead.service.ts:96`) já ignora `sellerUserId` null (só valida quando presente) — sem mudança.

**Card:** `lead-card.tsx:254` já é `{lead.seller?.name && (...)}` — com `sellerUserId=null`, `seller` é null e o rótulo não renderiza. **Zero mudança no card.**

---

## Seção 3 — Backfill dos leads existentes

Leads do robô já criados têm `sellerUserId` = bot. A Seção 2 só afeta leads novos. Backfill para coerência:

- **UPDATE em lote** (`updateMany`, não 1-a-1): `sellerUserId = null` onde `sellerUserId` = id de um usuário-bot da empresa. O bot é identificável por **`isSystem: true`** (role ATENDENTE, email sintético `ia-bot@<companyId>.vis.local`). Filtrar por `isSystem` é suficiente e robusto.
- **NÃO deletar** o usuário-bot — `aiTokenUsage` e histórico podem referenciá-lo. Só desvincula dos leads.
- Aplicar por empresa (multi-tenant) ou global filtrando por bots `isSystem`. Escopo: só leads cujo vendedor é um bot; **nunca** toca leads de vendedores humanos.
- Rodar como script pontual (dry-run → apply), padrão da casa.

---

## Edge cases

| Caso | Comportamento |
|---|---|
| Robô cria lead com `sellerUserId=null` | dedupe por telefone, stage default, FK validation não dependem de vendedor — OK |
| SELLER com `LEADS_VIEW_ALL` | `viewAll=true`; filtro de filial (`branchId` OR null) continua aplicando |
| Ótica não roda re-seed | mantém comportamento antigo até admin rodar o seed — documentar |
| Backfill em lead humano | não acontece: filtro só pega vendedor = bot |
| Card com vendedor null | rótulo não renderiza (já suportado) |

---

## Testes

- `permissions.ts`: SELLER agora inclui `LEADS_VIEW_ALL` **e** continua **sem** `SALES_VIEW_ALL` (trava regressão de vendas).
- `createLeadSchema`: `parse({ name, sellerUserId: null })` passa (schema alargado p/ `.nullable().optional()`).
- `createLead`: `sellerUserId: null` explícito grava `null`; `undefined` usa o `userId`; vendedor informado válido grava o informado.
- `conversation-qualifier`: robô cria lead com `sellerUserId = null` (não chama mais `getOrCreateAiSellerUser`).
- Backfill: só afeta leads do bot; leads humanos intactos.

**Verificação ao fim:** `tsc --noEmit` (0 erros) + suite de testes verde.

---

## Fora de escopo (YAGNI — cortado pelo painel)

- Sistema de "claim" / "estou atendendo" (campos efêmeros, endpoint, badge) — ninguém pediu; nome-como-identidade é anti-pattern já corrigido no projeto.
- Flag `leadQueueMode`/`leadVisibilityScope` por ótica — o mecanismo já existe via a permissão.
- Rename de `sellerUserId`→`createdByUserId` — destrutivo, blast radius enorme, zero ganho funcional.
- Fechar getLeadById/stats/convert por vendedor — no modelo coletivo do dono é o comportamento desejado, não um buraco.

## Deploy

Padrão da casa: merge → `vercel deploy --prod`. **Sem migração.** Passos pós-deploy do dono: (1) rodar `POST /api/permissions/seed`; (2) rodar o script de backfill (dry-run → apply).
