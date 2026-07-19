# Emissão de tiers de plano Vis → Domus — spec de design

> Passou pela forja (painel adversarial 3⚔3 + Codex na lente de implementação cross-repo). O painel matou 2 abordagens; o Codex derrubou a premissa central da sobrevivente lendo o repo do Domus (o endpoint "inexistente" está em prod). Esta spec é a reforja sobre as decisões do dono + os 6 bloqueantes confirmados no código. Repos: Vis em `PDV OTICA` (Prisma/Neon), Domus em `~/SISTEMACLINICADOMUS` (drizzle/pg), bancos separados. Ver memória `vis-tiers-emissao-forja`.

## Problema

O Domus (sistema clínico) já lê `plan_tier` do espelho `clinic_entitlements` e corta telas por tier (`clinic_full` = tudo · `ophthalmology` e `specialist` = nichados). O Vis (operadora, fonte de verdade do plano) **ainda não emite tier nenhum**. Pior: a tela de troca de plano do cliente no Domus (`plan-picker.tsx` → `request-plan-change` → `POST /api/internal/domus/plan-change`) **já está em produção chamando um endpoint que não existe no Vis** — ou seja, um cliente que tenta trocar de plano hoje bate numa rota 404.

## Decisões de negócio (travadas pelo dono, 2026-07-19)

| # | Decisão | Consequência |
|---|---------|--------------|
| N1 | **Tier DERIVA do plano pago.** Fonte única = o plano contratado. | Exige um mapa explícito plano→tier no Vis (não existe hoje). Trocar tier = trocar plano. Impossível uma clínica ver telas que não paga. |
| N2 | **O pedido do cliente AUTO-APLICA.** Cliente clica trocar plano no Domus → Vis troca plano + cobrança (Asaas) na hora → tier propaga de volta. | Self-service completo. Reusa o `change_plan` que já existe (Asaas, fail-soft). **NÃO** passa pelo checkout Stripe quebrado do Domus (confirmado: fluxo é Domus→Vis→Asaas). |

## Restrições inegociáveis

- **Vis é a única fonte de verdade do tier.** O Domus nunca decide tier; só reflete o que o Vis emite. Nada de "aplicação otimista" no Domus (o painel matou essa abordagem — vira 2ª fonte de verdade, fail-open clínico).
- **Cobrança é o ponto de maior risco.** Auto-aplicar troca de plano = mexer em dinheiro real sem humano no meio. Idempotência de cobrança forte + kill-switch pronto ANTES de expor. **Política de efetivação (resolve o P0 fail-soft do Codex):**
  - **Upgrade (ganha telas):** só efetiva o plano/tier DEPOIS do Asaas confirmar. Ordem invertida do `change_plan` admin atual (que libera antes e marca `billingSyncPending`). Sem `asaasSubscriptionId` ou Asaas indisponível → **NÃO auto-aplica**, responde "indisponível, contate suporte". Nunca liberar tier caro com cobrança pendente no self-service.
  - **Downgrade (perde telas):** **agendado para `currentPeriodEnd`** — o cliente pagou o mês, mantém o acesso até o fim do período; o downgrade efetiva na virada. Nunca corta acesso no meio de um período pago (nem estorna — Asaas não prora, `asaas.ts:87`; e cortar já seria pior).
  - O `change_plan` admin (fail-soft, libera-antes) permanece como está para o super admin (operador humano assume o risco); o self-service usa a política acima, mais conservadora. Extrair a lógica num **service** com `effectiveMode: 'immediate' | 'period_end'` + ator tipado.
- **Migração hand-written contra PROD** (sem Neon dev isolado — `.env DATABASE_URL` = prod). `.sql` + `migrate deploy`, NUNCA `migrate dev`/`db push`. Incidente recente de banco zerado: `CREATE TYPE`/`ADD COLUMN` idempotentes e guardados.
- **Furo histórico de escopo de produto:** `POST /api/admin/networks` não valida `platformProduct` (rede cruzada). Todo endpoint novo que recebe `visCompanyId`/`domusClinicId` do corpo DEVE resolver a company pela identidade autenticada e validar `platformProduct = VIS_MEDICAL`, nunca confiar no corpo.

## Catálogo de planos Medical (definido pelo dono 2026-07-19)

Os planos Medical **não existiam** — só havia 4 planos de ótica + `interno-domus` R$0. Criar 2 planos comerciais:

| Plano | slug | Mensal | Anual (10×) | tier emitido | Efeito no Domus |
|-------|------|--------|-------------|--------------|-----------------|
| **Profissional** | `medical-profissional` | R$ 89,90 | R$ 899,00 | `specialist` | corta estética, convênios, comissões, relatórios BI |
| **Clínica** | `medical-clinica` | R$ 189,90 | R$ 1.899,00 | `clinic_full` | libera tudo |

- `priceMonthly`/`priceYearly` são `Int` em centavos: Profissional `8990`/`89900`; Clínica `18990`/`189900`.
- `platformProduct` NÃO existe em `Plan` hoje — a spec adiciona um jeito de marcar planos Medical (coluna `platformProduct` em `Plan`, OU uma tabela de oferta). Sem isso, um `findFirst({tier})` poderia pegar plano de ótica.
- `interno-domus` R$0 permanece (uso interno), classificado `clinic_full`, mas **NÃO self-service-selectable** (o cliente não pode escolher o plano grátis).
- Regra de seleção do plano-alvo (N2): `Plan where platformProduct='VIS_MEDICAL' AND tier=<requestedTier> AND selfServiceSelectable=true AND isActive=true` — deve resolver EXATAMENTE 1 plano; 0 ou >1 = erro (fail-closed, não auto-aplica).

## O mapa plano→tier (N1)

Coluna nova `tier` em `Plan` (Prisma enum `PlanTier { clinic_full | ophthalmology | specialist }`, default `clinic_full`). **Materialização explícita, não parsing de `name`/`slug`** (o Codex foi claro: parsing é frágil). `Plan.slug` já é `@unique`; a classificação inicial é um `UPDATE` cirúrgico por slug de cada plano existente. Isto ressuscita a ideia "tier em Plan" que o painel matou — mas o motivo do kill era "remapear FKs de subscriptions vivas"; aqui NÃO há remapeamento: as subscriptions já apontam pros planos certos, só classifico cada `Plan`. A "bomba de reclassificação em massa" (um `UPDATE Plan.tier` muda N clínicas de uma vez) é mitigada: a classificação é feita 1× conscientemente na migração, não é edição rotineira. Editar `Plan.tier` de um plano com clínicas ativas fica documentado como operação de risco (reclassifica todas as clínicas daquele plano).

## Contrato do endpoint `POST /api/internal/domus/plan-change` (implementar)

Já consumido em prod pelo Domus (`domus-vis-client.ts:44`). Contrato REAL que o Domus já envia:
- Headers: `x-domus-timestamp`, `x-domus-signature` (HMAC sha256 de `${ts}.${rawBody}`, segredo **`DOMUS_VIS_API_SECRET`** — NOVO, ≠ `VIS_DOMUS_WEBHOOK_SECRET`).
- Corpo: `{ visCompanyId, requestedTier ∈ PLAN_TIERS, idempotencyKey: "${visCompanyId}:${requestedTier}", requestedBy: <userId opaco> }`.

Handler no Vis (ordem obrigatória):
1. **Verificar HMAC** (`verifyVisDomus`, janela 5min) — fail-closed se `!secret` (rejeitar ANTES de verificar, não assinar com string vazia).
2. **Modelo de autenticação (corrigido após leitura do Domus):** o `DOMUS_VIS_API_SECRET` é um segredo **GLOBAL** (um só, do ambiente do Domus) e o Domus **não manda header de identidade de clínica** — só `x-domus-timestamp`/`x-domus-signature`. Logo a assinatura prova apenas **"a mensagem veio do Domus"** (posse do segredo global), NÃO "veio da clínica X". Não existe "identidade autenticada por-clínica" a derivar da assinatura — o único identificador de clínica é o `visCompanyId` do corpo. **Portanto o modelo é: HMAC autentica o Domus como serviço; o `visCompanyId` do corpo é então autorizado por VALIDAÇÃO obrigatória** — buscar `Company where id = visCompanyId AND platformProduct = 'VIS_MEDICAL' AND domusClinicId IS NOT NULL`; se não bater, 404 genérico (`clinic_not_linked`, sem oráculo). Isto fecha o furo do `networks` (que esquece o filtro de produto). O que NÃO se pode fazer é aplicar sem essa validação de produto/vínculo — um bug no Domus ou um replay que troque o `visCompanyId` mudaria o tier de company arbitrária. `requestedBy` só serve pra log, nunca pra autorização. **Item de segurança pós-MVP:** avaliar segredo por-clínica ou header de `domusClinicId` assinado, pra que a autenticação seja por-tenant e não só por-serviço.
3. **Mapear `requestedTier` → Plan** (via `Plan.tier`, o plano ativo elegível daquele tier). Validar que o plano existe e é elegível pra aquela company. Rejeitar tier desconhecido.
4. **Idempotência por EVENTO + saga com estado (resolve os 2 bugs A→B→A do Codex).** Há DOIS bugs A→B→A: (i) a chave que o Domus manda hoje é `${visCompanyId}:${requestedTier}` (voltar a um tier já pedido colide → clínica presa); (ii) a idempotencyKey do Asaas em `change_plan` é `change-plan:${sub.id}:${plan.id}` (`route.ts:159`) — A→B→A colide com a 1ª ida a A → Vis termina em A, Asaas em B. **Solução:** tabela `DomusPlanChangeOp { id, visCompanyId, eventId @unique, requestedTier, state, payloadHash, createdAt, expiresAt }` com estados `RECEIVED → LOCAL_APPLIED → BILLING_CONFIRMED | FAILED`, **serializada por subscription** (lock/optimistic version — dois cliques concorrentes não podem aplicar em ordens diferentes no banco vs Asaas). O `eventId` (UUID único por operação, estável entre retries) é a chave de idempotência TANTO da tabela QUANTO da chamada Asaas (substitui `change-plan:sub:plan`). `payloadHash` → 409 em replay corrompido. **Coordenação cross-repo (rollout):** o Domus precisa gerar um `eventId` estável por operação (outbox/persistido — gerar `randomUUID()` a cada execução da server action NÃO basta, retry viraria evento novo). Enquanto o Domus não mudar, o endpoint fica atrás do kill-switch (não exposto) — não há shim seguro puramente no Vis que transforme a chave velha em evento sem perder retry ou reintroduzir A→B→A.
5. **Aplicar via SERVICE extraído de `change_plan`** (não a rota admin inline — ela grava `actorType=ADMIN_USER`, exige `admin.id`, não é chamável por HMAC). Extrair `applyPlanChange({ companyId, targetPlanId, actor, effectiveMode, operationId })` compartilhado pelas 2 rotas. Reusa: troca `Subscription.planId`, `invalidatePlanFeaturesCache`, sincroniza Asaas, audita. Self-service usa `effectiveMode` da política de cobrança acima.
6. **Publicar o entitlement v2 de volta** (`schedulePublishEntitlement`) — o tier só "vale" pro Domus quando o webhook ecoa.

## Payload v2 (emissor)

`buildEntitlementPayload` sobe pra `version: 2`, ADITIVO: adiciona `plan: { tier }` (os campos v1 permanecem byte-idênticos). **Emite os 3 tiers literais** (`clinic_full | ophthalmology | specialist`) — o receptor do Domus espera `p.plan.tier` string não-vazia (`vis-entitlement-sync.ts:123`) e `specialist` é OBSERVÁVEL lá (persiste, exibe "Outra Especialidade"). NÃO esconder specialist nem renomear pra `tierEffect` (quebra o parse do receptor). O receptor já mapeia specialist→mesmo corte que ophthalmology (`plan-features.ts:54`), então não há fail-open.

- **Tier nos ramos onde HÁ plano** — deriva de `Plan.tier` do plano ativo. **Nos ramos onde NÃO há plano** (company inexistente, sem subscription, kill-switch/bypass sem plano): NÃO inventar tier (não emitir `plan.tier`, ou emitir estado terminal) — o receptor do Domus **preserva** o `plan_tier` já gravado quando o campo vem ausente (`vis-entitlement-sync.ts:207`). Isso resolve a contradição "tier em todos os ramos" com N1 (sem plano = sem tier derivável). Só o `writeAllowed`/`reason` (v1) muda nesses ramos, como já é hoje.

## Snapshot atômico + relógio ordenável (bloqueante do Codex)

O `MAX(Subscription.updatedAt, Company.updatedAt)` atual NÃO dá relógio estritamente ordenável nem snapshot coerente. **Torn read real:** publisher A lê tier velho (t0), admin muda tier (t1, publisher B publica certo), uma Subscription muda (t2), A calcula `sourceUpdatedAt=t2` mas carrega tier de t0 → Domus aceita A depois de B (t2>t1) → restaura tier errado até o pull diário. + colisão mesmo-ms (`<=` aceita igual).

Requisito: `buildEntitlementPayload` lê tier + plano + subscription numa **transação de leitura coerente**. Como `checkSubscription` usa o Prisma global e READ COMMITTED não garante snapshot entre queries, `checkSubscription` precisa aceitar um tx client compartilhado. O relógio precisa ser **estritamente monotônico por company** — coluna `sourceRevision` (bigint) incrementada na MESMA transação de cada mudança publicável (por TODAS as mutações: admin actions, webhooks Asaas, crons de dunning).

**Rollout dual receiver-first (resolve o P0 do Codex — não pode ser big-bang):** o Domus hoje EXIGE `sourceUpdatedAt` no parser (`vis-entitlement-sync.ts:108`) e ordena por `<=` (:250). Trocar o relógio de um lado quebra o receptor em prod. Ordem obrigatória:
1. **Domus primeiro:** adiciona coluna `source_revision` nullable + parser aceita AMBOS (revision quando presente, senão timestamp). Enquanto null → usa timestamp (comportamento atual).
2. Uma vez que uma clínica recebeu `source_revision`, payload legado SEM revision **nunca** pode sobrescrevê-la (proteção contra reordenação durante a transição).
3. **Vis** passa a emitir `sourceUpdatedAt` + `sourceRevision` (ambos — não remove o timestamp, senão rejeita).
4. Drenar eventos/instâncias antigas; só então `source_revision` vira obrigatório.
- Igualdade de revision: retry idêntico (mesmo payloadHash) refresca `syncedAt`; payload DIFERENTE com mesma revision → rejeita (não é reordenação legítima).

## Fechar os handlers mudos (bloqueante do Codex)

`actions/route.ts`: `change_plan` (:205), `reactivate` (:65), `cancel_subscription` (:287) terminam SEM publicar → todos chamam `schedulePublishEntitlement`. Com N1, `change_plan` OBRIGATORIAMENTE muda tier + publica.

**`delete` (contrato terminal — resolve o TBD):** `delete` (:392) marca DELETED sem publicar E o pull exclui deletadas (`entitlements/route.ts:35`) → Domus conserva pra sempre o último entitlement da clínica deletada. Definir: no delete, publicar um snapshot terminal `{writeAllowed: false, reason: "COMPANY_DELETED"}` (v1, sem `plan.tier`) ANTES de marcar DELETED — o Domus grava writeAllowed=false (bloqueia escrita) e preserva o tier (irrelevante, escrita já bloqueada). Como o pull não re-envia deletadas, o webhook é a ÚNICA entrega desse estado terminal → se o webhook falhar, a clínica deletada mantém acesso; aceitar como risco conhecido ou adicionar o estado terminal a uma fila de retry. Coordenação cross-repo: confirmar que o receptor do Domus aceita `writeAllowed:false` terminal.

## Fail-open no receptor do Domus (bloqueante — lado Domus)

`entitlements/route.ts:28` (Domus): `secret = process.env.VIS_DOMUS_WEBHOOK_SECRET ?? ""` → se a env faltar, atacante assina com chave vazia e passa. Rejeitar quando `!secret` ANTES de verificar. Item de coordenação cross-repo (fix no Domus).

## Migração

- `.sql` hand-written + `migrate deploy`. `CREATE TYPE "PlanTier"` guardado (`DO $$ ... EXCEPTION WHEN duplicate_object`) validando labels; `ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "tier" "PlanTier" NOT NULL DEFAULT 'clinic_full'` (metadata-only no PG≥11, mas ainda pega `ACCESS EXCLUSIVE` — checar transações longas antes). `UPDATE "Plan" SET tier=... WHERE slug=...` cirúrgico pros não-default. Tabela `DomusInboundEvent` aditiva.
- Enum + coluna entram no `schema.prisma` no MESMO commit da migração hand-written (mesmo nome/tipo/default) pra não gerar drift na próxima `migrate deploy`.
- Preflight read-only no banco antes: contar `Plan`, checar contenção.

## Kill-switch e envs

| Env | Onde | Efeito |
|---|---|---|
| `DOMUS_VIS_API_SECRET` | Vis | HMAC do inbound plan-change (novo, ≠ webhook). Fail-closed se ausente. |
| `VIS_TIER_SELF_SERVICE_ENABLED` (proposto) | Vis | Kill-switch do auto-apply. `!== "true"` → endpoint responde "troca indisponível, contate o suporte" sem tocar cobrança. Liga o self-service só quando a cobrança auto-aplicada estiver validada. |

## Escopo desta fatia

**Inclui:** coluna `Plan.tier` + mapa; endpoint `plan-change` (auto-apply via `change_plan`); payload v2 com `plan.tier`; snapshot atômico + relógio monotônico; publish nos handlers mudos; tabela de idempotência; kill-switch; migração; verificação E2E de sombra + reconciliação bilateral por chave.

**Fora (dívida consciente):** override de tier por company divergente do plano (N1 exclui); UI de aprovação manual (N2 escolheu auto-apply); proração retroativa (Asaas não faz — `asaas.ts:90`); o fix fail-open do receptor do Domus é coordenação cross-repo (item próprio no lado Domus).

## Gate do sprint

Endpoint autentica o Domus por HMAC global + autoriza `visCompanyId` do corpo por validação `platformProduct=VIS_MEDICAL`+vínculo (fail-closed, 404 genérico) · HMAC fail-closed se `!secret` · idempotência por `eventId` + saga serializada por subscription · cobrança: upgrade só após Asaas confirmar, downgrade agendado pra `currentPeriodEnd`, sem `asaasSubscriptionId` → não auto-aplica · seleção de plano-alvo resolve EXATAMENTE 1 (0/>1 = fail-closed) · payload v2 emite os 3 tiers literais · snapshot em tx coerente + `sourceRevision` monotônico, rollout dual receiver-first (Domus aceita ambos antes do Vis mudar) · todos os handlers de estado publicam, delete publica terminal · reclassificar `Plan.tier` com assinantes é operação massiva (incrementa revision + publica cada company), não edição livre · kill-switch `VIS_TIER_SELF_SERVICE_ENABLED` exercitado · migração idempotente por `migrate deploy` · verificação = E2E de sombra por tier + reconciliação bilateral de contagem (Vis elegíveis == mirrors v2 no Domus), NÃO amostragem (Domus é fail-open) · Codex revisa cada fase.
