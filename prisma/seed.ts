import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

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
      isActive: true,
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
      isActive: true,
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
      branchId: branch.id,
      isActive: true,
    },
  });

  const vendedor = await prisma.user.create({
    data: {
      name: 'Carlos Vendedor',
      email: 'vendedor@pdvotica.com',
      passwordHash,
      role: 'VENDEDOR',
      branchId: branch.id,
      isActive: true,
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

  // 5. Criar Produtos
  console.log('📦 Criando produtos...');
  const produtos = await Promise.all([
    // Armações
    prisma.product.create({
      data: {
        code: 'ARM001',
        name: 'Ray-Ban Aviador Clássico RB3025',
        description: 'Óculos aviador clássico com armação em metal',
        category: 'ARMACAO',
        type: 'FRAME',
        brand: 'Ray-Ban',
        costPrice: 450.00,
        salePrice: 899.90,
        stock: 15,
        minStock: 5,
        companyId: company.id,
        isActive: true,
      },
    }),
    prisma.product.create({
      data: {
        code: 'ARM002',
        name: 'Oakley Holbrook OO9102',
        description: 'Armação esportiva de acetato',
        category: 'ARMACAO',
        type: 'FRAME',
        brand: 'Oakley',
        costPrice: 625.00,
        salePrice: 1249.90,
        stock: 8,
        minStock: 5,
        companyId: company.id,
        isActive: true,
      },
    }),
    prisma.product.create({
      data: {
        code: 'ARM003',
        name: 'Armação Infantil Flexível Azul',
        description: 'Armação infantil com material flexível',
        category: 'ARMACAO',
        type: 'FRAME',
        brand: 'Disney',
        costPrice: 160.00,
        salePrice: 320.00,
        stock: 12,
        minStock: 8,
        companyId: company.id,
        isActive: true,
      },
    }),
    prisma.product.create({
      data: {
        code: 'ARM004',
        name: 'Prada VPR 16M Feminino',
        description: 'Armação feminina de grife em acetato',
        category: 'ARMACAO',
        type: 'FRAME',
        brand: 'Prada',
        costPrice: 945.00,
        salePrice: 1890.00,
        stock: 4,
        minStock: 3,
        companyId: company.id,
        isActive: true,
      },
    }),
    prisma.product.create({
      data: {
        code: 'ARM005',
        name: 'Tommy Hilfiger TH 1770 Masculino',
        description: 'Armação masculina em acetato premium',
        category: 'ARMACAO',
        type: 'FRAME',
        brand: 'Tommy Hilfiger',
        costPrice: 325.00,
        salePrice: 650.00,
        stock: 1,
        minStock: 5,
        companyId: company.id,
        isActive: true,
      },
    }),
    // Lentes
    prisma.product.create({
      data: {
        code: 'LEN001',
        name: 'Lente Transitions Gen 8 1.67',
        description: 'Lente fotossensível de alta tecnologia',
        category: 'LENTE',
        type: 'LENS',
        brand: 'Transitions',
        costPrice: 290.00,
        salePrice: 580.00,
        stock: 2,
        minStock: 3,
        companyId: company.id,
        isActive: true,
      },
    }),
    prisma.product.create({
      data: {
        code: 'LEN002',
        name: 'Lente Zeiss Single Vision 1.74',
        description: 'Lente monofocal ultra fina',
        category: 'LENTE',
        type: 'LENS',
        brand: 'Zeiss',
        costPrice: 600.00,
        salePrice: 1200.00,
        stock: 5,
        minStock: 3,
        companyId: company.id,
        isActive: true,
      },
    }),
    prisma.product.create({
      data: {
        code: 'LEN003',
        name: 'Lente Antirreflexo Premium',
        description: 'Lente com tratamento antirreflexo',
        category: 'LENTE',
        type: 'LENS',
        brand: 'Essilor',
        costPrice: 175.00,
        salePrice: 350.00,
        stock: 30,
        minStock: 15,
        companyId: company.id,
        isActive: true,
      },
    }),
    // Óculos de Sol
    prisma.product.create({
      data: {
        code: 'SOL001',
        name: 'Ray-Ban Wayfarer RB2140',
        description: 'Óculos de sol clássico',
        category: 'OCULOS_SOL',
        type: 'SUNGLASSES',
        brand: 'Ray-Ban',
        costPrice: 400.00,
        salePrice: 799.90,
        stock: 20,
        minStock: 10,
        companyId: company.id,
        isActive: true,
      },
    }),
    prisma.product.create({
      data: {
        code: 'SOL002',
        name: 'Oakley Radar EV Path Esportivo',
        description: 'Óculos esportivo de alta performance',
        category: 'OCULOS_SOL',
        type: 'SUNGLASSES',
        brand: 'Oakley',
        costPrice: 750.00,
        salePrice: 1499.90,
        stock: 6,
        minStock: 5,
        companyId: company.id,
        isActive: true,
      },
    }),
    // Acessórios
    prisma.product.create({
      data: {
        code: 'LIQ001',
        name: 'Líquido de Limpeza 50ml',
        description: 'Solução para limpeza de lentes',
        category: 'ACESSORIO',
        type: 'ACCESSORY',
        brand: 'Genérico',
        costPrice: 12.50,
        salePrice: 25.00,
        stock: 45,
        minStock: 20,
        companyId: company.id,
        isActive: true,
      },
    }),
    prisma.product.create({
      data: {
        code: 'EST001',
        name: 'Estojo Rígido Premium',
        description: 'Estojo rígido para proteção',
        category: 'ACESSORIO',
        type: 'ACCESSORY',
        brand: 'Genérico',
        costPrice: 17.50,
        salePrice: 35.00,
        stock: 50,
        minStock: 25,
        companyId: company.id,
        isActive: true,
      },
    }),
  ]);

  // 6. Criar Vendas
  console.log('💰 Criando vendas de exemplo...');

  const venda1 = await prisma.sale.create({
    data: {
      branchId: branch.id,
      customerId: clientes[0].id,
      sellerId: vendedor.id,
      status: 'COMPLETED',
      subtotal: 899.90,
      discount: 0,
      total: 899.90,
      createdAt: new Date('2024-01-28T10:30:00'),
      completedAt: new Date('2024-01-28T10:35:00'),
      items: {
        create: [
          {
            productId: produtos[0].id, // Ray-Ban Aviador
            quantity: 1,
            unitPrice: 899.90,
            subtotal: 899.90,
            discount: 0,
            total: 899.90,
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
      branchId: branch.id,
      customerId: clientes[1].id,
      sellerId: vendedor.id,
      status: 'COMPLETED',
      subtotal: 1249.90,
      discount: 0,
      total: 1249.90,
      createdAt: new Date('2024-01-30T14:20:00'),
      completedAt: new Date('2024-01-30T14:25:00'),
      items: {
        create: [
          {
            productId: produtos[1].id, // Oakley Holbrook
            quantity: 1,
            unitPrice: 1249.90,
            subtotal: 1249.90,
            discount: 0,
            total: 1249.90,
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
      branchId: branch.id,
      customerId: clientes[2].id,
      sellerId: admin.id,
      status: 'COMPLETED',
      subtotal: 680.00,
      discount: 0,
      total: 680.00,
      createdAt: new Date('2024-01-25T16:45:00'),
      completedAt: new Date('2024-01-25T16:50:00'),
      items: {
        create: [
          {
            productId: produtos[5].id, // Lente Transitions
            quantity: 1,
            unitPrice: 580.00,
            subtotal: 580.00,
            discount: 0,
            total: 580.00,
          },
          {
            productId: produtos[10].id, // Líquido
            quantity: 4,
            unitPrice: 25.00,
            subtotal: 100.00,
            discount: 0,
            total: 100.00,
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
