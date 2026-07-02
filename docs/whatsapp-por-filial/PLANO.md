# Plano — WhatsApp por Filial (funil independente por ótica/filial)

**Status:** proposta (não implementado) · **Data:** 2026-07-01
**Precede/relacionado:** paliativo `58a3507` (leads sem filial visíveis em toda filial)

## 1. Objetivo (na voz do dono)

> "Se a ótica tem 1 filial, tem 1 WhatsApp. Se o cliente tem 3–4 óticas, **cada ótica tem o seu WhatsApp e o seu funil independente**."

Cada filial passa a ter:
- **Seu próprio número de WhatsApp** (uma conexão Evolution por filial).
- **Seu próprio funil de leads** — a filial só vê os leads que nasceram do SEU WhatsApp.
- **Seu próprio inbox de conversas** — a filial só vê as conversas do SEU número.
- O **admin alterna** entre filiais (via seletor de filial que já existe).

## 2. Estado atual (mapeado ponta a ponta)

Hoje é **1 WhatsApp por empresa**:

| Elo | Chave hoje | Tem filial? |
|-----|------------|-------------|
| `WhatsappConnection` | `companyId @unique` | campo `branchId` existe mas **"reservado, não usado"** |
| Nome da instância Evolution | `vis_${companyId}` (`whatsapp-instance.ts:13`) | não |
| Webhook entrada | resolve empresa por `instanceName` único (`webhooks/evolution/route.ts:138`) | não |
| `WhatsappConversation` | `@@unique([companyId, contactNumber])` | **campo não existe** |
| `persistInboundMessage` | upsert por `(companyId, contactNumber)` | não passa filial |
| `qualifyConversation` → `createLead` | passa `branchId = null` fixo (`conversation-qualifier:302`) | não |
| `Lead.branchId` | `String?` | ✅ existe (mas nasce null) |
| Funil / stats | filtram por `?branchId` ✅ (após paliativo, incluem null) | ✅ |
| Inbox `listInboxConversations` | filtra só por `companyId` | **não filtra filial** |
| Fila / envio / limites | tudo por `companyId` | não |

**Lacuna raiz:** a filial não entra em lugar nenhum do fluxo de entrada. A conexão é o ponto natural de origem (é ela que representa "o WhatsApp daquela filial").

## 3. Decisões travadas (do dono)

1. **Conversa é POR FILIAL.** O mesmo cliente falando com 2 filiais = 2 conversas, 2 leads independentes. Chave da conversa vira `(branchId, contactNumber)`.
2. **Config e opt-out continuam POR EMPRESA** (horário de disparo, teto anti-bloqueio, pular sábado, opt-out do cliente). Não haverá `BranchSettings` nesta fase — reduz muito o escopo e evita risco de LGPD (opt-out de uma filial não vazar pra outra: sendo global, o cliente sai de tudo).
   > Observação honesta: cada número de WhatsApp tem risco de bloqueio próprio, então um teto por empresa é conservador. Aceitável nesta fase; pode virar por-filial depois se necessário.
3. **Rollout:** ótica com 1 filial → migra a conexão/conversas/leads existentes para a filial única (determinístico e seguro). Ótica multi-filial → liga o recurso e reconecta 1 WhatsApp por filial. **Feature flag por empresa.**
4. **Paliativo** (`58a3507`) já está commitado — leads legados sem filial continuam visíveis em toda filial, então nada some durante a transição.

## 4. Decisão arquitetural: chave da conexão

Escolha: **`(companyId, branchId)` como chave da conexão**, e **`branchId` denormalizado** em conversa/mensagem/log.

- `instanceName = vis_${companyId}_${branchId}` (legível, e o webhook pode resolver por `instanceName` único como já faz).
- Mantém `companyId` em tudo (auditoria multi-tenant intacta — regra sagrada do projeto: `companyId` sempre nos filtros).
- Evita introduzir `connectionId` como FK nova em várias tabelas (menos churn, e o `companyId` continua sendo a espinha de isolamento de tenant).

> A alternativa `connectionId` (instanceName = `vis_${connectionId}`) foi considerada; é elegante mas troca a denormalização `(companyId, branchId)` por uma FK e afastaria `companyId` de queries onde ele é a garantia anti-IDOR. Ficamos com `(companyId, branchId)`.

## 5. Mudanças de schema (migração aditiva)

Todas **aditivas + backfill**, no padrão do projeto (nunca destrutivo antes do backfill).

1. **`WhatsappConnection`**
   - Remover `companyId @unique`; adicionar `@@unique([companyId, branchId])`.
   - `branchId` passa a ser **obrigatório** (após backfill da filial única).
   - `instanceName` continua `@unique` global (fórmula muda p/ incluir branchId).
2. **`WhatsappConversation`**
   - Adicionar `branchId String` (após backfill, obrigatório).
   - Trocar `@@unique([companyId, contactNumber])` → `@@unique([companyId, branchId, contactNumber])`.
   - Duplicar os índices `(companyId, ...)` relevantes incluindo `branchId`.
3. **`WhatsappMessage`**
   - Adicionar `branchId String?` (denormalizado p/ query/inbox), reindexar.
4. **`WhatsappMessageLog`** (dedupe de envio)
   - Dedupe permanece por empresa (config é por-empresa) — **sem mudança de chave**. `branchId` opcional só para telemetria/exibição.
5. **`Lead`** — nenhuma mudança de schema (`branchId` já existe).

## 6. Mudanças de código (por fase)

### Fase 0 — Fundação (sem efeito em prod)
- Migração aditiva (campos `branchId`, novos uniques convivendo com os antigos).
- Backfill idempotente `scripts/backfill-whatsapp-branch.ts` (dry-run/apply, por empresa):
  - Para cada empresa **com exatamente 1 filial ativa**: setar `branchId` da filial única em `WhatsappConnection`, `WhatsappConversation`, `WhatsappMessage` e `Lead` (só onde `branchId IS NULL`).
  - Empresas multi-filial: **não toca** (ficam null → paliativo cobre) até ligarem o recurso.
  - Multi-tenant: correlacionado por `companyId`, `HAVING COUNT(branch)=1 AND active`. Nunca UPDATE global.

### Fase 1 — Entrada (webhook → conversa), backward-compatible
- `whatsapp-instance.ts`: adicionar `instanceNameForBranch(companyId, branchId)`; manter `instanceNameForCompany` como fallback (empresas ainda não migradas).
- `webhooks/evolution/route.ts:138-140`: adicionar `branchId` ao `select` da conexão; passar a `persistInboundMessage`.
- `whatsapp-message.service.ts`: assinatura `persistInboundMessage(companyId, branchId, msg)`; upsert por `(companyId, branchId, contactNumber)`.

### Fase 2 — Qualificação → lead herda filial
- `conversation-qualifier.service.ts`: ler `conv.branchId` (agora selecionado) e passá-lo ao `createLead` no lugar do `null` fixo (linha ~302). Cron continua company-wide; cada lead herda a filial da sua conversa.

### Fase 3 — Leitura isolada por filial
- `whatsapp-inbox.service.ts` + `/api/whatsapp/conversations/route.ts`: aceitar `branchId`, filtrar no `where`. Helper `buildConversationBranchScope` espelhando `buildLeadBranchScope` (legado null visível em toda filial durante transição).
- Front `whatsapp-inbox.tsx`: passar `activeBranchId` (do `use-branch-context`) na query, igual o funil já faz.

### Fase 4 — Conexão por filial (UI) + envio
- Rotas `connect/refresh-qr/status/disconnect`: aceitar `branchId` (query), upsert/where compostos, instanceName por filial.
- `whatsapp-send.ts` + `whatsapp-queue-processor.ts`: escolher a instância pela filial da conversa/log (não só `companyId`). Como config é por-empresa, limites/fila continuam agregando por empresa; só o `instanceName` de saída passa a depender da filial.
- UI de conexão: um card de conexão **por filial** (admin reconecta cada número).

### Fase 5 — Flag, rollout e limpeza
- Feature flag por empresa (`WHATSAPP_PER_BRANCH_COMPANIES`, no padrão dos outros kill-switches por ótica).
- Ligar 1 ótica-piloto multi-filial; validar isolamento (funil + inbox + envio).
- Após todas migradas: tornar `branchId` obrigatório de fato e aposentar o fallback `instanceNameForCompany`.

## 7. Riscos e mitigações

- **Cliente que já falava com a empresa (conversa legada null) manda msg pós-migração:** o upsert por `(companyId, branchId, contactNumber)` criaria uma 2ª conversa. Mitigar no backfill (empresa mono-filial já recebe branchId) e, para multi-filial, só ligar o recurso após reconectar todos os números.
- **Dedupe de envio (`WhatsappMessageLog`) por empresa:** mantido de propósito (config por-empresa). Não regride.
- **LGPD/opt-out:** global por empresa — cliente que pede pra sair, sai de todas as filiais. Decisão do dono.
- **Regra sagrada multi-tenant:** `companyId` permanece em todos os `where`. `branchId` é filtro adicional, nunca substitui `companyId`.

## 8. O que NÃO está neste escopo
- `BranchSettings` (config de envio por filial) — fica para depois se houver demanda.
- Opt-out por filial.
- Multi-instância por filial (mais de um número na mesma filial).

## 9. Estimativa grosseira
- Fase 0–3 (entrada + leitura isolada): o núcleo do valor ("funil e inbox independentes por filial"). ~Metade do esforço.
- Fase 4–5 (conexão por filial na UI + envio + rollout): a outra metade, mais operacional (reconexões, flag, validação com o dono).
