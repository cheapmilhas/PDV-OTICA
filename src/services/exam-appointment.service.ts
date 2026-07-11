import { prisma } from "@/lib/prisma";
import { notFoundError } from "@/lib/error-handler";
import { LEAD_STAGE_KEYS } from "@/lib/lead-stage-keys";
import { logger } from "@/lib/logger";
import { startOfLocalDay, endOfLocalDay } from "@/lib/date-utils";
import type { ExamAppointmentStatus } from "@prisma/client";

const log = logger.child({ service: "exam-appointment" });

export interface CreateExamAppointmentInput {
  leadId: string;
  scheduledAt: Date;
  assignedUserId: string | null;
  note: string | null;
}

/**
 * Cria o agendamento de exame E move o card do lead para o estágio
 * "Exame agendado" (EXAM_SCHEDULED), na MESMA transação. Espelha o padrão de
 * `linkLeadAndMaybeWinInTx` (mover card na tx) e o guard IDOR de `moveLead`.
 *
 * Não move o card se o lead já estiver num estágio terminal (Ganho/Perdido)
 * ou já em "Exame feito" — o agendamento é registrado, mas o funil não
 * retrocede.
 */
export async function createExamAppointment(
  input: CreateExamAppointmentInput,
  companyId: string,
  createdByUserId: string,
) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({
      where: { id: input.leadId, companyId, deletedAt: null },
      select: {
        id: true,
        customerId: true,
        branchId: true,
        stage: { select: { id: true, isWon: true, isLost: true, systemKey: true } },
      },
    });
    if (!lead) throw notFoundError("Lead não encontrado");

    if (input.assignedUserId) {
      const user = await tx.user.findFirst({
        where: { id: input.assignedUserId, companyId },
        select: { id: true },
      });
      if (!user) throw notFoundError("Responsável inválido");
    }

    const appointment = await tx.examAppointment.create({
      data: {
        companyId,
        leadId: lead.id,
        customerId: lead.customerId,
        branchId: lead.branchId,
        assignedUserId: input.assignedUserId,
        scheduledAt: input.scheduledAt,
        note: input.note,
        createdByUserId,
      },
    });

    const terminalOrDone =
      lead.stage.isWon ||
      lead.stage.isLost ||
      lead.stage.systemKey === LEAD_STAGE_KEYS.EXAM_DONE;

    if (!terminalOrDone) {
      const targetStage = await tx.leadStage.findFirst({
        where: { companyId, systemKey: LEAD_STAGE_KEYS.EXAM_SCHEDULED },
        select: { id: true },
      });
      if (targetStage) {
        await tx.lead.updateMany({
          where: { id: lead.id, companyId },
          data: { stageId: targetStage.id, lastActivityAt: new Date() },
        });
      } else {
        log.warn("exam_no_scheduled_stage", { companyId, leadId: lead.id });
      }
    }

    return appointment;
  });
}

export interface UpdateExamAppointmentInput {
  status?: ExamAppointmentStatus;
  scheduledAt?: Date;
}

/**
 * Atualiza status e/ou data do agendamento. Reverse espelhado de
 * `reverseLeadWinForSaleInTx`: cancelar/faltar volta o card para o 1º estágio
 * aberto (menor order, não-terminal) — SÓ se o card ainda está em
 * EXAM_SCHEDULED (se um humano já moveu o card p/ outro lugar, respeita e não
 * mexe). Remarcar a data ou marcar ATTENDED nunca move o card.
 */
export async function updateExamAppointment(
  id: string,
  input: UpdateExamAppointmentInput,
  companyId: string,
) {
  return prisma.$transaction(async (tx) => {
    const appt = await tx.examAppointment.findFirst({
      where: { id, companyId },
      select: { id: true, leadId: true, status: true },
    });
    if (!appt) throw notFoundError("Agendamento não encontrado");

    const updated = await tx.examAppointment.update({
      where: { id: appt.id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
      },
    });

    // Reverse: cancelar/faltar → volta pro 1º aberto SÓ se o card ainda está
    // em EXAM_SCHEDULED. Remarcar (só scheduledAt) e ATTENDED não movem.
    const reverts = input.status === "CANCELLED" || input.status === "NO_SHOW";
    if (reverts) {
      const lead = await tx.lead.findFirst({
        where: { id: appt.leadId, companyId, deletedAt: null },
        select: { id: true, stage: { select: { systemKey: true } } },
      });
      if (lead?.stage.systemKey === LEAD_STAGE_KEYS.EXAM_SCHEDULED) {
        const firstOpen = await tx.leadStage.findFirst({
          where: { companyId, isWon: false, isLost: false },
          orderBy: { order: "asc" },
          select: { id: true },
        });
        if (firstOpen) {
          await tx.lead.updateMany({
            where: { id: lead.id, companyId },
            data: { stageId: firstOpen.id, lastActivityAt: new Date() },
          });
        } else {
          log.warn("exam_revert_no_open_stage", { companyId, leadId: lead.id });
        }
      }
    }

    return updated;
  });
}

/**
 * Agenda-do-dia: lista os agendamentos de exame cuja `scheduledAt` cai dentro
 * do dia LOCAL (BRT), não do dia UTC cru — evita que um exame marcado às 22h
 * BRT (01h UTC do dia seguinte) vaze para a agenda do dia seguinte.
 */
export async function listExamAppointmentsForDay(
  day: Date,
  companyId: string,
  branchId?: string | null,
) {
  const gte = startOfLocalDay(day);
  const lte = endOfLocalDay(day);
  return prisma.examAppointment.findMany({
    where: {
      companyId,
      scheduledAt: { gte, lte },
      ...(branchId ? { branchId } : {}),
    },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      scheduledAt: true,
      status: true,
      note: true,
      lead: { select: { id: true, name: true, phone: true } },
      assignedUser: { select: { id: true, name: true } },
    },
  });
}
