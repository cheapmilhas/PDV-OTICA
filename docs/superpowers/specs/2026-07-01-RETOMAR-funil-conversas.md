# RETOMAR AQUI — Melhorias Funil/Conversas (próxima sessão)

**Data:** 2026-07-01. Ler junto com:
- `docs/superpowers/specs/2026-07-01-funil-conversas-melhorias-design.md` (plano 5 sprints, o design)
- `docs/superpowers/specs/2026-07-01-sprint1-os-parada-plano.md` (plano detalhado do Sprint 1)

## ✅ O que JÁ está em produção (feito nesta sessão)

**Bugs corrigidos e deployados:**
- `#3` (`0e9dfe7`): leads sem filial não somem mais ao filtrar por filial.
- `#4` (`cd48ae1`): card não fica preso em "Novo" — resposta da ótica re-avalia o funil (flag `needsFunnelEval`).

**Sprint 1 (3 fases) — TODAS em produção:**
- Fase 1 `#5` (`d90b625`): fila **"Prontos pra avisar"** na tela de OS (migração `notifySnoozedUntil` aplicada no Neon).
- Fase 2+3 `#6` (`d80a49d`): `<WhatsAppButton>` reutilizável + **IA copiloto no inbox** (resumo + rascunho copiável). Validado em prod (rota `/copilot` respondeu 200 com resumo+rascunho reais).

Método usado em tudo: TDD + revisão adversarial (agentes) + migração no Neon ANTES do deploy + smoke em produção.

## 🔜 PRÓXIMOS SPRINTS (do plano, priorizados por conversão)

### 🟢 SPRINT 2 — Fila única + placar (curto prazo)
- **#4 Fila de Hoje:** UMA tela priorizada, teto ≤8-10, agregando SLA (`lead-sla.ts`) + needs-reply (`lead-needs-reply.service.ts`) + atenção (`lead-needs-attention.ts`) + OS parada. View computada (novo service agregador). Sem migração.
- **#5 Laço fechado pelo fluxo real:** "respondido?" derivado de outbound existente (reusa o mecanismo do fix `needsFunnelEval`). Semáforo = tempo sem resposta.
- **#6 Placar de conversão por origem + período:** `getLeadStats` (`lead.service.ts:509`) já calcula; falta só filtro de data (`Lead.createdAt` já existe). Aditivo.

### 🟡 SPRINT 3-4 — Recuperação + tráfego (médio prazo)
- **#7 Lista de não-convertidos** ("clientes esfriando"): `sales: { none: {} }` + `stage.isWon=false` (reusa `Sale.leadId`). Filtros origem/período/motivo.
- **#8 Motivo de perda estruturado:** enum `LostReasonCategory` + campo em `Lead` (migração). Troca o Textarea livre em `lost-reason-modal.tsx` por botões → reoferta por motivo.
- **#9 Detectar tráfego pago:** mensagem-isca + IA backup, rotulado "origem aproximada" + taxa de captura. Novo valor `PAID_TRAFFIC` em `LeadFunnelSource` (migração). ⚠️ CONFIRMADO: Evolution NÃO manda `referral` do Meta → atribuição é sinal grosso, NUNCA ROI.
- **#10 Fez exame e não comprou:** cruza `Product.isEyeExam=true` (já existe) com ausência de venda de armação/lente em janela. Novo valor em `CustomerSegment` (já tem `CONTACT_LENS_BUYER` de modelo).

### 🔵 SPRINT 5+ — Retenção como campanha do dono (longo prazo)
- **#11 Recompra por ciclo de vida** (renovação de grau, recompra de lente): campanha que o DONO dispara, não fila diária. ⚠️ TRAVAS: opt-out registrado + linguagem "revisão" (NÃO "grau/saúde" — LGPD dado sensível + risco ban do WhatsApp). Falta "duração da caixa" no Product p/ precisão da lente.
- **#12 Resumo de dono num print:** "hoje: 12 conversas, 8 respondidas, 3 sem resposta +3h, 1 reclamação".
- **#13 CTWA real:** só se migrar p/ WhatsApp Cloud API (hoje usa Evolution). Aí sim ROI por anúncio confiável. Projeto grande.

## ❌ DESCARTADO no debate (não reabrir sem motivo novo)
- Gamificação individual (sem autor rastreável no WhatsApp compartilhado).
- "Dono fixo" de card (o dono disse: quer saber conversão, não quem atende — WhatsApp é compartilhado, "quem estiver livre responde").
- ROI exato por anúncio agora (Evolution não dá CTWA).
- Aniversário/crediário na fila de venda (aniversário não vende óculos; crediário é cobrança, separar).

## 🧭 Como o DONO pensa (restrições invioláveis — respeitar sempre)
1. Atendente responde pelo **WhatsApp do celular** — o Vis NÃO é canal de resposta.
2. **IA nunca fala com o cliente** — só organiza/sugere internamente (rascunho que a atendente copia).
3. Recuperação = envio **MANUAL** (sistema dá lista + texto + botão wa.me).
4. WhatsApp **compartilhado**; negócio pequeno; atendente leiga e afogada.
5. Objetivo: **conversão lead→venda**. "Dinheiro que já é seu primeiro" (OS parada, recompra) > placar (vaidade).
6. Nunca depender de botão "já respondi" (apodrece) — derivar do fluxo real de mensagens.

## 📌 Pendências técnicas conhecidas
- `notIn` de OS avisadas em `countProntosAvisar`/`list` pode crescer (dívida a monitorar, não bug hoje).
- Rotacionar `CRON_SECRET` + senha branch Neon `ep-holy-bird` (pendência antiga do dono).

## ▶️ Para retomar na próxima sessão
Diga: **"retomar melhorias do funil, Sprint 2"** — e leia este arquivo + os 2 specs acima. O próximo passo natural é o **placar de conversão por origem+período (#6)** — é o menor esforço (só filtro de data no `getLeadStats`) e entrega o que o dono mais pediu (medir conversão).
