# F5 — Dunning comunicativo

> Plano executável. Fase 5 (última) do plano de resolução do SaaS Admin
> (ver `docs/superpowers/specs/2026-06-02-saas-admin-resolucao-design.md`, linhas 140-148).
> Esforço **M**.

## Objetivo (o dono vê)

Cliente inadimplente é **avisado em etapas** (in-app), não some silenciosamente. Régua de
inadimplência visível e comunicada. O cancelamento aos 30 dias só acontece **depois** que os
avisos foram efetivamente dados e registrados.

## Estado atual (levantado no código)

`src/app/api/cron/dunning/route.ts` (cron diário, fail-closed com CRON_SECRET):
- Carrega subscriptions `PAST_DUE` com `pastDueSince`.
- `daysOverdue >= 30` → CANCELED (sem checar se houve aviso).
- `daysOverdue >= 14` → SUSPENDED.
- `daysOverdue >= 3` → **só `log.info("TODO email")`** — nenhuma notificação real, nada registrado.
- **Sem idempotência:** rodar 2x no mesmo dia reenviaria o "aviso" (hoje é só log, mas ao virar
  notificação real, duplicaria).
- Já é fail-closed e auditado parcialmente (logs); estrutura do loop fail-soft por item já existe.

**Reusável (F3/F4):**
- `createCompanyNotification` (`src/services/company-notification.service.ts`) — in-app ao cliente,
  fail-silent. Enum `CompanyNotificationType.BILLING` já existe.
- `createAdminNotification` (`src/services/admin-notification.service.ts`) — sino do admin. Enum
  `AdminNotificationType.INVOICE_OVERDUE` e `SUBSCRIPTION_CANCELED` já existem.
- `logActivity` / `globalAudit` para timeline/auditoria.

## Decisões aprovadas (dono)

1. **Régua:** avisos in-app ao cliente nos dias **3, 7, 14**. Aos 14d também **suspende** (como hoje).
   **Cancela aos 30d** — mas só se os avisos foram dados (`lastDunningStage >= 14`).
2. **Idempotência:** migration `Subscription.lastDunningStage Int?` (0/3/7/14). O cron só envia o aviso de
   um marco se `lastDunningStage < marco`; após enviar, grava o marco. Rodar 2x no mesmo dia não duplica.
3. **Destinatários:** cliente recebe `CompanyNotification(BILLING)` em **todos** os marcos (3/7/14).
   Admin recebe `AdminNotification` só nos eventos **críticos**: suspensão (14d, INVOICE_OVERDUE) e
   cancelamento (30d, SUBSCRIPTION_CANCELED). Evita spam no sino do admin.

### Ajustes da revisão de plano (incorporados — bloqueantes)

4. **Reset em 3 pontos (CRITICAL-1):** `lastDunningStage=null` deve ser zerado SEMPRE que `pastDueSince`
   é zerado (recuperação). Pontos reais confirmados no código:
   - `webhooks/asaas/route.ts:198` (PAYMENT_CONFIRMED/PAYMENT_RECEIVED).
   - `admin/clientes/[id]/actions/route.ts:55` (ação reactivate).
   - `admin/faturas/[id]/workflow/route.ts:73` (admin marca fatura paga).
   Sem isso, reincidente fica com stage preso em 14 → nunca recebe novo aviso E é cancelado aos 30d sem aviso.
   `change_plan` (actions:~93) NÃO reseta (cliente ainda devendo — decisão explícita). Checkout com
   PAST_DUE órfã (findFirst só ACTIVE/TRIAL) é dívida pré-existente — anotar, não resolver aqui.
5. **`where` do cron inclui SUSPENDED (HIGH/MEDIUM-2):** hoje é só `status:"PAST_DUE"` — quem é suspenso
   aos 14d SAI do conjunto e NUNCA chega aos 30d → cancelamento jamais dispara. Corrigir para
   `status: { in: ["PAST_DUE","SUSPENDED"] }, pastDueSince: { not: null }`.
6. **Notificação retorna sucesso (HIGH-1):** `createCompanyNotification` é fail-silent (sempre retorna void,
   mesmo em falha). Para o cron NÃO pular aviso, ele precisa saber se notificou. Mudar
   `createCompanyNotification` para retornar `Promise<boolean>` (true=gravou). O cron só avança
   `lastDunningStage` se retornou true. Trade-off aceito: se crashar entre notificar e gravar o stage, o
   próximo run reenvia (aviso duplicado ocasional) — melhor que pular aviso.
7. **Aviso de 14d ANTES de suspender (MEDIUM-1):** no run em que daysOverdue>=14, enviar/gravar o aviso 14
   primeiro; só suspender se `lastDunningStage>=14` (aviso registrado). Evita "suspenso sem aviso".
8. **Régua é "≥N dias completos" (MEDIUM-3):** `daysOverdue` por `floor` em UTC → marco 3 cai no 4º dia civil.
   Testes com datas concretas fixam isso. Cron roda 0 8 UTC = 5h BRT (aceito; anotar).
9. **`ActorType.SYSTEM`** no logActivity (cron sem ator humano).

## Fora de escopo (NÃO entra — confirmado pela spec)

- WhatsApp / e-mail externo (in-app fecha o loop).
- Régua configurável por empresa (marcos fixos em código).
- Recuperação automática (PAST_DUE→ACTIVE ao pagar) — isso é do webhook Asaas, já existente.

---

## Arquitetura

### Migration
- `Subscription.lastDunningStage Int?` (null/0 = nenhum aviso ainda; 3/7/14 = último marco avisado).
  Aditiva, segura, idempotente. Aplicar manual antes do deploy.
- **Reset (3 pontos — CRITICAL-1):** sempre que `pastDueSince` é zerado, zerar `lastDunningStage` junto, nos
  3 pontos reais (webhook:198, actions reactivate:55, faturas/workflow:73). Extrair `data` comum ou adicionar
  o campo em cada update (são updates simples, não compartilham helper de tx). Sem isso, reincidente é
  cancelado sem aviso.

### Helper puro (testável) — `src/lib/dunning.ts`
- `STAGES = [3, 7, 14]` (const) e `SUSPEND_DAYS=14`, `CANCEL_DAYS=30`.
- `nextDunningStage(daysOverdue, lastStage)`: retorna o marco a notificar agora (o maior marco
  `<= daysOverdue` e `> lastStage`), ou null se não há aviso novo. Função pura.
- `canCancel(daysOverdue, lastStage)`: `daysOverdue >= CANCEL_DAYS && lastStage >= 14`.
- `dunningMessage(stage, daysOverdue)`: texto do aviso ao cliente por marco (escalonado em tom).

### Cron `cron/dunning/route.ts` (reescrever o loop)
`where: { status: { in: ["PAST_DUE","SUSPENDED"] }, pastDueSince: { not: null } }` (inclui SUSPENDED — sem
isso o cancelamento aos 30d nunca dispara). Por subscription (fail-soft por item):
1. `daysOverdue` (como hoje).
2. `stage = nextDunningStage(daysOverdue, lastStage)`:
   - se stage != null → `ok = await createCompanyNotification(BILLING, broadcast userId=null)`.
     **Só se `ok===true`:** `logActivity(SYSTEM)` + `globalAudit("DUNNING_NOTICE",{stage})` + grava
     `lastDunningStage = stage`. (HIGH-1: não avança stage se a notificação falhou.)
3. Se `daysOverdue >= 14` e `lastDunningStage >= 14` (aviso 14 registrado — MEDIUM-1) e ainda não SUSPENDED →
   SUSPENDED + `createAdminNotification(INVOICE_OVERDUE)` + audit.
4. Se `canCancel(daysOverdue, lastStage)` (>=30d E lastStage>=14) → CANCELED +
   `createAdminNotification(SUBSCRIPTION_CANCELED)` + `createCompanyNotification(BILLING,"cancelada")` + audit.
   - **Guarda:** >=30d mas lastStage<14 → NÃO cancela; envia aviso pendente, adia p/ próxima run.
- Idempotência: CANCELED sai do where (não reprocessa). SUSPENDED permanece no where (continua a contar p/ 30d).
- Mantém fail-closed CRON_SECRET; summary no response.

### Destinatário da CompanyNotification (cliente)
`CompanyNotification.userId` = o dono/admin da empresa. Como o cron não tem "autor", usar broadcast
(`userId=null`) para toda a empresa OU o primeiro ADMIN ativo da empresa. **Decisão:** broadcast
(`userId=null`) — billing é assunto da empresa toda, e o helper já suporta. (M4 da F3 dizia "ticket→autor";
billing→broadcast já era a regra.)

---

## Tarefas (executar 1 por vez — NÃO paralelizar tasks com git commit)

### T1 — Helper puro de dunning + testes
- `src/lib/dunning.ts`: `STAGES`, `nextDunningStage`, `canCancel`, `dunningMessage`.
- Testes: marco correto por daysOverdue/lastStage; não reenvia marco já dado; canCancel exige lastStage>=14;
  pula direto para o maior marco aplicável (ex. entrou com 10d → marco 7, não 3 depois 7).
- Gate: tsc + vitest.

### T2 — Migration lastDunningStage + reset nos 3 pontos + notificação retorna boolean
- Migration aditiva `Subscription.lastDunningStage Int?`.
- Resetar `lastDunningStage: null` junto do `pastDueSince: null` em: webhook asaas:198, actions reactivate:55,
  faturas/workflow:73. (change_plan NÃO; checkout PAST_DUE-órfã anotado como dívida.)
- `createCompanyNotification` passa a retornar `Promise<boolean>` (true=create ok). Conferir os call-sites
  existentes (F3 addAdminMessage/updateTicketStatus etc.) — eles ignoram o retorno, então a mudança é
  compatível (void→boolean não quebra quem não usa).
- Gate: tsc + vitest (suite não pode regredir).

### T3 — Reescrever o cron de dunning
- `where` inclui SUSPENDED. Loop usa os helpers; envia CompanyNotification (cliente) nos marcos e SÓ avança
  lastDunningStage se ok===true; suspende só com lastStage>=14; AdminNotification nos críticos; guarda
  anti-cancelamento-sem-aviso; tudo auditado (ActorType.SYSTEM); idempotente.
- Gate: tsc + build.

### T4 — Gate final + merge + deploy
- tsc + vitest + build + code-reviewer (idempotência real, fail-soft, multi-tenant, não cancela sem aviso).
- merge --no-ff na main → push.
- **Aplicar migration manual em prod ANTES do deploy** (migrate deploy; confirmar status).
- Deploy prod → smoke (cron/dunning sem Bearer=401; públicas 200; admin 307). Idealmente acionar o cron
  com CRON_SECRET em sandbox e ver o summary.
- Atualizar memória; **marcar o plano de resolução do SaaS Admin como CONCLUÍDO (F0-F5)**.

---

## Riscos & cuidados

- **Idempotência:** `lastDunningStage` gravado após o envio; reexecução no mesmo dia não reenvia (stage não
  avança). A notificação em si é fail-silent — se falhar, o stage NÃO deve avançar (senão pula aviso);
  gravar stage só após o `createCompanyNotification` retornar (ele não lança, mas loga falha).
- **Não cancelar sem avisar:** guarda explícita (daysOverdue>=30 mas lastStage<14 → adia). Cobre subscription
  que "nasceu velha" ou janela em que o cron não rodou.
- **Reset na recuperação:** sem isso, cliente que ficou PAST_DUE, pagou, e voltou a atrasar não receberia
  avisos (lastStage preso em 14). Crucial validar o ponto de promoção a ACTIVE.
- **Migration:** aplicar manual antes do deploy (build não roda migrate deploy).
- **Volume:** notificações são writes leves; se a base de inadimplentes crescer muito, considerar maxDuration.
- **Smoke do domínio:** produção está em `vis.app.br` (rebranding) — confirmar domínio no ar antes do smoke
  público; senão validar via URL direta/sandbox.

## Pronto quando
- Inadimplente recebe avisos in-app em 3/7/14d; admin é avisado na suspensão e no cancelamento.
- Cancelamento aos 30d só com avisos registrados (teste cobre o caso "sem aviso → adia").
- Idempotência garantida (teste: 2 runs no mesmo dia não duplicam).
- tsc/vitest/build verdes; code-review sem CRITICAL/HIGH; deploy + smoke OK.
- **Plano de resolução do SaaS Admin CONCLUÍDO (F0–F5).**
