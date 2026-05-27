-- Q7.2 P2-10 (cont.): renomeia índices das tabelas com @@map pra bater
-- com a convenção que o Prisma gera (snake_case do @@map prefix).

ALTER INDEX "BranchStock_branchId_quantity_idx"           RENAME TO "branch_stocks_branch_id_quantity_idx";
ALTER INDEX "CustomerReminder_status_scheduledFor_idx"    RENAME TO "customer_reminders_status_scheduledFor_idx";
ALTER INDEX "EmailQueue_status_createdAt_idx"             RENAME TO "email_queue_status_createdAt_idx";
