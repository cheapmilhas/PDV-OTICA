import { createHmac, randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { logger } from "@/lib/logger";
import { postSupportRedeem } from "@/lib/vis-support-client";
import { prisma } from "@/lib/prisma";

const log = logger.child({ route: "admin/companies/[id]/support-redeem" });

/**
 * POST /api/admin/companies/[id]/support-redeem — F3.6.
 *
 * O operador Vis cola aqui o código que o CLIENTE gerou no Domus. Trocamos o
 * código por uma sessão de suporte somente-leitura, e o Domus devolve a URL de
 * ativação que o operador abre no browser.
 *
 * Invariantes que esta borda sustenta:
 *  - o `visOperatorRef` é derivado do admin AUTENTICADO, nunca aceito do corpo:
 *    é a referência opaca que aparece na trilha que o CLIENTE lê, então precisa
 *    identificar de verdade quem pediu o acesso;
 *  - é OPACO: mandamos um hash curto do id do admin, não o id/e-mail dele (o
 *    banco clínico não deve guardar identidade interna do Vis);
 *  - o `supportGrantId` (UUID) nasce AQUI e correlaciona as duas trilhas;
 *  - `requireCompanyScope` garante que o admin só resgata código de empresa que
 *    ele pode ver — o clinicId sai do cadastro, não do input do operador.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: companyId } = await params;

  const scoped = await requireCompanyScope(admin.id, companyId);
  if (!scoped) {
    return NextResponse.json(
      { error: "Sem permissão para esta empresa" },
      { status: 403 },
    );
  }

  let code: string;
  try {
    const body = (await request.json()) as { code?: unknown };
    if (typeof body.code !== "string" || !body.code.trim()) {
      return NextResponse.json({ error: "Informe o código." }, { status: 400 });
    }
    code = body.code.trim();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  // A clínica alvo vem do CADASTRO (não do operador). Sem clínica provisionada
  // não há o que acessar.
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { domusClinicId: true, platformProduct: true, name: true },
  });
  if (!company?.domusClinicId) {
    return NextResponse.json(
      { error: "Esta empresa ainda não tem clínica provisionada no Medical." },
      { status: 422 },
    );
  }

  const supportGrantId = randomUUID();
  const result = await postSupportRedeem({
    code,
    clinicId: company.domusClinicId,
    supportGrantId,
    visOperatorRef: opaqueOperatorRef(admin.id),
  });

  if (result.kind === "transient") {
    // Nada foi consumido do lado do Domus — o código do cliente segue válido.
    log.error("Canal de suporte indisponível", {
      companyId,
      reason: result.reason,
    });
    return NextResponse.json(
      {
        error:
          "Não foi possível falar com o sistema Medical. O código do cliente continua válido — tente de novo.",
      },
      { status: 503 },
    );
  }

  if (result.kind === "activation_unavailable") {
    // O código JÁ foi queimado mas não saiu link. Pedir outro código ao cliente
    // é o conselho ERRADO aqui: o grant existe e é reemitível. Logamos o grantId
    // (do Domus) para o suporte de engenharia conseguir reemitir.
    log.error("Grant criado sem link de ativação", {
      companyId,
      supportGrantId,
      domusGrantId: result.grantId,
    });
    await auditSupportAttempt({
      adminId: admin.id,
      adminEmail: admin.email,
      companyId,
      supportGrantId,
      action: "SUPPORT_ACCESS_STUCK",
      detail: `Código consumido sem link (grant Domus: ${result.grantId ?? "?"})`,
    });
    return NextResponse.json(
      {
        error:
          "O código foi aceito, mas o sistema Medical não emitiu o link de acesso. NÃO peça outro código ao cliente — acione a engenharia informando o protocolo.",
        data: { supportGrantId },
      },
      { status: 502 },
    );
  }

  if (result.kind === "rejected") {
    log.warn("Resgate de código recusado", {
      companyId,
      status: result.status,
      error: result.error,
    });
    await auditSupportAttempt({
      adminId: admin.id,
      adminEmail: admin.email,
      companyId,
      supportGrantId,
      action: "SUPPORT_ACCESS_DENIED",
      detail: `${result.status} ${result.error}`,
    });
    return NextResponse.json(
      { error: rejectionMessage(result.status, result.error) },
      { status: result.status === 429 ? 429 : 409 },
    );
  }

  log.info("Acesso de suporte concedido", {
    companyId,
    supportGrantId,
    domusGrantId: result.grantId,
  });
  await auditSupportAttempt({
    adminId: admin.id,
    adminEmail: admin.email,
    companyId,
    supportGrantId,
    action: "SUPPORT_ACCESS_GRANTED",
    detail: `Grant Domus: ${result.grantId || "?"}`,
  });
  return NextResponse.json({
    success: true,
    data: {
      supportGrantId,
      magicUrl: result.magicUrl,
      expiresAt: result.expiresAt,
      clinicName: company.name,
    },
  });
}

/**
 * Registra a TENTATIVA de acesso de suporte na trilha do Vis.
 *
 * Grava o desfecho — concedido, recusado ou queimado — porque "quem TENTOU
 * entrar no dado clínico" é tão auditável quanto "quem entrou": uma sequência de
 * recusas é o sinal de operador tateando código, e some se só logarmos sucesso.
 *
 * O `supportGrantId` é a chave que amarra esta linha à trilha do Domus (bancos
 * separados, sem FK entre eles) — é por ele que um humano investiga os dois
 * lados. Nunca gravamos o CÓDIGO do cliente: ele é credencial.
 *
 * NÃO é fail-closed (diferente da trilha do Domus, que é a autoritativa sobre o
 * PHI): aqui o acesso já foi decidido pelo Domus, e derrubar um acesso legítimo
 * porque o log do Vis falhou trocaria um problema de observabilidade por um de
 * disponibilidade no meio de um atendimento.
 */
async function auditSupportAttempt(params: {
  adminId: string;
  adminEmail: string;
  companyId: string;
  supportGrantId: string;
  action: "SUPPORT_ACCESS_GRANTED" | "SUPPORT_ACCESS_DENIED" | "SUPPORT_ACCESS_STUCK";
  detail?: string;
}): Promise<void> {
  try {
    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: params.adminId,
        companyId: params.companyId,
        action: params.action,
        metadata: {
          supportGrantId: params.supportGrantId,
          adminEmail: params.adminEmail,
          ...(params.detail ? { detail: params.detail } : {}),
        },
      },
    });
  } catch (err) {
    log.error("Falha ao gravar auditoria do acesso de suporte", {
      companyId: params.companyId,
      supportGrantId: params.supportGrantId,
      action: params.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Traduz a recusa do Domus em orientação ACIONÁVEL. O critério é: o código
 * single-use do cliente foi consumido do outro lado?
 *
 *  - 401/403/413: a chamada morreu ANTES de olhar o código (assinatura, guard de
 *    host, corpo). O código do cliente CONTINUA VÁLIDO — mandar pedir outro faria
 *    o cliente refazer o processo à toa, e não resolveria nada, porque o defeito
 *    é de configuração do canal, não do código.
 *  - 429: rate limit por clínica, também antes do resgate. É espera, não código
 *    novo.
 *  - 400/409: aí sim o código é inválido/expirado/já usado (o Domus responde
 *    genérico de propósito, sem dizer qual dos três).
 */
function rejectionMessage(status: number, error: string): string {
  if (status === 429) {
    return "Muitas tentativas para esta clínica. Aguarde alguns minutos e tente de novo — o código do cliente continua válido.";
  }
  if (status === 401 || status === 403 || status === 413) {
    return "Falha na comunicação segura com o sistema Medical (configuração do canal). O código do cliente NÃO foi usado — acione a engenharia em vez de pedir um código novo.";
  }
  return "Código inválido, expirado ou já utilizado. Peça um novo ao cliente.";
}

/**
 * Referência OPACA e ESTÁVEL do operador. O Domus grava isto na trilha que o
 * cliente lê, então: (a) não pode vazar id/e-mail interno do Vis; (b) tem que ser
 * o mesmo valor para o mesmo operador, senão a trilha não permite dizer "foi a
 * mesma pessoa das outras vezes".
 */
function opaqueOperatorRef(adminId: string): string {
  // HMAC-SHA-256 truncado a 128 bits (32 hex). Um hash de 32 bits (multiply-31)
  // seria curto demais para sustentar ATRIBUIÇÃO: colisão entre dois operadores
  // é plausível no aniversário, e a trilha diria "foi a mesma pessoa" quando não
  // foi. Com segredo, também não dá para varrer o espaço de IDs e desanonimizar
  // quem acessou a clínica.
  //
  // A chave é o segredo do canal de suporte: quem já o tem consegue chamar o
  // Domus de qualquer jeito, então reusá-lo aqui não amplia o raio do vazamento.
  // Sem segredo configurado, o pseudônimo não é derivável — o resgate falha
  // antes disso (postSupportRedeem retorna "transient"), então o fallback só
  // existe para não quebrar o tipo.
  const secret = process.env.VIS_DOMUS_SUPPORT_SECRET ?? "";
  const digest = createHmac("sha256", secret)
    .update(`vis-operator:${adminId}`)
    .digest("hex")
    .slice(0, 32);
  return `vis-op-${digest}`;
}
