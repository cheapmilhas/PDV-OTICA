# Agenda de Exame de Verdade (ExamAppointment) — Design

**Data:** 2026-07-10 · **Sprint 6** (retomada pós-10/07) · **Origem:** /forja (painel adversarial) → brainstorming.

## Problema

No funil de ótica (Kanban por empresa), a coluna **"Exame agendado"** só enche por **move manual** (arrastar card ou botão no inbox). O dono quer uma **agenda de exame de verdade**: marcar o exame de vista de um lead numa data/hora e o card ir para "Exame agendado" **automaticamente, sem depender de venda**.

O ciclo de fechamento já existe: uma venda de produto `isEyeExam` ligada ao lead move o card para **"Exame feito"** via flag estável `EXAM_DONE` (PR #40, ver `funil-otica-coluna-exame-forja`). Falta o **começo** do ciclo: o agendamento.

## Abordagem escolhida ("C-mínimo")

O painel adversarial matou as 3 abordagens originais (MVP, User-first, Data-first) e produziu uma versão reforjada: um model `ExamAppointment` **enxuto e correto**, sem a engenharia de escala inexistente (N≈13 óticas, 1 ativa, 1 optometrista). Detalhes do painel em `agenda-exame-forja-painel` (memória).

Princípios herdados dos críticos e travados nas decisões do dono:
- **Fuso no schema:** `scheduledAt` é `timestamptz` (a lição do bug de MRR, Sprint 2).
- **Reverse espelhado:** todo auto-move por evento TEM reverse (regra da casa; o bug do reverse ausente do `EXAM_DONE` já mordeu).
- **Reverse pro 1º aberto:** segue o padrão existente `reverseLeadWinForSaleInTx` (volta ao 1º estágio não-terminal), **sem** campo `preExamStageId`.
- **Sem dupla fonte de verdade:** "Exame feito" continua sendo só a venda `isEyeExam`/`EXAM_DONE`.
- **A agenda-do-dia É o lembrete:** sem cron, sem `CustomerReminder` (que exige `customerId` + segmento — inviável para lead que ainda não é cliente).

## 1. Modelo de dados

```prisma
model ExamAppointment {
  id              String   @id @default(cuid())
  companyId       String                              // multi-tenant, NOT NULL
  leadId          String                              // âncora — sempre existe
  customerId      String?                             // preenche se lead já é cliente
  branchId        String?
  assignedUserId  String?                             // optometrista/atendente responsável
  scheduledAt     DateTime @db.Timestamptz            // instante UTC, fuso-safe
  status          ExamAppointmentStatus @default(SCHEDULED)
  note            String?
  createdByUserId String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  company Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  lead    Lead      @relation(fields: [leadId], references: [id], onDelete: Cascade)
  customer Customer? @relation(fields: [customerId], references: [id], onDelete: SetNull)
  branch  Branch?   @relation(fields: [branchId], references: [id], onDelete: SetNull)
  assignedUser User? @relation(fields: [assignedUserId], references: [id], onDelete: SetNull)

  @@index([companyId, scheduledAt])
  @@index([companyId, leadId])
}

enum ExamAppointmentStatus {
  SCHEDULED
  ATTENDED
  NO_SHOW
  CANCELLED
}
```

**Cortado (YAGNI provado no painel):** `preExamStageId`, `durationMin`, status `RESCHEDULED` + self-FK `rescheduledFromId`, `saleId`, `name`/`phone` denormalizados (PII/LGPD), índice único anti-double-booking via SQL cru, os 5 índices extras. Remarcar = editar `scheduledAt` (não gera novo registro).

**Integridade:** `leadId` Cascade (agendamento não faz sentido sem lead; Lead usa soft-delete `deletedAt`, então o cascade físico só ocorre em hard-delete real). Demais FKs `SetNull` (agendamento sobrevive à perda de cliente/filial/responsável).

## 2. Movimento do card (lógica central, transacional)

Sinal **objetivo** (não-IA), espelhando `linkLeadAndMaybeWinInTx` / `reverseLeadWinForSaleInTx`.

- **Criar agendamento (SCHEDULED):** na mesma transação, move o card do lead para o estágio com flag **`EXAM_SCHEDULED`**. Regra **só-avança**: NUNCA move um card que já está em `isWon`, `isLost` ou `EXAM_DONE` (não regride quem fechou).
- **Cancelar (CANCELLED) / Faltar (NO_SHOW):** reverse espelhado — **só** se o card ainda está no estágio `EXAM_SCHEDULED`, volta para o **1º estágio aberto** (menor `order`, não-terminal), igual a `reverseLeadWinForSaleInTx`. Se um humano já moveu o card, respeita e não mexe.
- **Compareceu (ATTENDED):** **não move o card.** "Exame feito" continua exclusivamente pela venda `isEyeExam`/`EXAM_DONE`.
- **Divergência aceita:** se o atendente arrastar o card para fora de "Exame agendado" com o agendamento ainda SCHEDULED, **não reconciliar à força** (não brigar com o usuário). O card exibe o status do agendamento para o buraco ficar visível.

**Flag `EXAM_SCHEDULED`:** nova entrada em `LEAD_STAGE_KEYS` (ao lado de `EXAM_DONE`, `src/lib/lead-stage-keys.ts`). O seed/`ensureOpticalStages` acha o estágio "Exame agendado" por `name` **uma vez** e grava a flag — idempotente por `[companyId, systemKey]` (padrão validado no `EXAM_DONE`; índice único parcial `WHERE systemKey IS NOT NULL` já existe). Localização por `findStageByKey`, nunca por `name` (o `name` é editável).

## 3. UI

**a) Botão "Agendar exame"** — no card do Kanban (`src/components/funil/lead-card.tsx`) e no inbox (`src/components/funil/mover-coluna-inbox.tsx`). Abre um dialog shadcn: **data + hora** (obrigatórios), **responsável** (opcional, dropdown de usuários da ótica), **observação** (opcional). Salvar → cria agendamento + move card. Parte sempre de um lead existente (`leadId` conhecido).

**b) Agenda do dia** — nova **aba "Agenda"** no funil (`/dashboard/funil`, ao lado de Fila de Hoje · Funil · Recuperar · Conversas). Lista vertical mobile-first ordenada por horário (não grid). Abre no hoje; navegação ‹ hoje ›. Cada linha: hora, nome do lead/cliente, telefone, e botões de 1 toque **Compareceu / Faltou**. Filtro por filial (respeitando a filial do atendente). **Esta lista é o lembrete** — sem cron.

**Cortado:** taxa de comparecimento no placar, botão WhatsApp 1-toque, toggle Dia/Semana.

## 4. Endpoints, segurança e testes

**Endpoints** (multi-tenant, guards do padrão da casa):
- `POST /api/exam-appointments` — cria + move card na tx. Body: `{ leadId, scheduledAt, assignedUserId?, note? }`. `companyId` e `createdByUserId` **sempre da sessão** (`getCompanyId`/`getUserId`), nunca do body.
- `PATCH /api/exam-appointments/[id]` — muda status (ATTENDED/NO_SHOW/CANCELLED) ou remarca (`scheduledAt`). Cancelar/faltar dispara o reverse.
- `GET /api/exam-appointments?date=&branchId=` — agenda do dia, escopo de filial.

**Segurança inegociável** (crítico de tenancy — já houve IDOR de leads):
1. `companyId`/`createdByUserId` sempre da sessão, nunca do body.
2. Toda FK recebida (`leadId`, `assignedUserId`) revalidada por `findFirst({ id, companyId })` antes de agir (padrão `moveLead`, `lead.service.ts:220`).
3. Gate de papel: agendar/mudar status exige `leads.edit` (mesma permissão do move de card).
4. GET com escopo de filial (`branchId OR null`); `?branchId` do query nunca sobrepõe a filial da sessão sem checar papel.
5. A IA nunca cria/agenda por conta própria (respeitado — sinal é humano/objetivo).

**Fuso:** janela de "dia" via `startOfLocalDay`/`endOfLocalDay` (BRT); escrita de `scheduledAt` converte "data+hora local do atendente" → UTC no boundary. `@db.Timestamptz` garante o instante absoluto.

**Testes (TDD):**
- Move+reverse na tx: SCHEDULED avança para `EXAM_SCHEDULED`; CANCELLED/NO_SHOW revertem **só** se ainda em `EXAM_SCHEDULED`; ATTENDED não move; não regride `isWon`/`isLost`/`EXAM_DONE`; humano-moveu → respeita.
- Guard IDOR: `leadId`/`assignedUserId` de outra ótica → 404 (não cria, não move card alheio).
- Escopo de filial no GET; `?branchId` não sobrepõe filial da sessão.
- Fuso: agendamento às 22h BRT cai no dia certo (não vaza para o dia seguinte em UTC).
- Seed idempotente da flag `EXAM_SCHEDULED` (roda 2×, não duplica).
- Gate `leads.edit` (papel sem permissão → 403).

**Migração:** aditiva — 1 enum + 1 tabela + FKs. Faseável no deploy (enum commita antes de usar — lição do projeto sobre `ALTER TYPE`). Sem SQL cru (sem índice parcial anti-double-booking).

## Riscos aceitos

1. **status ↔ stageId divergem** se o atendente arrastar o card manual → não reconciliar à força; status visível no card.
2. **Sem anti-double-booking** → aceitável a N=1 optometrista; a agenda-lista deixa conflito visível a olho.
3. **Reverse pro 1º aberto** (não pro estágio exato de origem) → consistente com o resto do funil; na prática o exame é marcado cedo, então "Novo" é próximo do real.

## Predecessores e reuso

- `funil-otica-coluna-exame-forja` (PR #40) — coluna de exame + flag `EXAM_DONE` + move por venda. Este projeto é a evolução cortada de lá.
- Reuso: `linkLeadAndMaybeWinInTx`/`reverseLeadWinForSaleInTx` (`sale-side-effects.service.ts`) padrão de move+reverse; `findStageByKey`/`LEAD_STAGE_KEYS` (`lead-stage-keys.ts`); `moveLead` (`lead.service.ts`) padrão IDOR-safe; `startOfLocalDay`/`endOfLocalDay`/`formatInTimeZone` (fuso).
