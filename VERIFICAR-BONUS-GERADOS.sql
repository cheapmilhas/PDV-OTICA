-- ============================================================================
-- VERIFICAÇÃO RÁPIDA: Há bônus gerados nas últimas 24 horas?
-- ============================================================================

-- 1. Verificar TODOS os bônus gerados (últimos 10)
SELECT
  'ULTIMOS_BONUS' as tipo,
  cbe.id,
  TO_CHAR(cbe.createdAt, 'DD/MM/YYYY HH24:MI:SS') as quando,
  pc.name as campanha,
  pc.status as status_campanha,
  u.name as vendedor,
  s.code as codigo_venda,
  p.name as produto,
  cbe.quantity as qtd,
  cbe.bonusAmount as bonus,
  cbe.status as status_bonus
FROM "CampaignBonusEntry" cbe
JOIN "ProductCampaign" pc ON pc.id = cbe.campaignId
LEFT JOIN "User" u ON u.id = cbe.sellerUserId
LEFT JOIN "Sale" s ON s.id = cbe.saleId
LEFT JOIN "SaleItem" si ON si.id = cbe.saleItemId
LEFT JOIN "Product" p ON p.id = si.productId
ORDER BY cbe.createdAt DESC
LIMIT 10;

-- ============================================================================
-- 2. Contar bônus por campanha (últimas 24h)
SELECT
  'BONUS_POR_CAMPANHA' as tipo,
  pc.name as campanha,
  pc.status,
  COUNT(cbe.id) as total_bonus,
  SUM(cbe.bonusAmount) as valor_total,
  MIN(TO_CHAR(cbe.createdAt, 'DD/MM HH24:MI')) as primeiro,
  MAX(TO_CHAR(cbe.createdAt, 'DD/MM HH24:MI')) as ultimo
FROM "ProductCampaign" pc
LEFT JOIN "CampaignBonusEntry" cbe ON cbe.campaignId = pc.id
  AND cbe.createdAt >= NOW() - INTERVAL '24 hours'
WHERE pc.status = 'ACTIVE'
GROUP BY pc.id, pc.name, pc.status
ORDER BY total_bonus DESC;

-- ============================================================================
-- 3. Verificar vendas recentes que DEVERIAM ter gerado bônus
SELECT
  'VENDAS_RECENTES' as tipo,
  s.id as venda_id,
  s.code as codigo,
  TO_CHAR(s.createdAt, 'DD/MM/YYYY HH24:MI:SS') as quando,
  u.name as vendedor,
  p.name as produto,
  si.qty,
  si.unitPrice,
  -- Verificar se gerou bônus
  CASE
    WHEN EXISTS (
      SELECT 1 FROM "CampaignBonusEntry"
      WHERE saleId = s.id
    ) THEN '✅ Gerou bônus'
    ELSE '❌ NÃO gerou bônus'
  END as status_bonus,
  -- Qual campanha deveria se aplicar
  (
    SELECT STRING_AGG(pc.name, ', ')
    FROM "ProductCampaign" pc
    JOIN "ProductCampaignItem" pci ON pci.campaignId = pc.id
    WHERE pc.status = 'ACTIVE'
      AND pc.startDate <= s.createdAt
      AND pc.endDate >= s.createdAt
      AND (pci.productId = si.productId OR pci.productId IS NULL)
  ) as campanhas_aplicaveis
FROM "Sale" s
JOIN "SaleItem" si ON si.saleId = s.id
JOIN "Product" p ON p.id = si.productId
LEFT JOIN "User" u ON u.id = s.sellerUserId
WHERE s.createdAt >= NOW() - INTERVAL '24 hours'
  AND s.status != 'CANCELLED'
ORDER BY s.createdAt DESC
LIMIT 10;

-- ============================================================================
-- 4. Verificar campanhas ATIVAS agora
SELECT
  'CAMPANHAS_ATIVAS' as tipo,
  pc.id,
  pc.name,
  pc.status,
  TO_CHAR(pc.startDate, 'DD/MM/YYYY') as inicio,
  TO_CHAR(pc.endDate, 'DD/MM/YYYY') as fim,
  pc.bonusType,
  pc.bonusPerUnit,
  -- Contar produtos configurados
  (SELECT COUNT(*) FROM "ProductCampaignItem" WHERE campaignId = pc.id) as produtos_config,
  -- Contar bônus gerados
  (SELECT COUNT(*) FROM "CampaignBonusEntry" WHERE campaignId = pc.id) as bonus_gerados
FROM "ProductCampaign" pc
WHERE pc.status = 'ACTIVE'
  AND pc.startDate <= NOW()
  AND pc.endDate >= NOW()
ORDER BY pc.priority DESC, pc.createdAt DESC;

-- ============================================================================
-- 5. Verificar especificamente a venda cmluwoucg0004vei70x4kiyo1
SELECT
  'VENDA_ESPECIFICA' as tipo,
  s.id,
  s.code,
  TO_CHAR(s.createdAt, 'DD/MM/YYYY HH24:MI:SS') as quando_vendeu,
  u.name as vendedor,
  s.status,
  -- Produtos vendidos
  (
    SELECT STRING_AGG(p.name || ' (qty: ' || si.qty || ')', ', ')
    FROM "SaleItem" si
    JOIN "Product" p ON p.id = si.productId
    WHERE si.saleId = s.id
  ) as produtos,
  -- Bônus gerados
  (
    SELECT STRING_AGG(pc.name || ': R$ ' || cbe.bonusAmount, ', ')
    FROM "CampaignBonusEntry" cbe
    JOIN "ProductCampaign" pc ON pc.id = cbe.campaignId
    WHERE cbe.saleId = s.id
  ) as bonus_gerados
FROM "Sale" s
LEFT JOIN "User" u ON u.id = s.sellerUserId
WHERE s.id = 'cmluwoucg0004vei70x4kiyo1';

-- ============================================================================
-- INTERPRETAÇÃO:
-- ============================================================================

/*
Query 1 - Últimos Bônus:
  - Se VAZIO = ❌ NUNCA gerou bônus (problema no sistema)
  - Se TEM DADOS = ✅ Sistema já gerou bônus antes (verificar datas)

Query 2 - Bônus por Campanha:
  - total_bonus = 0 = ❌ Campanha ativa mas não gerou nenhum bônus
  - total_bonus > 0 = ✅ Campanha está funcionando

Query 3 - Vendas Recentes:
  - Se aparecer "❌ NÃO gerou bônus" = PROBLEMA!
  - Verificar coluna "campanhas_aplicaveis" para ver qual deveria aplicar

Query 4 - Campanhas Ativas:
  - produtos_config = 0 = ❌ Campanha sem produtos configurados!
  - bonus_gerados = 0 = ❌ Nunca gerou bônus

Query 5 - Venda Específica:
  - bonus_gerados NULL = ❌ Venda não gerou bônus
  - bonus_gerados com valor = ✅ Gerou bônus

DIAGNÓSTICO RÁPIDO:
1. Execute Query 1 primeiro
2. Se VAZIO = sistema nunca gerou bônus (problema grave)
3. Se TEM DADOS = sistema funciona, mas vendas recentes não estão gerando
4. Execute Query 4 para ver se campanha tem produtos_config > 0
*/

-- ============================================================================
-- PARA ENVIAR OS RESULTADOS:
-- Execute cada query e copie os resultados aqui:
-- ============================================================================

/*
QUERY 1 (Últimos bônus):
[COLE AQUI]

QUERY 2 (Bônus por campanha):
[COLE AQUI]

QUERY 3 (Vendas recentes):
[COLE AQUI]

QUERY 4 (Campanhas ativas):
[COLE AQUI]

QUERY 5 (Venda específica):
[COLE AQUI]
*/
