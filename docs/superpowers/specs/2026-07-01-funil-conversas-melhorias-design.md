# Melhorias do Funil & Conversas da Ótica — Design

**Data:** 2026-07-01
**Status:** aprovado (brainstorming) — pronto para virar plano de implementação
**Método:** entendimento do fluxo da ótica + pesquisa de mercado (Pipedrive/HubSpot/Intercom/Kommo) + inventário do código + painel de 3 agentes criativos e 3 críticos (risco/LGPD, YAGNI, dono cético).

---

## 1. Objetivo (na voz do dono)

Aumentar a **conversão lead→venda** de uma ótica, com dois focos declarados:
1. **Medir conversão** e ter a **lista dos que NÃO converteram** para recuperar (puxar de volta com promoção/desconto).
2. **Medir tráfego pago** — quantos leads de anúncio converteram.

## 2. Restrições duras (invioláveis)

- A atendente **responde o cliente pelo WhatsApp do CELULAR** (fora do sistema). O Vis NÃO é canal de resposta.
- A **IA nunca fala com o cliente** — só organiza/classifica/sugere internamente.
- Recuperação/aviso = **envio MANUAL**: o sistema dá lista + texto pronto + botão que abre o WhatsApp; a atendente cola e manda.
- WhatsApp **compartilhado** entre poucas atendentes; negócio pequeno (1-4 filiais); atendente leiga e afogada.

## 3. Aprendizados do debate (o que mudou o plano)

1. **"Placar de conversão é vaidade; não põe dinheiro no caixa amanhã."** O que vende na 1ª semana é **dinheiro que já é seu**: OS pronta parada e recompra de lente. → o placar foi rebaixado de "essencial" para "suporte".
2. **Nunca confiar em botão "já respondi"** — apodrece como os "cards presos em Novo" ([[funil-cards-presos-novo]]). A verdade vem do **fluxo real de mensagens** (existe outbound? a OS foi entregue?).
3. **Recompra ≠ mensagem de saúde** — "renovar seu grau" toca dado sensível (LGPD Art. 11) e arrisca **ban do número compartilhado**. Reformular como "revisão/check-up", com opt-out registrado e volume baixo.
4. **Tráfego pago é "pista aproximada", não ROI** — o sistema usa **Evolution (número pessoal), não WhatsApp Cloud API oficial**, então não há `referral`/`ctwa_clid` confiável do Meta. Atribuição por mensagem-isca falha 30-60%. Mostrar sempre a taxa de captura; nunca vender como decisão de verba.
5. **Uma fila com teto rígido (≤8-10/dia)**, nunca 6 listas que afogam a atendente.
6. **Descartado:** gamificação individual (impossível atribuir autor com WhatsApp compartilhado); "dono fixo" (vira "lock leve pegou"); ROI exato agora; aniversário/crediário na fila de venda.

## 4. Princípios de UX (atendente leiga)

- **Semáforo de cor > relógio** (🟢🟡🔴 + "pronto há 6 dias", nunca "há 3h47").
- **Frases imperativas** com nome do cliente ("Avise o João", "Você tem 5 pra hoje"). Zero jargão (nada de "lead", "SLA", "pipeline" — usar "cliente", "avisar", "pronto", "falta receber").
- **Teto rígido de lista + 1 número no topo**; o resto é "+N mais antigos", nunca scroll infinito.
- **Mínimo de telas** — tudo mora dentro do que já existe (aba na OS, painel no inbox, card no Dashboard). Zero entradas novas na sidebar no Sprint 1.
- **Verdade derivada, botão como atalho** — nenhum estado crítico depende de clique disciplinado.
- **Feedback sempre visível, nunca falha calada** (toast em todo toque; fallback de clipboard).

---

## 5. Roadmap em sprints (priorizado por conversão)

### 🟢 SPRINT 1 (curto) — "Dinheiro que já é seu" + copiloto seguro

**#1 — OS Pronta Parada (PRIMEIRA feature).** Aba/filtro **"Prontos pra avisar"** na tela de Ordens de Serviço (`src/app/(dashboard)/dashboard/ordens-servico/page.tsx` — segue o padrão de `statusFilter`/`counts` que a página já usa, não `Tabs`) + card-atalho no Dashboard. Query: `ServiceOrder WHERE status=READY AND deliveredAt IS NULL`, ordenado por `readyAt` asc. Linha: semáforo (deriva de `readyAt`), nome, "pronto há X dias", "falta receber R$ Y" (se houver saldo), botão **"Avisar no WhatsApp"** (copia texto + abre `wa.me`).
- **"Avisado" — fonte canônica ÚNICA (decisão B1 do review):** existe um `WhatsappMessageLog type=OS_READY` com `referenceId = serviceOrder.id` e `status=SENT`. É determinístico e ligado à OS — **NÃO** derivar de "outbound genérico na conversa por telefone" (o join OS→Customer.phone→conversa é frágil, a normalização de telefone falha e daria falso-positivo de qualquer outbound). Um óculos "avisado" some da lista. Remoção permanente = `DELIVERED` (fato de negócio). Adiar = "ocultar por hoje" (`snoozedUntil`, volta amanhã se ainda `READY`).
- **Conflito com a automação existente (decisão B2 do review):** o motor JÁ envia OS_READY automaticamente quando `waOsReadyEnabled` está ligado (`whatsapp-automation.service.ts:172,258-284`). Para NÃO gerar aviso duplicado ao cliente (risco de ban do número compartilhado): o botão manual **só aparece/habilita quando NÃO existe `WhatsappMessageLog type=OS_READY` (SENT) para aquela OS**. Se a automação já avisou, a linha mostra "✓ Já avisado" e o botão fica oculto. Assim o manual cobre só as óticas/casos sem automação, sem colidir.
- **Opt-out (decisão C1):** o aviso "OS pronta" é transacional (não marketing), então o botão manual **não** checa `acceptsMarketing` — decisão consciente (a automação `runOsReady` filtra opt-out no fluxo automático; o manual é a atendente avisando um cliente sobre o próprio pedido).
- **Migração:** só `ServiceOrder.snoozedUntil DateTime?` (aditivo). Status já existe (`READY`/`DELIVERED`/`readyAt`/`deliveredAt`).
- Encaixe: `prisma/schema.prisma:925-998` (ServiceOrder), `:4615+` (`WhatsappMessageLog`), `whatsapp-automation.service.ts:257-284` (`runOsReady`).
- **Critério de aceite:** (1) lista mostra só `READY` não entregues, ordenada por mais antigo; (2) OS com `WhatsappMessageLog OS_READY SENT` NÃO mostra botão (mostra "já avisado"); (3) semáforo 🟢 0-1d / 🟡 2-4d / 🔴 5d+; (4) botão copia o texto E abre `wa.me` com o número do cliente; (5) "ocultar por hoje" some e reaparece após 24h se ainda `READY`; (6) marcar `DELIVERED` remove permanentemente; (7) estado vazio comemorativo quando não há nenhuma.

**#2 — Botão "Abrir no WhatsApp" reutilizável (`<WhatsAppButton>`).** 1 toque = copia rascunho + abre `wa.me/55DDDNUM` + toast. **Lock social leve** "fulana pegou (2 min)" (não bloqueante) para o WhatsApp compartilhado. Reusa `Lead.phone`/`contactNumber` (já disponíveis) + normalização de `src/lib/lead-phone-match.ts`. **Sem migração** (lock pode ser estado efêmero com TTL, sem persistir).
- **Critério de aceite:** (1) clicar copia o texto para o clipboard E abre `wa.me` com o número normalizado correto; (2) toast confirma "copiei ✅"; (3) se o clipboard falhar, mostra o texto selecionável (fallback, nunca falha calada); (4) botão escondido quando não há telefone; (5) após alguém clicar, os outros veem "fulana pegou" por ~15 min, mas o botão continua clicável ("avisar mesmo assim").

**#3 — IA copiloto no inbox.** No painel da conversa (`whatsapp-inbox.tsx`): bloco "🤖 Resumo da IA" + "✍️ Sugestão de resposta (rascunho seu)" com botão "Copiar" e aviso fixo **"isto é só um rascunho seu — a IA não manda nada"**. Nova função no estilo de `lead-qualifier.ts` (mesmo SDK/anti-injection), rota nova, **stateless (sem migração)**.
- **Critério de aceite:** (1) gera resumo (1-2 linhas) + rascunho a partir das mensagens da conversa; (2) botão "Copiar" copia o rascunho (editável antes de copiar); (3) o aviso "só um rascunho seu" está SEMPRE visível; (4) nenhuma mensagem é enviada ao cliente pelo sistema em nenhum caminho; (5) falha da IA mostra erro amigável, não quebra o inbox.

### 🟢 SPRINT 2 (curto) — Fila única + laço automático + placar

**#4 — "Fila de Hoje":** UMA tela priorizada, **teto ≤8-10**, agregando SLA (`lead-sla.ts`) + needs-reply (`lead-needs-reply.service.ts`) + atenção (`lead-needs-attention.ts`) + OS parada. View computada (service agregador), **sem migração**.
**#5 — Laço fechado pelo fluxo real** (outbound existente), reusa o mecanismo do fix de hoje ([[funil-card-preso-outbound]]). Semáforo = tempo sem resposta.
**#6 — Placar de conversão + por origem + período:** `getLeadStats` já calcula; **falta só filtro de data** (`Lead.createdAt` já existe). Aditivo, esforço baixo.

### 🟡 SPRINT 3-4 (médio) — Recuperação + tráfego (com travas)

**#7 — Lista única de não-convertidos** ("clientes esfriando"): `sales: { none: {} }` + `stage.isWon=false` (reusa `Sale.leadId`). Filtros origem/período/motivo.
**#8 — Motivo de perda estruturado:** enum `LostReasonCategory` (PRICE/COMPETITOR/GAVE_UP/NO_RESPONSE/WRONG_PRODUCT/OTHER) + campo em `Lead` (mantém `lostReason` texto como detalhe). **Migração aditiva.** Troca o `Textarea` livre por botões em `lost-reason-modal.tsx`. → reoferta por motivo.
**#9 — Detectar tráfego pago:** mensagem-isca + IA backup, **rotulado "origem aproximada" + taxa de captura visível**. Novo valor `PAID_TRAFFIC` em `LeadFunnelSource` (migração aditiva). **Confirmado no review:** o schema de entrada atual (`whatsapp-inbound.ts`) NÃO tem `referral`/`ctwa_clid`/`externalAdReply` — a atribuição por **payload nativo do Meta é inviável com Evolution**. Restam só (a) mensagem-isca (texto padrão do anúncio, frágil ~30-60% de perda) e (b) IA inferindo pelo texto. Portanto: entregar como **sinal grosso "veio de anúncio (aproximado)"**, nunca como ROI; sempre exibir a taxa de captura ao lado do número.
**#10 — "Fez exame e não comprou":** cruza `Product.isEyeExam=true` (já existe) com ausência de venda de armação/lente em janela. Novo valor em `CustomerSegment` (padrão já existe com `CONTACT_LENS_BUYER`).

### 🔵 SPRINT 5+ (longo) — Retenção como campanha do dono

**#11 — Recompra por ciclo de vida** (renovação, lente de contato, sazonal) como **campanha que o DONO dispara**, não fila diária. **Opt-out registrado + linguagem "revisão" (não saúde)**. Reusa `CustomerSegment.CONTACT_LENS_BUYER` (já existe); falta gerador popular + "duração da caixa" no Product para precisão.
**#12 — Resumo de dono num print** ("hoje: 12 conversas, 8 respondidas, 3 sem resposta +3h, 1 reclamação").
**#13 — CTWA real** (se migrar para WhatsApp Cloud API) → ROI confiável por anúncio. Projeto grande, muda infra.

---

## 6. Migrações necessárias (todas aditivas)

| # | Migração | Campo/Enum |
|---|---|---|
| 1 | opcional pequena | `ServiceOrder.snoozedUntil DateTime?` (ou `customerNotifiedAt`) |
| 2,3,4,5,6,7 | nenhuma | reusam campos/enum existentes |
| 8 | sim | enum `LostReasonCategory` + `Lead.lostReasonCategory` |
| 9 | sim | valor `PAID_TRAFFIC` em `LeadFunnelSource` (+ campos de referral opcionais) |
| 10 | pequena | novo valor em `CustomerSegment` |
| 11 | condicional | `Product.contactLensSupplyDays Int?` (precisão da recompra de LC) |

**Nota de deploy:** o build da Vercel NÃO roda `migrate deploy` — migrações são aplicadas manualmente no Neon (snapshot antes), no padrão do projeto.

## 7. O que fica FORA (e por quê)

- Gamificação individual — sem autor rastreável no WhatsApp compartilhado.
- "Dono fixo" de card — vira lock social leve; não gestão de equipe.
- ROI exato por anúncio agora — sem Cloud API/CTWA, número falso perigoso.
- Aniversário / sazonal na fila de venda — não vende óculos; é campanha do dono, não tarefa contínua.
- Crediário a vencer — é **cobrança** (outra cabeça), separar da fila de venda.

## 8. Pré-requisitos a checar antes de comprometer prazo

- **#9:** o payload da Evolution entrega `referral` (origem de anúncio)? Checar `src/lib/validations/whatsapp-inbound.ts` + webhook.
- **#11:** o cadastro de produto tem como saber a "duração da caixa" de lente de contato? Se não, recompra usa heurística fixa.
- **#7:** qualidade do preenchimento de `Sale.leadId` em produção (best-effort por customerId) — falso-negativo possível para leads sem `customerId`.

## 9. Primeira entrega recomendada

**OS Pronta Parada (#1) + `<WhatsAppButton>` (#2)** — aterrados em dados que já existem, esforço baixo, "dinheiro que já é seu" com resultado visível na 1ª semana. Prova o valor antes de investir no resto.
