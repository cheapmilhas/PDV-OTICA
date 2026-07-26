import { prisma } from "@/lib/prisma";

/**
 * Saúde da Federação (N2) — estado do canal Vis↔Domus.
 *
 * O canal é assíncrono e composto por quatro filas independentes drenadas por
 * crons. Quando uma trava, ninguém percebe: o provisionamento de uma clínica
 * fica pendurado, um entitlement não chega, uma troca de plano cobra e não
 * aplica. Hoje só o worker sabe — esta tela torna isso visível.
 *
 * A leitura é toda por CONTAGEM/agregado. Nenhum dado clínico atravessa: o Vis
 * não tem PHI e não é aqui que vai passar a ter.
 */

/** Idade a partir da qual um item parado deixa de ser normal e vira sintoma. */
const ATRASO_ALERTA_MS = 30 * 60 * 1000; // 30 min


export type FilaSeveridade = "ok" | "atencao" | "critico";

export interface FilaSaude {
  chave: string;
  titulo: string;
  /** O que essa fila faz, em linguagem de quem opera — não de quem codou. */
  descricao: string;
  pendentes: number;
  /** Pendentes que já passaram do prazo aceitável. */
  atrasados: number;
  /** Falhas terminais: não serão reprocessadas sozinhas. */
  travados: number;
  /** Item pendente mais antigo, para dimensionar o atraso. */
  maisAntigoEm: Date | null;
  severidade: FilaSeveridade;
}

export interface FederationHealth {
  filas: FilaSaude[];
  /** Operações de troca de plano que exigem intervenção humana. */
  planosEmRisco: {
    cobradoSemAplicar: number;
    revisaoManual: number;
    falhas: number;
    /** Sagas paradas em estado intermediário além do prazo. */
    presas: number;
  };
  /** Pior severidade entre as filas — o resumo do topo da tela. */
  geral: FilaSeveridade;
  geradoEm: Date;
}

/**
 * Severidade de uma fila com retry: travado (falha terminal) domina atrasado.
 *
 * A distinção importa para quem opera: ATRASADO tende a se resolver sozinho no
 * próximo tick do cron; TRAVADO esgotou as tentativas e só sai com intervenção.
 * Tratar os dois igual faria o operador ignorar os dois.
 */
export function severidadeDaFila(atrasados: number, travados: number): FilaSeveridade {
  if (travados > 0) return "critico";
  if (atrasados > 0) return "atencao";
  return "ok";
}

/**
 * Resumo do topo da tela. Cliente COBRADO SEM RECEBER o plano é o pior estado
 * do sistema — domina o resumo mesmo com todas as filas limpas, porque é
 * dinheiro do cliente sem contrapartida.
 */
export function severidadeGeral(
  filas: Pick<FilaSaude, "severidade">[],
  planos: FederationHealth["planosEmRisco"],
): FilaSeveridade {
  if (planos.cobradoSemAplicar > 0 || planos.revisaoManual > 0) return "critico";
  if (filas.some((f) => f.severidade === "critico")) return "critico";
  // Saga travada no meio ainda não é dano consumado, mas pode virar — sobe
  // como atenção em vez de ficar só como número na tela.
  if (planos.presas > 0) return "atencao";
  if (filas.some((f) => f.severidade === "atencao")) return "atencao";
  return "ok";
}

/**
 * Fotografia do canal. As consultas correm em paralelo, mas a página espera a
 * MAIS LENTA — são todas agregados sobre tabelas de fila, que por natureza são
 * pequenas (item drenado sai; só o terminal fica).
 */
export async function getFederationHealth(agora = new Date()): Promise<FederationHealth> {
  const limite = new Date(agora.getTime() - ATRASO_ALERTA_MS);

  const [
    provPendentes,
    provAtrasados,
    provTravados,
    provMaisAntigo,
    entPendentes,
    revPendentes,
    planCobradoSemAplicar,
    planRevisaoManual,
    planFalhas,
    planPresas,
  ] = await Promise.all([
    // ⚠️ Linhas TERMINAIS permanecem na tabela (o worker as ignora de propósito,
    // para o super admin inspecionar). Por isso todas as contagens de "fila
    // viva" excluem `failureReason`: sem isso uma falha terminal apareceria
    // como pendente E como atrasada, inflando dois números com o mesmo item.
    prisma.provisioningOutbox.count({ where: { failureReason: null } }),
    prisma.provisioningOutbox.count({
      where: { failureReason: null, nextAttemptAt: { lt: limite } },
    }),
    // `failureReason` preenchido = falha TERMINAL: ou o erro foi definitivo, ou
    // esgotou as 10 tentativas. Verificado em provisioning-outbox.service.ts —
    // é o mesmo critério que o worker usa para NÃO reprocessar a linha.
    prisma.provisioningOutbox.count({ where: { failureReason: { not: null } } }),
    prisma.provisioningOutbox.findFirst({
      where: { failureReason: null },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.entitlementOutbox.count(),
    prisma.entitlementRevocationOutbox.count(),
    prisma.domusPlanChangeOp.count({ where: { state: "CHARGED_NOT_APPLIED" } }),
    prisma.domusPlanChangeOp.count({ where: { state: "MANUAL_REVIEW" } }),
    prisma.domusPlanChangeOp.count({ where: { state: "FAILED" } }),
    // Saga parada NO MEIO: já começou, não terminou, e não está num estado
    // terminal que alguém iria olhar. É o caso mais perigoso depois do
    // "cobrado sem aplicar" — e sem isto ficaria invisível no painel.
    prisma.domusPlanChangeOp.count({
      where: {
        state: { in: ["RECEIVED", "BILLING_REQUESTED", "BILLING_CONFIRMED", "LOCAL_APPLIED"] },
        updatedAt: { lt: limite },
      },
    }),
  ]);

  const filas: FilaSaude[] = [
    {
      chave: "provisionamento",
      titulo: "Provisionamento de clínicas",
      descricao: "Cria a clínica no Domus quando um cliente medical é cadastrado.",
      pendentes: provPendentes,
      atrasados: provAtrasados,
      travados: provTravados,
      maisAntigoEm: provMaisAntigo?.createdAt ?? null,
      severidade: severidadeDaFila(provAtrasados, provTravados),
    },
    {
      chave: "entitlements",
      titulo: "Publicação de permissões",
      descricao: "Informa ao Domus o que cada clínica pode usar (plano, limites, bloqueio).",
      pendentes: entPendentes,
      // Estas duas filas não guardam tentativa nem falha: são chaveadas por
      // empresa e o worker regrava. Só o volume acumulado é sintoma, e não há
      // como distinguir "atrasado" de "recém-enfileirado" sem inventar dado.
      atrasados: 0,
      travados: 0,
      maisAntigoEm: null,
      severidade: entPendentes > 0 ? "atencao" : "ok",
    },
    {
      chave: "revogacoes",
      titulo: "Revogação de acesso",
      descricao: "Corta o acesso no Domus quando um cliente é removido ou desvinculado.",
      pendentes: revPendentes,
      atrasados: 0,
      travados: 0,
      maisAntigoEm: null,
      // Revogação pendente é acesso que DEVERIA ter sido cortado e não foi —
      // por isso pesa mais que uma publicação comum atrasada.
      severidade: revPendentes > 0 ? "critico" : "ok",
    },
  ];

  const planosEmRisco = {
    cobradoSemAplicar: planCobradoSemAplicar,
    revisaoManual: planRevisaoManual,
    falhas: planFalhas,
    presas: planPresas,
  };

  return {
    filas,
    planosEmRisco,
    geral: severidadeGeral(filas, planosEmRisco),
    geradoEm: agora,
  };
}

export const FEDERATION_HEALTH_CONSTANTS = { ATRASO_ALERTA_MS } as const;
