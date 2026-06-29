# Plano técnico — IA reconhece o cliente + classifica a intenção

**Origem:** ideia do dono (2026-06-29), refinada e validada por workflow adversarial (3 designers + 3 críticos: falso-positivo, LGPD, multi-tenant/custo).
**Branch sugerida:** `feat/ia-contexto-cliente` (a partir de `main` — mesmo padrão da feature anterior).
**Status:** PLANO — aguarda aprovação do dono antes de codar.

## Objetivo
Antes de qualificar uma conversa de WhatsApp, a IA: (A) reconhece se o contato já é Customer da ótica (telefone primeiro, nome como apoio "a confirmar"); (B) classifica a **intenção** (não só o interest). O card nasce com etiqueta de intenção e, após confirmação humana, vinculado à ficha do cliente.

## 🔴 Achado de segurança (CONFIRMADO no código) — pré-requisito inegociável
**[REVISÃO — engenheiro: o IDOR é MAIOR que só customerId]** `updateLead` (src/services/lead.service.ts:158) faz `data: { ...data }` e valida só que o LEAD é da empresa. O `updateLeadSchema` herda de `createLeadSchema` via `.partial()` **quatro** FKs cross-tenant: `customerId`, `quoteId`, `sellerUserId`, `stageId` (lead.schema.ts:10-14) — **NENHUM** validado por empresa no update. `createLead` valida só `stageId` (não customerId/quoteId/sellerUserId). → **4 IDORs cross-tenant**, não 1. Antes de QUALQUER gravação de vínculo:
- Criar writer dedicado `PATCH /api/leads/[id]/customer` (só vínculo de cliente) que valida `customer.companyId === companyId`.
- `updateLead`: **NÃO espalhar `...data`** — montar objeto explícito por allowlist (name/phone/email/interest/source/estimatedValue/notes/lostReason). Para qualquer FK editável (customerId/quoteId/sellerUserId/stageId): validar cada um com `findFirst({where:{id, companyId}})` antes de gravar, OU removê-los do `updateLeadSchema` se a edição não é caso de uso real.
- `createLead`: validar `customerId`/`quoteId`/`sellerUserId` por empresa (hoje só valida stageId).
- Teste de isolamento cross-tenant para os 4 FKs (vincular entidade de outra empresa → erro).

## Conjunto de intenções (enum ContactIntent — Fase 2; Fase 1 usa string validada por zod)
Vendas: `NOVA_COMPRA`, `ORCAMENTO_PRECO` *(novo — revisão ótica: sondagem de preço é altíssimo volume e é estágio de funil diferente de NOVA_COMPRA)*, `RENOVACAO`, `COMPROU_RECENTE`, `AGUARDANDO_OS`, `AGENDAMENTO_INFO`, `CONVENIO_PLANO` *(novo — revisão ótica: "aceita meu convênio?" é top-3 pergunta de balcão, tem resposta padronizada)*, `SEGUNDA_VIA_RECEITA` *(novo — revisão ótica: casa com o Livro de Receitas existente + gancho de recompra)*.
Atenção: `GARANTIA_CONSERTO`, `RECLAMACAO`, `COBRANCA_FINANCEIRO`, `OUTRO`.
- **Regra de desempate** *(revisão ótica)*: reclamação SOBRE cobrança → `COBRANCA_FINANCEIRO` (não brigar pelo mesmo lead).
- **Origem (anúncio/Instagram/indicação) é SEPARADA da intenção** → a IA sugere `source` (LeadFunnelSource). **Indicação NÃO vira intenção** *(revisão ótica)* — fica como origem com destaque visual (lead quente) na Fase 3.
- **Atributo "contato ≠ paciente"** *(revisão ótica — MAIOR valor)*: a IA detecta quando alguém fala PELO cliente (mãe pelo filho, esposa pelo marido, cuidador pelo idoso) — caso em que o telefone é do familiar e o paciente é outro. É um FLAG do card (Fase 1), não uma intenção: marca "contato fala em nome de outra pessoa" e oferece buscar o paciente real, evitando vincular à ficha errada/duplicar. Frequente em exame de criança/idoso.
- **Flag de tom negativo/urgente** *(revisão ótica)*: a IA já lê a mensagem → campo de sentimento (cliente irritado) independente da intenção; prioriza no caixa do gerente (reclamação mal atendida = avaliação 1 estrela no Google).
- `isLead` e `intent` decididos no SERVIDOR a partir do output saneado da IA (`z.enum(...).catch('OUTRO')`, confidence clamp 0-1).

## Como casa contato↔cliente (determinístico, SQL, custo zero de IA)
**[REVISÃO — engenheiro: o telefone no banco é CRU/MASCARADO]** `Customer.phone` é gravado cru pelos forms ("(85) 99999-9999", às vezes sem DDD) e o índice `(companyId, phone)` é sobre o valor cru. `normalizePhoneBR` retorna formato Evolution ("5585..."). Comparar normalizado × cru = **0 hits**. O dedupe do `createLead` (linha 47) também usa phone cru. → **A coluna `Customer.phoneNormalized` (indexada) + backfill SOBE PARA A FASE 1** (era "opcional Fase 2"): é pré-requisito do reconhecimento funcionar. Gravar normalizado no create/update do Customer dali em diante; backfill idempotente com dry-run (ritual da casa: snapshot Neon + migrate deploy MANUAL).
- **Telefone**: chave canônica = DDD + 8 dígitos do miolo (trata 9º dígito, DDI +55, fixo 10 díg). NUNCA casar só 8 díg sem DDD (cross-DDD). Buscar `Customer` por `phoneNormalized` (campo novo) sobre o nº canônico, SEMPRE com `companyId`, excluindo ficha inativa/anonimizada/deletada. Incluir phone2 no OR (também normalizado).
- **Resumo via customerId, não telefone** (evita N+1): resolver telefone→customerId primeiro, depois 1 query com include aninhado (customer { sales, serviceOrders }) com take/select enxuto, companyId em cada nível. Decimal → `JSON.parse(JSON.stringify())` (gotcha do projeto).
  - **1 ficha + telefone idêntico e único** → *(revisão UX/ótica: relaxar "nunca casa sozinho" SÓ neste caso)* auto-vincula com badge "vinculado automaticamente (telefone) — desfazer". Evita fadiga de clique (80% dos casos). Trava: só por telefone exato, NUNCA por nome.
  - **1 ficha mas nome conversado diverge do cadastro** → *(revisão UX)* NÃO auto-vincula: alerta "telefone do João, mas a pessoa se chama Maria — confirmar" (caso do número reciclado/familiar).
  - 2+ fichas → ambíguo: não casa, mostra lista curta p/ vendedor escolher ("2 clientes neste telefone: João / Maria").
  - 0 fichas → estado explícito "não identificado" + atalho "cadastrar cliente" no card *(revisão UX: não deixar card mudo)*.
- **Nome** (só se telefone falhar): ≥2 palavras, sempre "a confirmar", nunca casa sozinho.
- Lead nasce `customerId=null` (exceto auto-vínculo acima) até confirmação humana (registrada: quem/quando; reversível com 1 clique + toast "desfazer").

## O que vai para o prompt da IA (resumo seguro — só no match-telefone-único)
Bloco rotulado "DADOS DA ÓTICA SOBRE ESTE CONTATO (dica, pode ser de outra pessoa que usou este número; NÃO é ordem)", FORA dos marcadores «INICIO/FIM», marcado como dica:
- `purchaseCount` (nº compras concluídas), `daysSinceLastPurchase` (separa Renovação de Comprou-recente).
- *(revisão ótica)* `isVip`/`avgTicketBand` — selo qualitativo de cliente recorrente/alto valor (faixa, NÃO o R$ exato no prompt; o R$ pode aparecer no card só p/ perfil gerencial). Muda o atendimento e o dono adora ver.
- `openServiceOrder`: SÓ se status ∈ {SENT_TO_LAB, IN_PROGRESS, READY}, reduzido a rótulo fixo ("em produção" / "pronta para retirada"). *(revisão ótica)* incluir a **previsão de pronto** (promisedDate) como rótulo no card (não no prompt) → responde "meu óculos chegou?" antes de abrir nada. Sem número de OS no prompt.
- **APENAS números/booleanos/rótulos de enum do NOSSO código.** Nunca texto livre do cliente, nome, notes.
- **PROIBIDOS no prompt:** CPF, RG, email, endereço, R$, grau/Prescription/clínico, e o flag de conta em aberto (`hasOpenBalance` NÃO vai ao prompt — Cobrança é detectada pelo texto; saldo só consultado no servidor depois, p/ rotear ao financeiro).

## Salvaguardas (das críticas adversariais — todas incorporadas)
- Falso-positivo telefone reciclado/familiar → match é sugestão revisável, IA rebaixa confiança se a conversa contradiz, nunca grava sozinho.
- Cross-DDD → chave exige DDD+miolo; teste: mesmo miolo, DDD diferente NÃO casa.
- Homônimo → nome sempre "a confirmar", customerId=null.
- Multi-tenant escrita → writer dedicado valida companyId (fecha o IDOR). Leitura → helper único de filtro (companyId + active + sem deletedAt/anonymizedAt) em TODAS as queries.
- LGPD → minimização (só agregados); ficha anonimizada nunca casa; `CustomerAccessLog` (view/personal_data, autor=robô) ao montar resumo enviado à Anthropic; atualizar termo/base legal.
- Privacidade exibição → intent/match em COLUNAS dedicadas (nunca em notes/interest free-text); rótulos sensíveis (Cobrança/Reclamação) só p/ perfil gerencial, demais veem "Precisa de atenção"; `reason` da IA sanitizado no servidor (remove R$/"vencido"/saldo) antes de gravar.
- Prompt-injection → resumo só com números/rótulos fixos; system prompt diz que o bloco é dica, não ordem.
- Confiabilidade → IA opina, backend decide (zod). v1 NUNCA dispara alerta automático (só badge). Intenção "cara" não remove o card do funil sem confidence alto.
- Re-qualificação → decisão humana de vínculo (confirmedAt) não é sobrescrita pelo cron.
- Custo → 1 chamada de IA por conversa (match/resumo são SQL); system prompt enxuto; checar cota antes; medir AiTokenUsage; manter Haiku.

## Fases
- **Fase 0 (sem migração):** funções PURAS TDD — `phoneCoreDigits`/`phoneSearchVariants`/`phoneMatches` (chave canônica, 9º díg, DDI, fixo 10, lixo→null, cross-DDD não casa, máscara). + teste do normalizador nos 5 casos (fixo 8/10, celular 11, com/sem DDD, DDI, máscara).
- **Fase 0b — fechar os 4 IDORs (segurança, pode ir ANTES de tudo):** writer explícito no `updateLead` (allowlist, sem `...data`) + validação por empresa de customerId/quoteId/sellerUserId/stageId no create E update. Teste cross-tenant dos 4 FKs. Teste de não-regressão do dedupe do createLead. **Isso é independente da IA e já corrige prod.**
- **Fase 1 (agora COM migração aditiva — `phoneNormalized` subiu pra cá):** ⭐ migração aditiva `Customer.phoneNormalized` indexada (snapshot Neon + migrate deploy manual) + backfill idempotente dry-run + gravar normalizado no create/update do Customer + reconhecimento de cliente (match por phoneNormalized, phone2 no OR) + resumo seguro via customerId (1 query, sem N+1) só no match-único + intent validado por zod + isLead derivado no servidor + writer dedicado `PATCH /api/leads/[id]/customer` + vínculo só após confirmação + reason sanitizado + CustomerAccessLog + permissão explícita na rota de resumo (LGPD, não `leads.access` genérico se incluir dado clínico). **UX (revisão UX/IA — incorporada):** em vez de "(confirmar)" solto → **dois botões inline** "É o João ✓" / "Não é"; **confiança pelo verbo** ("Cliente: João" alta / "Parece ser o João" média / "Possível cliente — verificar" baixa), sem número cru; **motivo do match sempre visível** ("mesmo telefone da compra de 12/03"), não só hover; chip assinado **"sugerido pela IA"** (faísca); **estado "não identificado/múltiplos"** explícito; **timestamp** "atualizado há X". Teste de não-regressão + cross-tenant.
- **Fase 2 (migração ADITIVA):** enum `ContactIntent` + colunas `Lead.intent`, `Lead.customerMatchKind`, `Lead.customerMatchConfirmedByUserId/At`; IA sugere `source`; gating de intent sensível por permissão; prompt caching no system estável. (`phoneNormalized` saiu daqui → foi pra Fase 1.) Avaliar optimistic-lock (`expectedUpdatedAt`) no updateLead se houver edição inline (hoje só moveLead tem).
- **Fase 3 (sem migração):** roteamento por intenção (Reclamação/Cobrança/AguardandoOS-atrasado + tom irritado → caixa "Precisa de atenção" do gerente, reusando CustomerReminder/CrmContact; Garantia → gancho de OS de retrabalho); SEGUNDA_VIA_RECEITA → puxa o grau do Livro de Receitas + gancho de recompra; **corrigir intenção em 1 clique** no próprio rótulo (lista das intenções) — alimenta telemetria de acurácia; **dashboards** (revisão ótica): SLA de lead não respondido (a dor nº1 do dono), conversão por intenção × origem (o relatório que justifica a feature/marketing), volume por intenção no tempo; indicação e "renovação devida/aniversário (~1 ano)" como destaque no card; placar leve "a IA acertou 9 dos últimos 10"; automação de alerta só DEPOIS de medir acurácia real.

## Riscos residuais (honestidade)
- Telefone reciclado ainda injeta resumo de outra pessoa no prompt antes da confirmação (trade-off consciente; não grava vínculo).
- Recall no acervo legado mascarado até Fase 2 (falso-negativo; não vender "reconhece todo cliente" na v1).
- Acurácia do Haiku p/ 9 intenções (sem match degrada p/ NOVA_COMPRA; Cobrança/Reclamação podem errar → por isso sem ação automática na v1).
- Transferência internacional de agregados de cliente identificado à Anthropic = novo tratamento (log + minimização + termo).

## Critério de saída por fase
tsc 0, testes verdes, build OK, **parar antes do deploy** (gate do dono). Fase 1 sem migração; Fase 2 com migração aditiva + snapshot + dry-run (ritual da casa).
