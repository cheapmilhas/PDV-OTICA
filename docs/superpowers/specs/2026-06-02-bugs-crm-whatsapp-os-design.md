# Spec — 3 Bugs: CRM segmentos, WhatsApp agradecer, Numeração de OS

**Data:** 2026-06-02
**Status:** aprovado para implementação (decisões de produto fechadas)
**Sem migration de schema.** Apenas lógica + backfill de dados via código.

---

## Contexto

Três bugs relatados pelo dono no dogfood:

1. Botão "Agradecer pelo WhatsApp" não funciona ao clicar.
2. CRM: clientes aniversariantes aparecendo também no segmento "Pós-Venda 30d".
3. Numeração de OS: cliente faz retrabalho (`00015-RR`) e depois garantia vira `00018-G` — o número-base deveria permanecer `00015`.

Diagnóstico confirmado em código + consultas read-only ao banco de produção. Cada fix foi submetido a verificação adversarial de blast radius (2 agentes Explore) que revelou 3 armadilhas de regressão — todas incorporadas ao plano abaixo.

---

## Bug 1 — Botão "Agradecer pelo WhatsApp" (BAIXO RISCO)

### Causa raiz (confirmada)
- Handler `handleThankYouWhatsApp` (`src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx:262-308`) depende de `settings.messageThankYou`. Se vazio → early-return com toast "Mensagem de agradecimento não configurada" (linhas 280-284). Para o usuário, "não acontece nada".
- `settingsService.get()` (`src/services/settings.service.ts:9-29`) só popula os 4 templates default **na criação** do registro `CompanySettings`. Registros criados antes das colunas existirem (drift) têm os campos NULL e nunca recebem backfill.
- **Confirmado em produção:** as 6 empresas têm `messageThankYou = NULL` (consulta `COUNT(*) FILTER (WHERE messageThankYou IS NULL OR = '')` → 6/6). As colunas existem no banco; só os dados estão vazios.
- Mesmo defeito afeta silenciosamente orçamento/lembrete/aniversário quando lidos via settings.

### Fix (decisão: backfill automático no get())
Em `settingsService.get()`, após buscar (ou criar) o registro, preencher com `DEFAULT_MESSAGES` qualquer um dos 4 campos (`messageThankYou`, `messageQuote`, `messageReminder`, `messageBirthday`) que esteja `null` ou string vazia. Persistir num único `update` **só quando houver lacuna** (evita write desnecessário no caminho quente).

```ts
async get(companyId: string) {
  let settings = await prisma.companySettings.findUnique({ where: { companyId } });
  if (!settings) {
    settings = await prisma.companySettings.create({ data: { companyId, ...defaults } });
    return settings;
  }
  // Backfill de templates legados (drift): preenche só os campos faltantes.
  const patch: Record<string, string> = {};
  if (!settings.messageThankYou)  patch.messageThankYou  = DEFAULT_MESSAGES.thankYou;
  if (!settings.messageQuote)     patch.messageQuote     = DEFAULT_MESSAGES.quote;
  if (!settings.messageReminder)  patch.messageReminder  = DEFAULT_MESSAGES.reminder;
  if (!settings.messageBirthday)  patch.messageBirthday  = DEFAULT_MESSAGES.birthday;
  if (Object.keys(patch).length > 0) {
    settings = await prisma.companySettings.update({ where: { companyId }, data: patch });
  }
  return settings;
}
```

### Blast radius (verificado)
- `settingsService.get()` é chamado só por `src/app/api/settings/route.ts:13` (GET). `reset-message` usa outro método. Baixo acoplamento.
- Os 4 defaults existem em `src/lib/default-messages.ts` (thankYou/quote/reminder/birthday).
- Idempotente: após o primeiro GET por empresa, patch fica vazio.

### Teste
- `settings.service`: registro com `messageThankYou=null` → `get()` retorna preenchido e persiste; 2ª chamada não escreve de novo.

---

## Bug 2 — CRM: aniversariante no segmento Pós-Venda (RISCO — armadilha de constraint)

### Causa raiz (confirmada)
- `generateReminders` (`src/services/crm.service.ts:99-189`): segmentos **não são mutuamente exclusivos**. `BIRTHDAY` (linha 100) e `VIP` (linha 180) usam `if` solto; a cadeia de inatividade usa `else if` interno. Cliente em mês de aniversário **e** 30-90d sem comprar gera **dois** lembretes (BIRTHDAY + POST_SALE_30_DAYS) → aparece nas duas abas.

### Armadilha descoberta (verificação adversarial)
- Persistência usa `createMany({ skipDuplicates: true })` (`crm.service.ts:~218`) e **não deleta/cancela** lembretes antigos.
- Índice único parcial `customer_reminders_active_unique (companyId, customerId, segment) WHERE status ∈ (PENDING, IN_PROGRESS, SCHEDULED)` (migration `20260601002050`).
- **Se eu só "parar de gerar" POST_SALE para aniversariante:** o POST_SALE já existente fica PENDING preso; quando o mês vira, `skipDuplicates` vê o registro velho e **não recria** → cliente some da aba Pós-Venda **para sempre**. Trocaria bug visual por perda de relacionamento silenciosa.

### Fix (decisão: aniversário tem prioridade — exclui pós-venda/inatividade no ciclo)
1. Detectar `isBirthdayMonth` para o cliente.
2. Se `isBirthdayMonth`: gerar **só** BIRTHDAY (e VIP, que segue independente — não foi o relatado, mantido como está). **Pular** toda a cadeia POST_SALE_*/INACTIVE_* (envolver o bloco `if (daysSinceLastPurchase !== null)` com `&& !isBirthdayMonth`).
3. **Liberar a constraint:** ao gerar os lembretes, cancelar (status → `CANCELLED` ou `EXPIRED`) os lembretes ativos de segmentos pós-venda/inatividade pré-existentes dos clientes que entraram em BIRTHDAY neste ciclo. Isso libera o índice parcial e permite que o POST_SALE volte a ser criado quando o mês de aniversário passar. Fazer via `updateMany` scoped por companyId + customerId(s) aniversariantes + segment ∈ lista pós-venda/inatividade + status ativo, dentro da mesma operação de geração.
   - Cancelamento preserva histórico (`CrmContact` é imutável e FK opcional; verificado seguro).

### Blast radius (verificado)
- Consumidores: `getReminders` (GET reminders), `getSegmentCounts` (badges), dashboard `/lembretes`. Todos filtram por status ativo → cancelar reflete contagem corretamente.
- `getGoalProgress` e `getCrmReport` usam `crmContact` (histórico), **não** afetados.
- `applyPostSaleReminder` (sale-side-effects) cria POST_SALE ao vender; convive — quando o cliente não está mais em aniversário e não há POST_SALE ativo, volta a funcionar.

### Teste
- Cliente aniversariante + 35d sem comprar → gera só BIRTHDAY (não POST_SALE_30_DAYS).
- Cliente com POST_SALE ativo que entra em mês de aniversário → POST_SALE é cancelado, BIRTHDAY criado.
- "Mês virou" (não-aniversariante, 35d) → POST_SALE_30_DAYS é criado normalmente (constraint liberada).
- Cliente VIP aniversariante → mantém BIRTHDAY + VIP (VIP não é excluído).

---

## Bug 3 — Numeração de OS muda entre retrabalho e garantia (RISCO — warrantySeq)

### Causa raiz (confirmada)
- `osDisplayNumber` (`src/lib/os-number.ts:50`) já prefere `originalOrder.number`. **Porém** `createWarranty` (`src/services/service-order.service.ts:869`) grava `originalOrderId = originalId` = **pai imediato**.
- Cenário do dono: garantia criada **a partir de** um retrabalho (`00015-RT`, number=18). O `originalOrderId` da garantia aponta ao retrabalho (number=18) → exibe `#000018-G` em vez de `#000015-G`. O número-base "pula" porque herda do intermediário, não da raiz.
- Pontos adicionais que exibem `String(order.number)` cru (ignoram o helper): `ordens-servico/page.tsx:140,155,271,356`; `[id]/detalhes/page.tsx:332`.

### Armadilha descoberta (verificação adversarial)
- `warrantySeq` é calculado contando filhos do **pai imediato** (`crm`/`service-order.service.ts:838-848`, `where: { originalOrderId: originalId, ... }`). Se eu só mudar o write para raiz **sem** mudar este count, a sequência fica inconsistente (pode duplicar/pular `#0015-G`). Os dois precisam mudar juntos.

### Fix (decisão: tudo sob a OS-raiz — lista plana de derivações)
1. **Encadear à raiz** em `createWarranty`:
   ```ts
   const rootId = original.originalOrderId ?? original.id;
   // ...
   originalOrderId: rootId,   // (era: originalId)
   ```
2. **warrantySeq por raiz** (mesma transação, mantendo o `FOR UPDATE` de serialização — agora lockando a raiz):
   ```ts
   const sameTypeCount = await tx.serviceOrder.count({
     where: { originalOrderId: rootId, ...(flags do tipo) },
   });
   ```
   Lock: `SELECT id FROM "ServiceOrder" WHERE id = ${rootId} FOR UPDATE`.
3. **Trocar exibições cruas** por `osDisplayNumber()` nos 5 pontos:
   - `ordens-servico/page.tsx:140` (toast entrega), `:155`, `:271`, `:356` (modais).
   - `[id]/detalhes/page.tsx:332` ("Garantia da OS #..." — usar o número-base via helper/`originalOrder.number`).

### Comportamento resultante (aprovado pelo dono)
- Retrabalho e garantia da mesma OS são **irmãos sob a raiz 00015**: `#00015-RT`, `#00015-G`, `#00015-G2`...
- Árvore de derivações fica **plana** sob a raiz (não aninhada). Decisão do dono: "Sim, tudo sob a 00015".

### Blast radius (verificado)
- Sem `@@unique`/índice em `originalOrderId`. Sem constraint violada.
- Relatórios/BI não usam `originalOrderId`/`reworkOrders` — SEGURO.
- Validação "garantia não vira venda" (`service-order.service.ts:~1034`) independe de `originalOrderId` — SEGURO.
- Tela de detalhes lista `reworkOrders` (filhos diretos): com tudo sob a raiz, a raiz lista todas as derivações; intermediários não listam netos (consistente com lista plana).

### Dívida anotada
- OS de retrabalho/garantia **já criadas** antes do fix mantêm `originalOrderId` apontando ao intermediário → continuam exibindo o número do intermediário. Backfill opcional (UPDATE setando `originalOrderId` à raiz para derivações de derivações) só se houver casos reais em produção — avaliar sob demanda. Não bloqueia o fix.

### Teste
- `os-number` / `service-order.service`: criar OS 15 → retrabalho (exibe #000015-RT, originalOrderId=15) → garantia a partir do retrabalho (exibe #000015-G, originalOrderId=15, não 18).
- Duas garantias da mesma raiz → `#000015-G`, `#000015-G2` (warrantySeq por raiz, sem duplicar).

---

## Plano de execução (workflow do dono)

1. Implementar **1 bug por vez**, por subagente, sem paralelizar commits.
   - Ordem sugerida: Bug 1 (baixo risco) → Bug 2 → Bug 3.
   - Para cada um: escrever teste primeiro (RED) → implementar (GREEN) → refatorar.
2. Gate ao fim de cada bug: `tsc` + `vitest` + `next build` + `code-reviewer` (caçar regressão; corrigir CRITICAL/HIGH).
3. Commits separados por bug (conventional commits).
4. Merge na `main` (`--no-ff`) → push → **dono dispara o deploy** → smoke → atualizar memória.
5. **Sem migration de schema.** Backfill de settings roda em runtime (lazy no get()).

## Riscos residuais aceitos
- Bug 3: derivações antigas de derivações mantêm número do intermediário até backfill opcional.
- Bug 2: corrida marginal cron×geração coberta pela transação/updateMany scoped; índice parcial mantém integridade.
