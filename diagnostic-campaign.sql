-- ============================================================================
-- SCRIPT DE DIAGNÓSTICO: Por que campanha não computou bônus?
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Substitua os IDs abaixo pelos valores reais
-- 2. Execute cada query no Prisma Studio ou banco de dados
-- 3. Analise os resultados
-- ============================================================================

-- VARIÁVEIS (SUBSTITUIR PELOS VALORES REAIS)
-- @CAMPAIGN_ID = ID da campanha (ex: clxxxxxxxx)
-- @SALE_ID = ID da venda (ex: clxxxxxxxx)
-- @PRODUCT_ID = ID do produto vendido (ex: clxxxxxxxx)

-- ============================================================================
-- 1. VERIFICAR STATUS DA CAMPANHA
-- ============================================================================
SELECT
  'CAMPANHA' as tipo,
  id,
  name,
  status,
  scope,
  bonusType,
  countMode,
  TO_CHAR(startDate, 'DD/MM/YYYY HH24:MI') as inicio,
  TO_CHAR(endDate, 'DD/MM/YYYY HH24:MI') as fim,
  TO_CHAR(NOW(), 'DD/MM/YYYY HH24:MI') as agora,
  CASE
    WHEN status != 'ACTIVE' THEN '❌ Status não é ACTIVE'
    WHEN startDate > NOW() THEN '❌ Campanha ainda não começou'
    WHEN endDate < NOW() THEN '❌ Campanha já terminou'
    ELSE '✅ Período válido'
  END as validacao_periodo,
  branchId,
  bonusPerUnit,
  minimumCount,
  fixedBonusAmount,
  packageSize,
  bonusPerPackage,
  allowStacking,
  priority
FROM "ProductCampaign"
WHERE id = '@CAMPAIGN_ID';

-- ============================================================================
-- 2. VERIFICAR PRODUTOS CONFIGURADOS NA CAMPANHA
-- ============================================================================
SELECT
  'PRODUTOS_CAMPANHA' as tipo,
  pci.id,
  pci.productId,
  p1.name as produto_nome,
  pci.categoryId,
  c.name as categoria_nome,
  pci.brandId,
  b.name as marca_nome,
  pci.supplierId,
  s.name as fornecedor_nome,
  CASE
    WHEN pci.productId IS NOT NULL THEN '🎯 Produto específico'
    WHEN pci.categoryId IS NOT NULL THEN '📁 Categoria'
    WHEN pci.brandId IS NOT NULL THEN '🏷️ Marca'
    WHEN pci.supplierId IS NOT NULL THEN '🏭 Fornecedor'
  END as tipo_filtro
FROM "ProductCampaignItem" pci
LEFT JOIN "Product" p1 ON p1.id = pci.productId
LEFT JOIN "Category" c ON c.id = pci.categoryId
LEFT JOIN "Brand" b ON b.id = pci.brandId
LEFT JOIN "Supplier" s ON s.id = pci.supplierId
WHERE pci.campaignId = '@CAMPAIGN_ID';

-- Se retornar VAZIO = ❌ CAMPANHA SEM PRODUTOS CONFIGURADOS!

-- ============================================================================
-- 3. VERIFICAR DADOS DO PRODUTO VENDIDO
-- ============================================================================
SELECT
  'PRODUTO_VENDIDO' as tipo,
  p.id,
  p.name,
  p.sku,
  p.categoryId,
  c.name as categoria,
  p.brandId,
  b.name as marca,
  p.supplierId,
  s.name as fornecedor,
  p.active
FROM "Product" p
LEFT JOIN "Category" c ON c.id = p.categoryId
LEFT JOIN "Brand" b ON b.id = p.brandId
LEFT JOIN "Supplier" s ON s.id = p.supplierId
WHERE p.id = '@PRODUCT_ID';

-- ============================================================================
-- 4. VERIFICAR COMPATIBILIDADE: Produto x Campanha
-- ============================================================================
-- Esta query mostra se o produto vendido CORRESPONDE aos filtros da campanha
SELECT
  'COMPATIBILIDADE' as tipo,
  pci.id as item_campanha_id,
  CASE
    WHEN pci.productId IS NOT NULL THEN
      CASE WHEN pci.productId = '@PRODUCT_ID' THEN '✅ PRODUTO CORRESPONDE' ELSE '❌ Produto diferente' END
    WHEN pci.categoryId IS NOT NULL THEN
      CASE WHEN pci.categoryId = (SELECT categoryId FROM "Product" WHERE id = '@PRODUCT_ID')
           THEN '✅ CATEGORIA CORRESPONDE' ELSE '❌ Categoria diferente' END
    WHEN pci.brandId IS NOT NULL THEN
      CASE WHEN pci.brandId = (SELECT brandId FROM "Product" WHERE id = '@PRODUCT_ID')
           THEN '✅ MARCA CORRESPONDE' ELSE '❌ Marca diferente' END
    WHEN pci.supplierId IS NOT NULL THEN
      CASE WHEN pci.supplierId = (SELECT supplierId FROM "Product" WHERE id = '@PRODUCT_ID')
           THEN '✅ FORNECEDOR CORRESPONDE' ELSE '❌ Fornecedor diferente' END
  END as resultado
FROM "ProductCampaignItem" pci
WHERE pci.campaignId = '@CAMPAIGN_ID';

-- Se TODOS retornarem "❌" = PRODUTO NÃO É ELEGÍVEL

-- ============================================================================
-- 5. VERIFICAR ITENS DA VENDA
-- ============================================================================
SELECT
  'ITENS_VENDA' as tipo,
  si.id,
  si.saleId,
  si.productId,
  p.name as produto,
  si.qty,
  si.unitPrice,
  si.totalPrice,
  CASE
    WHEN si.productId = '@PRODUCT_ID' THEN '✅ Produto da campanha'
    ELSE 'ℹ️ Outro produto'
  END as verificacao
FROM "SaleItem" si
JOIN "Product" p ON p.id = si.productId
WHERE si.saleId = '@SALE_ID';

-- ============================================================================
-- 6. VERIFICAR SE BÔNUS FOI GERADO
-- ============================================================================
SELECT
  'BONUS_GERADO' as tipo,
  cbe.id,
  cbe.campaignId,
  pc.name as campanha,
  cbe.saleId,
  cbe.saleItemId,
  si.productId,
  p.name as produto,
  cbe.bonusAmount,
  cbe.quantity,
  cbe.sellerUserId,
  u.name as vendedor,
  cbe.branchId,
  TO_CHAR(cbe.createdAt, 'DD/MM/YYYY HH24:MI:SS') as criado_em
FROM "CampaignBonusEntry" cbe
JOIN "ProductCampaign" pc ON pc.id = cbe.campaignId
LEFT JOIN "SaleItem" si ON si.id = cbe.saleItemId
LEFT JOIN "Product" p ON p.id = si.productId
LEFT JOIN "User" u ON u.id = cbe.sellerUserId
WHERE cbe.saleId = '@SALE_ID';

-- Se retornar VAZIO = ❌ BÔNUS NÃO FOI GERADO!
-- Se retornar registros = ✅ Bônus foi gerado (verificar valores)

-- ============================================================================
-- 7. VERIFICAR LIMITES DA CAMPANHA
-- ============================================================================
SELECT
  'LIMITES' as tipo,
  pc.maxBonusPerSale,
  pc.maxBonusPerDay,
  pc.maxBonusPerMonth,
  pc.maxBonusTotal,
  -- Calcular quanto já foi usado
  COALESCE(SUM(cbe.bonusAmount), 0) as bonus_total_usado,
  COUNT(DISTINCT cbe.saleId) as vendas_com_bonus
FROM "ProductCampaign" pc
LEFT JOIN "CampaignBonusEntry" cbe ON cbe.campaignId = pc.id
WHERE pc.id = '@CAMPAIGN_ID'
GROUP BY pc.id, pc.maxBonusPerSale, pc.maxBonusPerDay, pc.maxBonusPerMonth, pc.maxBonusTotal;

-- ============================================================================
-- 8. VERIFICAR VENDA COMPLETA
-- ============================================================================
SELECT
  'VENDA' as tipo,
  s.id,
  s.code,
  TO_CHAR(s.createdAt, 'DD/MM/YYYY HH24:MI:SS') as data_venda,
  s.sellerUserId,
  u.name as vendedor,
  s.branchId,
  b.name as filial,
  s.status,
  s.totalAmount,
  (SELECT COUNT(*) FROM "SaleItem" WHERE saleId = s.id) as total_itens
FROM "Sale" s
LEFT JOIN "User" u ON u.id = s.sellerUserId
LEFT JOIN "Branch" b ON b.id = s.branchId
WHERE s.id = '@SALE_ID';

-- ============================================================================
-- INTERPRETAÇÃO DOS RESULTADOS
-- ============================================================================

/*
CHECKLIST DE VERIFICAÇÃO:

1. Query 1 - Campanha:
   [ ] status = 'ACTIVE'
   [ ] validacao_periodo = '✅ Período válido'
   [ ] bonusPerUnit tem valor OU outros campos de bônus preenchidos

2. Query 2 - Produtos da Campanha:
   [ ] Retorna ao menos 1 linha
   [ ] productId/categoryId/brandId/supplierId preenchido

3. Query 3 - Produto Vendido:
   [ ] active = true
   [ ] categoryId, brandId, supplierId anotados para comparar

4. Query 4 - Compatibilidade:
   [ ] Ao menos 1 linha retorna "✅ CORRESPONDE"
   [ ] Se TODOS "❌" = PRODUTO NÃO ELEGÍVEL!

5. Query 5 - Itens da Venda:
   [ ] Produto da campanha aparece com '✅'
   [ ] qty > 0

6. Query 6 - Bônus Gerado:
   [ ] Se VAZIO = PROBLEMA! Bônus não foi gerado
   [ ] Se TEM REGISTROS = OK, bônus foi gerado

7. Query 7 - Limites:
   [ ] Verificar se limites foram atingidos

8. Query 8 - Venda:
   [ ] status != 'CANCELLED'
   [ ] sellerUserId preenchido
   [ ] branchId válido

DIAGNÓSTICO RÁPIDO:
- Se Query 2 VAZIA → Campanha sem produtos configurados
- Se Query 4 TODOS "❌" → Produto não corresponde aos filtros
- Se Query 6 VAZIA → Bônus não foi gerado (verificar queries anteriores)
- Se Query 6 TEM DADOS mas bonusAmount = 0 → Problema de cálculo
*/
