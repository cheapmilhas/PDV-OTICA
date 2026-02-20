# 🔍 VERIFICAÇÃO RÁPIDA: Por que venda cmluwoucg0004vei70x4kiyo1 não gerou bônus?

## 📊 INFORMAÇÕES DA VENDA

- **ID da Venda:** `cmluwoucg0004vei70x4kiyo1`
- **Produto:** Ray-Ban Aviador Clássico RB3025 (SKU: ARM001)
- **Quantidade:** 1 unidade
- **Preço:** R$ 899,90

## 📊 INFORMAÇÕES DA CAMPANHA

- **Produto configurado:** Ray-Ban Aviador Clássico RB3025
- **Tipo:** Por Unidade
- **Bônus:** R$ 100,00 por unidade
- **Prioridade:** 10

## ⚡ VERIFICAÇÃO RÁPIDA NO BANCO

Execute estas queries no Prisma Studio:

### 1. Verificar se o bônus foi gerado

```sql
SELECT
  cbe.id,
  cbe.bonusAmount,
  cbe.quantity,
  pc.name as campanha,
  p.name as produto,
  u.name as vendedor
FROM "CampaignBonusEntry" cbe
JOIN "ProductCampaign" pc ON pc.id = cbe.campaignId
LEFT JOIN "SaleItem" si ON si.id = cbe.saleItemId
LEFT JOIN "Product" p ON p.id = si.productId
LEFT JOIN "User" u ON u.id = cbe.sellerUserId
WHERE cbe.saleId = 'cmluwoucg0004vei70x4kiyo1';
```

**Resultado esperado:**
- ✅ Se retornar 1 linha com bonusAmount = 100 → Bônus FOI gerado
- ❌ Se retornar VAZIO → Bônus NÃO foi gerado

---

### 2. Verificar dados da venda

```sql
SELECT
  s.id,
  s.code,
  s.status,
  s.sellerUserId,
  u.name as vendedor,
  s.branchId,
  TO_CHAR(s.createdAt, 'DD/MM/YYYY HH24:MI:SS') as data_hora
FROM "Sale" s
LEFT JOIN "User" u ON u.id = s.sellerUserId
WHERE s.id = 'cmluwoucg0004vei70x4kiyo1';
```

**Verificar:**
- ✅ status != 'CANCELLED'
- ✅ sellerUserId preenchido
- ✅ branchId válido

---

### 3. Verificar itens da venda

```sql
SELECT
  si.id,
  si.productId,
  p.name as produto,
  p.sku,
  si.qty,
  si.unitPrice,
  p.salePrice as preco_cadastro,
  si.unitPrice - p.salePrice as diferenca_preco
FROM "SaleItem" si
JOIN "Product" p ON p.id = si.productId
WHERE si.saleId = 'cmluwoucg0004vei70x4kiyo1';
```

**ATENÇÃO:** O sistema tem uma verificação de preço!

Se `diferenca_preco` > R$ 0,01 → Item NÃO é elegível para bônus

Isso é uma **proteção contra fraudes** (linha 669-675 do service)

**Motivo:** Se alguém vender com desconto muito grande, não deve ganhar bônus

---

### 4. Verificar campanhas ativas no momento da venda

```sql
SELECT
  pc.id,
  pc.name,
  pc.status,
  TO_CHAR(pc.startDate, 'DD/MM/YYYY') as inicio,
  TO_CHAR(pc.endDate, 'DD/MM/YYYY') as fim,
  pc.bonusType,
  pc.bonusPerUnit,
  pc.branchId
FROM "ProductCampaign" pc
WHERE pc.companyId = (SELECT companyId FROM "Sale" WHERE id = 'cmluwoucg0004vei70x4kiyo1')
  AND pc.status = 'ACTIVE'
ORDER BY pc.priority DESC;
```

**Verificar:**
- ✅ Campanha do Ray-Ban está na lista
- ✅ Datas cobrem a data da venda
- ✅ branchId = NULL ou corresponde à filial da venda

---

### 5. Verificar produtos da campanha

```sql
SELECT
  pci.id,
  pci.campaignId,
  pc.name as campanha,
  pci.productId,
  p.name as produto
FROM "ProductCampaignItem" pci
JOIN "ProductCampaign" pc ON pc.id = pci.campaignId
LEFT JOIN "Product" p ON p.id = pci.productId
WHERE pc.status = 'ACTIVE'
  AND pci.productId IN (
    SELECT productId FROM "SaleItem" WHERE saleId = 'cmluwoucg0004vei70x4kiyo1'
  );
```

**Resultado esperado:**
- ✅ Deve mostrar a campanha vinculada ao Ray-Ban

---

## 🎯 POSSÍVEIS CAUSAS

### Causa 1: Campanha não estava ATIVA no momento da venda ⭐ MAIS PROVÁVEL
**Sintoma:** Query 4 não retorna a campanha
**Solução:**
1. A venda JÁ FOI FEITA com status DRAFT
2. Depois você ATIVOU a campanha
3. Sistema NÃO reprocessa vendas antigas automaticamente

**COMO RESOLVER:**
Opção A: Fazer nova venda (recomendado)
Opção B: Reprocessar venda manualmente via script

---

### Causa 2: Preço de venda diferente do preço cadastrado
**Sintoma:** Query 3 mostra diferenca_preco > 0.01
**Motivo:** Proteção anti-fraude
**Solução:**
1. Verificar se preço de venda = preço cadastrado
2. Se vendeu com desconto, essa proteção é INTENCIONAL
3. Para permitir, precisaria remover essa validação

---

### Causa 3: Venda foi cancelada depois
**Sintoma:** Query 2 mostra status = 'CANCELLED'
**Solução:** Bônus é removido automaticamente ao cancelar

---

### Causa 4: Sem vendedor na venda
**Sintoma:** Query 2 mostra sellerUserId = NULL
**Solução:** Sistema precisa de vendedor para atribuir bônus

---

## 🔧 REPROCESSAR VENDA MANUALMENTE

Se a campanha foi ativada DEPOIS da venda, você pode reprocessar:

```typescript
// Execute no Prisma Studio ou via API
// Chamar função: processaSaleForCampaigns('cmluwoucg0004vei70x4kiyo1', 'COMPANY_ID')
```

Ou criar endpoint temporário:

```typescript
// src/app/api/debug/reprocess-sale/route.ts
import { processaSaleForCampaigns } from "@/services/product-campaign.service";

export async function POST(request: Request) {
  const { saleId, companyId } = await request.json();
  const result = await processaSaleForCampaigns(saleId, companyId);
  return Response.json(result);
}

// Chamar: POST /api/debug/reprocess-sale
// Body: { "saleId": "cmluwoucg0004vei70x4kiyo1", "companyId": "..." }
```

---

## ✅ PRÓXIMOS PASSOS

1. Execute Query 1 → Me diga se retornou algo
2. Execute Query 2 → Copie o resultado
3. Execute Query 3 → Copie diferenca_preco
4. Execute Query 4 → Me diga se campanha aparece

Com esses resultados eu te digo EXATAMENTE qual foi o problema!
