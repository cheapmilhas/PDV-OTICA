const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    where: { companyId: 'cmlx4fkjt000092bq1n7rm63g' },
    select: { id: true, name: true, role: true },
  });
  console.log('Usuários da empresa:');
  users.forEach(u => console.log(`  ${u.id} | ${u.name} | ${u.role}`));

  // Verificar se o DEFAULT_USER_ID existe
  const defaultUser = await prisma.user.findUnique({
    where: { id: 'cmlx4fl53000492bqrp6gg2w3' },
    select: { id: true, name: true },
  });
  console.log('\nDEFAULT_USER_ID existe?', defaultUser ? 'SIM' : 'NÃO');

  // Verificar quais users as vendas existentes referenciam
  const sellerIds = await prisma.sale.groupBy({
    by: ['sellerUserId'],
    where: { legacySource: 'ADO_PACAJUS' },
    _count: true,
  });
  console.log('\nSeller IDs usados nas vendas existentes:');
  for (const s of sellerIds) {
    const user = await prisma.user.findUnique({ where: { id: s.sellerUserId }, select: { name: true } });
    console.log(`  ${s.sellerUserId} | ${user?.name || 'DELETADO'} | ${s._count} vendas`);
  }

  await prisma.$disconnect();
}

check().catch(console.error);
