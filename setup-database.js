const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Conectando ao Neon...');

  try {
    // Testar conexão
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Conexão estabelecida com sucesso!');

    // Ler e executar o SQL
    const sqlPath = path.join(__dirname, 'neon_tables_only.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📦 Criando tabelas no banco...');

    // Executar SQL direto
    await prisma.$executeRawUnsafe(sql);

    console.log('✅ Todas as tabelas foram criadas com sucesso!');
    console.log('');
    console.log('🎉 Banco de dados configurado!');
    console.log('');
    console.log('Próximos passos:');
    console.log('1. Execute: npm run seed (para popular com dados)');
    console.log('2. Execute: npm run dev (para iniciar o servidor)');

  } catch (error) {
    console.error('❌ Erro ao configurar banco:', error.message);

    if (error.message.includes('already exists')) {
      console.log('');
      console.log('⚠️  Algumas tabelas já existem. Isso é normal!');
      console.log('✅ Banco já está configurado. Pode prosseguir!');
    } else {
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
