import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedCategoriesAndBrands(companyId: string) {
  console.log('📂 Criando categorias...');

  // Criar categorias principais
  const categorias = {
    armacoesGrau: await prisma.category.create({
      data: {
        companyId,
        name: 'Armações de Grau',
        defaultCommissionPercent: 15,
        minMarginPercent: 40,
      },
    }),
    oculosSol: await prisma.category.create({
      data: {
        companyId,
        name: 'Óculos de Sol',
        defaultCommissionPercent: 18,
        minMarginPercent: 45,
      },
    }),
    lentes: await prisma.category.create({
      data: {
        companyId,
        name: 'Lentes',
        defaultCommissionPercent: 12,
        minMarginPercent: 35,
      },
    }),
    acessorios: await prisma.category.create({
      data: {
        companyId,
        name: 'Acessórios',
        defaultCommissionPercent: 10,
        minMarginPercent: 50,
      },
    }),
    lentesContato: await prisma.category.create({
      data: {
        companyId,
        name: 'Lentes de Contato',
        defaultCommissionPercent: 15,
        minMarginPercent: 40,
      },
    }),
  };

  // Criar subcategorias de Armações de Grau
  await Promise.all([
    prisma.category.create({
      data: {
        companyId,
        name: 'Armações Grau - Masculino',
        parentId: categorias.armacoesGrau.id,
        defaultCommissionPercent: 15,
        minMarginPercent: 40,
      },
    }),
    prisma.category.create({
      data: {
        companyId,
        name: 'Armações Grau - Feminino',
        parentId: categorias.armacoesGrau.id,
        defaultCommissionPercent: 15,
        minMarginPercent: 40,
      },
    }),
    prisma.category.create({
      data: {
        companyId,
        name: 'Armações Grau - Infantil',
        parentId: categorias.armacoesGrau.id,
        defaultCommissionPercent: 15,
        minMarginPercent: 40,
      },
    }),
    prisma.category.create({
      data: {
        companyId,
        name: 'Armações Grau - Unissex',
        parentId: categorias.armacoesGrau.id,
        defaultCommissionPercent: 15,
        minMarginPercent: 40,
      },
    }),
  ]);

  // Criar subcategorias de Óculos de Sol
  await Promise.all([
    prisma.category.create({
      data: {
        companyId,
        name: 'Óculos Sol - Masculino',
        parentId: categorias.oculosSol.id,
        defaultCommissionPercent: 18,
        minMarginPercent: 45,
      },
    }),
    prisma.category.create({
      data: {
        companyId,
        name: 'Óculos Sol - Feminino',
        parentId: categorias.oculosSol.id,
        defaultCommissionPercent: 18,
        minMarginPercent: 45,
      },
    }),
    prisma.category.create({
      data: {
        companyId,
        name: 'Óculos Sol - Infantil',
        parentId: categorias.oculosSol.id,
        defaultCommissionPercent: 18,
        minMarginPercent: 45,
      },
    }),
    prisma.category.create({
      data: {
        companyId,
        name: 'Óculos Sol - Esportivo',
        parentId: categorias.oculosSol.id,
        defaultCommissionPercent: 18,
        minMarginPercent: 45,
      },
    }),
  ]);

  // Criar subcategorias de Lentes
  await Promise.all([
    prisma.category.create({
      data: {
        companyId,
        name: 'Lentes - Monofocais',
        parentId: categorias.lentes.id,
        defaultCommissionPercent: 12,
        minMarginPercent: 35,
      },
    }),
    prisma.category.create({
      data: {
        companyId,
        name: 'Lentes - Multifocais',
        parentId: categorias.lentes.id,
        defaultCommissionPercent: 12,
        minMarginPercent: 35,
      },
    }),
    prisma.category.create({
      data: {
        companyId,
        name: 'Lentes - Transitions',
        parentId: categorias.lentes.id,
        defaultCommissionPercent: 12,
        minMarginPercent: 35,
      },
    }),
    prisma.category.create({
      data: {
        companyId,
        name: 'Lentes - Antirreflexo',
        parentId: categorias.lentes.id,
        defaultCommissionPercent: 12,
        minMarginPercent: 35,
      },
    }),
  ]);

  // Criar subcategorias de Acessórios
  await Promise.all([
    prisma.category.create({
      data: {
        companyId,
        name: 'Acessórios - Estojos',
        parentId: categorias.acessorios.id,
        defaultCommissionPercent: 10,
        minMarginPercent: 50,
      },
    }),
    prisma.category.create({
      data: {
        companyId,
        name: 'Acessórios - Limpeza',
        parentId: categorias.acessorios.id,
        defaultCommissionPercent: 10,
        minMarginPercent: 50,
      },
    }),
    prisma.category.create({
      data: {
        companyId,
        name: 'Acessórios - Correntes',
        parentId: categorias.acessorios.id,
        defaultCommissionPercent: 10,
        minMarginPercent: 50,
      },
    }),
    prisma.category.create({
      data: {
        companyId,
        name: 'Acessórios - Paninhos',
        parentId: categorias.acessorios.id,
        defaultCommissionPercent: 10,
        minMarginPercent: 50,
      },
    }),
  ]);

  console.log('✅ Categorias criadas!');

  console.log('🏷️  Criando marcas...');

  const marcas = [
    { code: 'RAY-BAN', name: 'Ray-Ban', manufacturer: 'Luxottica', segment: 'Premium' },
    { code: 'OAKLEY', name: 'Oakley', manufacturer: 'Luxottica', segment: 'Esportivo' },
    { code: 'PRADA', name: 'Prada', manufacturer: 'Luxottica', segment: 'Luxo' },
    { code: 'TOMMY', name: 'Tommy Hilfiger', manufacturer: 'Luxottica', segment: 'Premium' },
    { code: 'ARMANI', name: 'Armani Exchange', manufacturer: 'Luxottica', segment: 'Premium' },
    { code: 'VOGUE', name: 'Vogue', manufacturer: 'Luxottica', segment: 'Médio' },
    { code: 'CHILLI', name: 'Chilli Beans', manufacturer: 'Chilli Beans', segment: 'Popular' },
    { code: 'ZEISS', name: 'Zeiss', manufacturer: 'Carl Zeiss', segment: 'Premium', origin: 'Alemanha' },
    { code: 'ESSILOR', name: 'Essilor', manufacturer: 'EssilorLuxottica', segment: 'Premium', origin: 'França' },
    { code: 'HOYA', name: 'Hoya', manufacturer: 'Hoya Corporation', segment: 'Premium', origin: 'Japão' },
    { code: 'TRANSITIONS', name: 'Transitions', manufacturer: 'Essilor', segment: 'Premium' },
    { code: 'CRIZAL', name: 'Crizal', manufacturer: 'Essilor', segment: 'Premium' },
    { code: 'VARILUX', name: 'Varilux', manufacturer: 'Essilor', segment: 'Premium' },
    { code: 'ACUVUE', name: 'Acuvue', manufacturer: 'Johnson & Johnson', segment: 'Premium' },
    { code: 'BAUSCH', name: 'Bausch + Lomb', manufacturer: 'Bausch & Lomb', segment: 'Premium' },
    { code: 'ALCON', name: 'Alcon', manufacturer: 'Alcon', segment: 'Premium' },
    { code: 'COOPER', name: 'CooperVision', manufacturer: 'CooperVision', segment: 'Premium' },
    { code: 'GENERICO', name: 'Genérico', manufacturer: null, segment: 'Econômico' },
    { code: 'SEM-MARCA', name: 'Sem Marca', manufacturer: null, segment: 'Econômico' },
  ];

  await Promise.all(
    marcas.map((marca) =>
      prisma.brand.create({
        data: {
          companyId,
          code: marca.code,
          name: marca.name,
          manufacturer: marca.manufacturer,
          segment: marca.segment,
          origin: marca.origin,
          minMargin: 35,
          maxDiscount: 20,
        },
      })
    )
  );

  console.log('✅ Marcas criadas!');
}
