// Script de teste para debugar getCampaignReport
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testReport() {
  const campaignId = 'cmluwnogb0002ab9n0ssaudr8'; // ID da campanha com erro

  console.log('🔍 Testando getCampaignReport...\n');

  try {
    // 1. Verificar se campanha existe
    console.log('1️⃣ Buscando campanha...');
    const campaign = await prisma.productCampaign.findFirst({
      where: { id: campaignId },
      include: {
        products: true,
      },
    });

    if (!campaign) {
      console.error('❌ Campanha não encontrada!');
      return;
    }

    console.log(`✅ Campanha: ${campaign.name}`);
    console.log(`   Status: ${campaign.status}`);
    console.log(`   Produtos configurados: ${campaign.products.length}`);

    // 2. Testar groupBy de status (AQUI PODE ESTAR O ERRO)
    console.log('\n2️⃣ Testando groupBy por status...');
    try {
      const bonusByStatus = await prisma.campaignBonusEntry.groupBy({
        by: ['status'],
        where: { campaignId },
        _sum: { totalBonus: true },
        _count: true,
      });
      console.log(`✅ GroupBy status: ${JSON.stringify(bonusByStatus, null, 2)}`);
    } catch (err) {
      console.error(`❌ Erro no groupBy status:`, err.message);
      throw err;
    }

    // 3. Testar groupBy de vendedores
    console.log('\n3️⃣ Testando groupBy por vendedores...');
    try {
      const topSellers = await prisma.campaignBonusEntry.groupBy({
        by: ['sellerUserId'],
        where: {
          campaignId,
          status: { not: 'REVERSED' },
        },
        _sum: { totalBonus: true },
        orderBy: {
          _sum: { totalBonus: 'desc' },
        },
        take: 10,
      });
      console.log(`✅ GroupBy vendedores: ${topSellers.length} resultados`);
    } catch (err) {
      console.error(`❌ Erro no groupBy vendedores:`, err.message);
      throw err;
    }

    // 4. Testar queryRaw de produtos
    console.log('\n4️⃣ Testando queryRaw de produtos...');
    try {
      const topProducts = await prisma.$queryRaw`
        SELECT
          si."productId",
          SUM(cbe.quantity)::int as "totalQty",
          SUM(cbe."totalBonus")::float as "totalBonus"
        FROM "CampaignBonusEntry" cbe
        JOIN "SaleItem" si ON si.id = cbe."saleItemId"
        WHERE cbe."campaignId" = ${campaignId}
          AND cbe.status != 'REVERSED'
        GROUP BY si."productId"
        ORDER BY "totalBonus" DESC
        LIMIT 10
      `;
      console.log(`✅ QueryRaw produtos: ${topProducts.length} resultados`);
    } catch (err) {
      console.error(`❌ Erro no queryRaw:`, err.message);
      throw err;
    }

    console.log('\n✅ TODOS OS TESTES PASSARAM!');

  } catch (error) {
    console.error('\n❌ ERRO FATAL:', error);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testReport();
