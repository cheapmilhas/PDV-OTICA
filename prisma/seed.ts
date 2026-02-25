import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedCategoriesAndBrands } from './seeds/categories-brands.seed';
import { setupCompanyFinance } from '../src/services/finance-setup.service';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...\n');

  // Limpar dados existentes (em ordem de dependência)
  console.log('🗑️  Limpando dados existentes...');
  await prisma.$executeRaw`TRUNCATE TABLE "User", "Company", "Branch", "Customer", "Product", "Sale", "SaleItem", "SalePayment" RESTART IDENTITY CASCADE`;

  // 1. Criar Company
  console.log('🏢 Criando empresa...');
  const company = await prisma.company.create({
    data: {
      name: 'Ótica Visão Clara',
      tradeName: 'Visão Clara',
      cnpj: '12345678000190',
      phone: '(11) 3456-7890',
      email: 'contato@oticavisaoclara.com.br',
      address: 'Rua das Flores, 123',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01234-567',
      accessEnabled: true, // FIX: Habilitar acesso sem assinatura para dev/teste
    },
  });

  // 2. Criar Branch (Filial)
  console.log('🏪 Criando filial...');
  const branch = await prisma.branch.create({
    data: {
      name: 'Matriz - Centro',
      companyId: company.id,
      phone: '(11) 3456-7890',
      address: 'Rua das Flores, 123',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01234-567',
    },
  });

  // 3. Criar Usuários
  console.log('👤 Criando usuários...');
  const passwordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.create({
    data: {
      name: 'Admin Sistema',
      email: 'admin@pdvotica.com',
      passwordHash,
      role: 'ADMIN',
      companyId: company.id,
      active: true,
      branches: {
        create: {
          branchId: branch.id,
        },
      },
    },
  });

  const vendedor = await prisma.user.create({
    data: {
      name: 'Carlos Vendedor',
      email: 'vendedor@pdvotica.com',
      passwordHash,
      role: 'VENDEDOR',
      companyId: company.id,
      active: true,
      branches: {
        create: {
          branchId: branch.id,
        },
      },
    },
  });

  // 4. Criar Clientes
  console.log('👥 Criando clientes...');
  const clientes = await Promise.all([
    prisma.customer.create({
      data: {
        name: 'Maria Silva Santos',
        email: 'maria.santos@email.com',
        phone: '(11) 98765-4321',
        cpf: '12345678901',
        birthDate: new Date('1985-03-15'),
        companyId: company.id,
        address: 'Rua das Acácias, 456',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '02345-678',
      },
    }),
    prisma.customer.create({
      data: {
        name: 'João Pedro Oliveira',
        email: 'joao.oliveira@email.com',
        phone: '(11) 97654-3210',
        cpf: '23456789012',
        birthDate: new Date('1992-07-22'),
        companyId: company.id,
        address: 'Av. Paulista, 1000',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01310-100',
      },
    }),
    prisma.customer.create({
      data: {
        name: 'Ana Paula Costa',
        email: 'ana.costa@email.com',
        phone: '(11) 96543-2109',
        cpf: '34567890123',
        birthDate: new Date('1978-11-05'),
        companyId: company.id,
        address: 'Rua Augusta, 2500',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01412-100',
      },
    }),
  ]);

  // 5. Criar Categorias e Marcas
  await seedCategoriesAndBrands(company.id);

  // 6. Criar Produtos
  console.log('📦 Criando produtos...');
  const produtos = await Promise.all([
    // Armações
    prisma.product.create({
      data: {
        sku: 'ARM001',
        name: 'Ray-Ban Aviador Clássico RB3025',
        description: 'Óculos aviador clássico com armação em metal',
        type: 'FRAME',
        costPrice: 450.00,
        salePrice: 899.90,
        stockQty: 15,
        stockMin: 5,
        companyId: company.id,
        active: true,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'ARM002',
        name: 'Oakley Holbrook OO9102',
        description: 'Armação esportiva de acetato',
        type: 'FRAME',
        costPrice: 625.00,
        salePrice: 1249.90,
        stockQty: 8,
        stockMin: 5,
        companyId: company.id,
        active: true,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'ARM003',
        name: 'Armação Infantil Flexível Azul',
        description: 'Armação infantil com material flexível',
        type: 'FRAME',
        costPrice: 160.00,
        salePrice: 320.00,
        stockQty: 12,
        stockMin: 8,
        companyId: company.id,
        active: true,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'ARM004',
        name: 'Prada VPR 16M Feminino',
        description: 'Armação feminina de grife em acetato',
        type: 'FRAME',
        costPrice: 945.00,
        salePrice: 1890.00,
        stockQty: 4,
        stockMin: 3,
        companyId: company.id,
        active: true,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'ARM005',
        name: 'Tommy Hilfiger TH 1770 Masculino',
        description: 'Armação masculina em acetato premium',
        type: 'FRAME',
        costPrice: 325.00,
        salePrice: 650.00,
        stockQty: 1,
        stockMin: 5,
        companyId: company.id,
        active: true,
      },
    }),
    // Lentes
    prisma.product.create({
      data: {
        sku: 'LEN001',
        name: 'Lente Transitions Gen 8 1.67',
        description: 'Lente fotossensível de alta tecnologia',
        type: 'LENS_SERVICE',
        costPrice: 290.00,
        salePrice: 580.00,
        stockQty: 2,
        stockMin: 3,
        companyId: company.id,
        active: true,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'LEN002',
        name: 'Lente Zeiss Single Vision 1.74',
        description: 'Lente monofocal ultra fina',
        type: 'LENS_SERVICE',
        costPrice: 600.00,
        salePrice: 1200.00,
        stockQty: 5,
        stockMin: 3,
        companyId: company.id,
        active: true,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'LEN003',
        name: 'Lente Antirreflexo Premium',
        description: 'Lente com tratamento antirreflexo',
        type: 'LENS_SERVICE',
        costPrice: 175.00,
        salePrice: 350.00,
        stockQty: 30,
        stockMin: 15,
        companyId: company.id,
        active: true,
      },
    }),
    // Óculos de Sol
    prisma.product.create({
      data: {
        sku: 'SOL001',
        name: 'Ray-Ban Wayfarer RB2140',
        description: 'Óculos de sol clássico',
        type: 'SUNGLASSES',
        costPrice: 400.00,
        salePrice: 799.90,
        stockQty: 20,
        stockMin: 10,
        companyId: company.id,
        active: true,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'SOL002',
        name: 'Oakley Radar EV Path Esportivo',
        description: 'Óculos esportivo de alta performance',
        type: 'SUNGLASSES',
        costPrice: 750.00,
        salePrice: 1499.90,
        stockQty: 6,
        stockMin: 5,
        companyId: company.id,
        active: true,
      },
    }),
    // Acessórios
    prisma.product.create({
      data: {
        sku: 'LIQ001',
        name: 'Líquido de Limpeza 50ml',
        description: 'Solução para limpeza de lentes',
        type: 'ACCESSORY',
        costPrice: 12.50,
        salePrice: 25.00,
        stockQty: 45,
        stockMin: 20,
        companyId: company.id,
        active: true,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'EST001',
        name: 'Estojo Rígido Premium',
        description: 'Estojo rígido para proteção',
        type: 'ACCESSORY',
        costPrice: 17.50,
        salePrice: 35.00,
        stockQty: 50,
        stockMin: 25,
        companyId: company.id,
        active: true,
      },
    }),
  ]);

  // 7. Criar Vendas
  console.log('💰 Criando vendas de exemplo...');

  const venda1 = await prisma.sale.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      customerId: clientes[0].id,
      sellerUserId: vendedor.id,
      status: 'COMPLETED',
      subtotal: 899.90,
      discountTotal: 0,
      total: 899.90,
      createdAt: new Date('2024-01-28T10:30:00'),
      completedAt: new Date('2024-01-28T10:35:00'),
      items: {
        create: [
          {
            productId: produtos[0].id, // Ray-Ban Aviador
            qty: 1,
            unitPrice: 899.90,
            lineTotal: 899.90,
            discount: 0,
          },
        ],
      },
      payments: {
        create: [
          {
            method: 'CREDIT_CARD',
            amount: 899.90,
            installments: 3,
          },
        ],
      },
    },
  });

  const venda2 = await prisma.sale.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      customerId: clientes[1].id,
      sellerUserId: vendedor.id,
      status: 'COMPLETED',
      subtotal: 1249.90,
      discountTotal: 0,
      total: 1249.90,
      createdAt: new Date('2024-01-30T14:20:00'),
      completedAt: new Date('2024-01-30T14:25:00'),
      items: {
        create: [
          {
            productId: produtos[1].id, // Oakley Holbrook
            qty: 1,
            unitPrice: 1249.90,
            lineTotal: 1249.90,
            discount: 0,
          },
        ],
      },
      payments: {
        create: [
          {
            method: 'PIX',
            amount: 1249.90,
          },
        ],
      },
    },
  });

  const venda3 = await prisma.sale.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      customerId: clientes[2].id,
      sellerUserId: admin.id,
      status: 'COMPLETED',
      subtotal: 680.00,
      discountTotal: 0,
      total: 680.00,
      createdAt: new Date('2024-01-25T16:45:00'),
      completedAt: new Date('2024-01-25T16:50:00'),
      items: {
        create: [
          {
            productId: produtos[5].id, // Lente Transitions
            qty: 1,
            unitPrice: 580.00,
            lineTotal: 580.00,
            discount: 0,
          },
          {
            productId: produtos[10].id, // Líquido
            qty: 4,
            unitPrice: 25.00,
            lineTotal: 100.00,
            discount: 0,
          },
        ],
      },
      payments: {
        create: [
          {
            method: 'CASH',
            amount: 680.00,
          },
        ],
      },
    },
  });

  // Configurar módulo financeiro
  try {
    await setupCompanyFinance(prisma, company.id, branch.id);
    console.log('💰 Módulo financeiro configurado');
  } catch (financeError) {
    console.error('[FINANCE] Erro ao configurar módulo financeiro:', financeError);
  }

  console.log('\n✅ Seed concluído com sucesso!\n');
  console.log('📊 Resumo:');
  console.log(`   - 1 Empresa: ${company.name}`);
  console.log(`   - 1 Filial: ${branch.name}`);
  console.log(`   - 2 Usuários (admin@pdvotica.com / vendedor@pdvotica.com)`);
  console.log(`   - ${clientes.length} Clientes`);
  console.log(`   - ${produtos.length} Produtos`);
  console.log(`   - 3 Vendas concluídas`);
  console.log('\n🔐 Login: admin@pdvotica.com | Senha: admin123\n');
}

main()
  .catch((e) => {
    console.error('❌ Erro ao executar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
