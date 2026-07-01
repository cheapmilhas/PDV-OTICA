/**
 * Backfill dos nomes de contato CORROMPIDOS pelo bug do pushName em outbound.
 *
 * BUG (corrigido em whatsapp-inbound.ts): o pushName do payload de mensagens
 * fromMe (outbound) é o nome do DONO da instância, não do cliente. O persist
 * sobrescrevia `contactName` a cada mensagem → conversas cujo a ÚLTIMA msg foi
 * outbound ficaram com o nome do dono. Resultado real: 14 números distintos
 * exibidos como "Matheus Rebouças".
 *
 * ESTE SCRIPT conserta as linhas já corrompidas. GUARDA (near-zero falso-positivo,
 * do architect): só toca conversas onde
 *   contactName == OWNER_NAME  E  a última mensagem é OUTBOUND  (a assinatura exata
 *   da corrupção). Uma conversa que se chama assim mas cuja última msg é INBOUND é
 *   ou um cliente genuíno ou já se auto-curou — NÃO toca.
 * RECUPERAÇÃO: p/ cada corrompida, tenta o nome REAL via Customer (match por
 *   telefone, DDD+8díg). Achou → usa o nome do Customer. Não achou → null (o inbox
 *   cai p/ o número — honesto, melhor que um nome errado). O nome original NÃO é
 *   recuperável do banco (pushName não é persistido por mensagem).
 *
 * MODOS: dry-run (padrão) | --apply. Multi-tenant: escopado por --company.
 *
 * Uso:
 *   npx tsx scripts/backfill-conversation-contactname.ts --owner "Matheus Rebouças" --company <id>
 *   npx tsx scripts/backfill-conversation-contactname.ts --owner "Matheus Rebouças" --company <id> --apply
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const OWNER = arg("--owner");
const COMPANY = arg("--company");

async function main() {
  if (!OWNER || !COMPANY) {
    console.error("Faltam --owner \"<nome>\" e --company <id>.");
    process.exit(1);
  }
  console.log(`\n=== BACKFILL contactName corrompido — ${APPLY ? "APPLY" : "DRY-RUN"} ===`);
  console.log(`owner="${OWNER}" company=${COMPANY}\n`);

  // Candidatas: nome EXATO do dono, na empresa.
  const convs = await prisma.whatsappConversation.findMany({
    where: { companyId: COMPANY, contactName: OWNER },
    select: { id: true, contactNumber: true },
  });

  let fixedWithCustomer = 0, fixedToNull = 0, skippedInbound = 0;
  for (const c of convs) {
    // GUARDA: última mensagem tem que ser OUTBOUND (assinatura da corrupção).
    const last = await prisma.whatsappMessage.findFirst({
      where: { conversationId: c.id },
      orderBy: { receivedAt: "desc" },
      select: { direction: true },
    });
    if (last?.direction !== "outbound") { skippedInbound++; continue; }

    // RECUPERAÇÃO: nome real via Customer (match por telefone, últimos 8 dígitos).
    const last8 = c.contactNumber.replace(/\D/g, "").slice(-8);
    const cust = last8
      ? await prisma.customer.findFirst({
          where: { companyId: COMPANY, phone: { contains: last8 } },
          select: { name: true },
        })
      : null;
    const newName = cust?.name ?? null; // null → inbox cai p/ o número

    const maskedNum = c.contactNumber.slice(0, 4) + "***" + c.contactNumber.slice(-3);
    if (newName) fixedWithCustomer++; else fixedToNull++;
    if (APPLY) {
      await prisma.whatsappConversation.update({ where: { id: c.id }, data: { contactName: newName } });
    } else {
      console.log(`  [fix] ${maskedNum} → ${newName ? `"${newName}" (Customer)` : "null (mostra número)"}`);
    }
  }

  console.log(`\nResumo: ${convs.length} c/ nome do dono | recuperadas via Customer=${fixedWithCustomer} | → número=${fixedToNull} | puladas (última msg inbound, não corrompida)=${skippedInbound}`);
  console.log(APPLY ? "APLICADO." : "DRY-RUN — nada escrito. Rode com --apply após conferir.\n");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
