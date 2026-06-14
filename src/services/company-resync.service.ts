import { prisma } from "@/lib/prisma";
import {
  setupCompanyFinance,
  CHART_OF_ACCOUNTS_SEED,
  FINANCE_ACCOUNTS_SEED,
} from "@/services/finance-setup.service";
import { DEFAULT_TEMPLATES } from "@/services/reconciliation-template.service";
import { DEFAULT_MESSAGES } from "@/lib/default-messages";
import {
  classifyMessageValue,
  HISTORICAL_DEFAULTS,
  MESSAGE_FIELD_BY_KEY,
  type MessageKey,
} from "@/lib/default-messages-history";
import { getAutoSyncConfig } from "@/services/auto-sync-config.service";
import { ensureDefaultStages } from "@/services/lead-stage.service";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "company-resync" });

export interface ResyncOptions {
  actorType: "ADMIN_USER" | "SYSTEM";
  actorId?: string | null;
  actorEmail?: string | null;
  dryRun?: boolean;
}

// Type alias (e não interface) de propósito: alias ganha index signature implícita,
// o que permite usá-lo direto no metadata Json do GlobalAudit sem cast.
type FinanceCounts = {
  chartOfAccounts: number;
  financeAccounts: number;
  reconciliationTemplates: number;
};

export interface ResyncResult {
  companyId: string;
  companyName: string;
  changed: boolean;
  dryRun: boolean;
  before: FinanceCounts;
  after: FinanceCounts;
  created: FinanceCounts;
  messages: { filled: MessageKey[]; updated: MessageKey[] };
}

async function countFinance(companyId: string): Promise<FinanceCounts> {
  const [chartOfAccounts, financeAccounts, reconciliationTemplates] = await Promise.all([
    prisma.chartOfAccounts.count({ where: { companyId } }),
    prisma.financeAccount.count({ where: { companyId } }),
    prisma.reconciliationTemplate.count({ where: { companyId } }),
  ]);
  return { chartOfAccounts, financeAccounts, reconciliationTemplates };
}

/** Dry-run do financeiro: quantos defaults FALTAM, comparando com os seeds (sem escrever). */
async function diffFinanceDefaults(companyId: string): Promise<FinanceCounts> {
  const [charts, accounts, templates] = await Promise.all([
    prisma.chartOfAccounts.findMany({ where: { companyId }, select: { code: true } }),
    prisma.financeAccount.findMany({ where: { companyId }, select: { name: true } }),
    prisma.reconciliationTemplate.findMany({ where: { companyId }, select: { name: true } }),
  ]);
  const codes = new Set(charts.map((c) => c.code));
  const names = new Set(accounts.map((a) => a.name));
  const tnames = new Set(templates.map((t) => t.name));
  return {
    chartOfAccounts: CHART_OF_ACCOUNTS_SEED.filter((s) => !codes.has(s.code)).length,
    financeAccounts: FINANCE_ACCOUNTS_SEED.filter((s) => !names.has(s.name)).length,
    reconciliationTemplates: DEFAULT_TEMPLATES.filter((t) => !tnames.has(t.name)).length,
  };
}

/** Mensagens (B2.1): preenche NULL, atualiza default-antigo-intacto, NUNCA toca personalização. */
async function syncMessages(
  companyId: string,
  dryRun: boolean
): Promise<{ filled: MessageKey[]; updated: MessageKey[] }> {
  const keys = Object.keys(MESSAGE_FIELD_BY_KEY) as MessageKey[];
  const settings = await prisma.companySettings.findUnique({ where: { companyId } });

  if (!settings) {
    if (!dryRun) {
      await prisma.companySettings.create({
        data: {
          companyId,
          messageThankYou: DEFAULT_MESSAGES.thankYou,
          messageQuote: DEFAULT_MESSAGES.quote,
          messageReminder: DEFAULT_MESSAGES.reminder,
          messageBirthday: DEFAULT_MESSAGES.birthday,
        },
      });
    }
    return { filled: keys, updated: [] };
  }

  const filled: MessageKey[] = [];
  const updated: MessageKey[] = [];
  const patch: Record<string, string> = {};

  for (const key of keys) {
    const field = MESSAGE_FIELD_BY_KEY[key];
    // Passa o histórico explicitamente (em vez do default do parâmetro) para a
    // dependência ficar visível e mockável nos testes.
    const cls = classifyMessageValue(
      key,
      (settings as Record<string, unknown>)[field] as string | null,
      HISTORICAL_DEFAULTS
    );
    if (cls === "missing") {
      patch[field] = DEFAULT_MESSAGES[key];
      filled.push(key);
    } else if (cls === "stale-default") {
      patch[field] = DEFAULT_MESSAGES[key];
      updated.push(key);
    }
  }

  if (!dryRun && Object.keys(patch).length > 0) {
    await prisma.companySettings.update({ where: { companyId }, data: patch });
  }
  return { filled, updated };
}

/**
 * Re-sincroniza UMA empresa ao padrão atual do sistema. Aditivo e idempotente:
 * só cria/preenche o que falta; nunca apaga dados, mexe em saldos ou sobrescreve
 * personalização. dryRun calcula e reporta sem gravar (exceto a auditoria, que É
 * o relatório da simulação). Retorna null se a empresa não existir.
 */
export async function resyncCompanySetup(
  companyId: string,
  opts: ResyncOptions
): Promise<ResyncResult | null> {
  const dryRun = opts.dryRun ?? false;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) return null;

  let before: FinanceCounts;
  let after: FinanceCounts;
  let created: FinanceCounts;

  if (dryRun) {
    before = await countFinance(companyId);
    created = await diffFinanceDefaults(companyId);
    after = {
      chartOfAccounts: before.chartOfAccounts + created.chartOfAccounts,
      financeAccounts: before.financeAccounts + created.financeAccounts,
      reconciliationTemplates: before.reconciliationTemplates + created.reconciliationTemplates,
    };
  } else {
    const branch = await prisma.branch.findFirst({
      where: { companyId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    before = await countFinance(companyId);
    await prisma.$transaction(async (tx) => {
      // Regra de negócio aprovada pelo dono: o resync "só ADICIONA o que falta;
      // respeita 100% o que a empresa editou" — por isso additiveOnly.
      await setupCompanyFinance(tx, companyId, branch?.id, { additiveOnly: true });
      // Seed do funil de leads: aditivo + idempotente (no-op se já há etapas).
      await ensureDefaultStages(companyId, tx);
    });
    after = await countFinance(companyId);
    created = {
      chartOfAccounts: after.chartOfAccounts - before.chartOfAccounts,
      financeAccounts: after.financeAccounts - before.financeAccounts,
      reconciliationTemplates: after.reconciliationTemplates - before.reconciliationTemplates,
    };
  }

  const messages = await syncMessages(companyId, dryRun);
  const changed =
    created.chartOfAccounts + created.financeAccounts + created.reconciliationTemplates > 0 ||
    messages.filled.length > 0 ||
    messages.updated.length > 0;

  if (changed) {
    await prisma.globalAudit.create({
      data: {
        actorType: opts.actorType,
        // actorId é FK para AdminUser — DEVE ser null quando SYSTEM.
        actorId: opts.actorType === "SYSTEM" ? null : (opts.actorId ?? null),
        companyId,
        action: opts.actorType === "SYSTEM" ? "COMPANY_AUTO_SYNCED" : "COMPANY_RESYNCED",
        metadata: {
          before,
          after,
          created,
          messages,
          dryRun,
          ...(opts.actorEmail ? { adminEmail: opts.actorEmail } : {}),
        },
      },
    });
  }

  return { companyId, companyName: company.name, changed, dryRun, before, after, created, messages };
}

// `type` (não `interface`): aliases de objeto ganham index signature implícita,
// o que torna SyncAllResult atribuível ao tipo Json do Prisma sem cast.
export type SyncAllResult = {
  skipped: boolean;
  dryRun?: boolean;
  total?: number;
  changed?: number;
  unchanged?: number;
  errors?: number;
};

/**
 * Orquestrador do cron: sincroniza TODAS as empresas ativas, isolando falhas
 * (uma empresa com erro não derruba as outras). Lê o AutoSyncConfig:
 * desligado → no-op; dryRun → só simula/reporta.
 */
export async function syncAllCompanies(): Promise<SyncAllResult> {
  const config = await getAutoSyncConfig();
  if (!config.isEnabled) {
    log.info("Auto-sync desligado — no-op");
    return { skipped: true };
  }

  const companies = await prisma.company.findMany({
    where: {
      isBlocked: false,
      subscriptions: { some: { status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } } },
    },
    select: { id: true },
  });

  let changed = 0;
  let unchanged = 0;
  let errors = 0;

  for (const company of companies) {
    try {
      const r = await resyncCompanySetup(company.id, {
        actorType: "SYSTEM",
        dryRun: config.dryRun,
      });
      if (r?.changed) changed++;
      else unchanged++;
    } catch (error) {
      errors++;
      log.error("Auto-sync falhou para empresa (isolado, segue para a próxima)", {
        companyId: company.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary: SyncAllResult = {
    skipped: false,
    dryRun: config.dryRun,
    total: companies.length,
    changed,
    unchanged,
    errors,
  };

  await prisma.autoSyncConfig.update({
    where: { id: "singleton" },
    data: { lastRunAt: new Date(), lastRunSummary: summary },
  });

  return summary;
}
