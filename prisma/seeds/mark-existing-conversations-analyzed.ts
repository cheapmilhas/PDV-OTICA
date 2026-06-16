/**
 * Marca como analisadas (analyzedAt = agora) as conversas de WhatsApp ainda
 * não analisadas NO MOMENTO de rodar — para o cron de qualificação (Bloco B')
 * NÃO varrer o backlog histórico (quase tudo grupo/ruído). Só conversas com
 * mensagem nova depois disso passam pela IA.
 *
 * ADITIVO e idempotente. NÃO deleta nada. Rodar UMA vez no deploy do B',
 * após `migrate deploy`. Requer DATABASE_URL no ambiente.
 *
 * Rodar: npx tsx prisma/seeds/mark-existing-conversations-analyzed.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.whatsappConversation.count({ where: { analyzedAt: null } });
  const res = await prisma.whatsappConversation.updateMany({
    where: { analyzedAt: null },
    data: { analyzedAt: new Date(), needsAnalysis: false },
  });
  console.log(`Não-analisadas antes: ${before}. Marcadas agora: ${res.count}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
