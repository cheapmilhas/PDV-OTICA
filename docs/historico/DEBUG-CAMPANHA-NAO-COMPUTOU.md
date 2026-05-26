# 🔍 DEBUG: Campanha não computou bônus de R$ 100

## 📊 INFORMAÇÕES NECESSÁRIAS

Para diagnosticar, preciso que você me forneça:

### 1. ID da Venda
```
Onde encontrar: No PDV após finalizar a venda, ou em Vendas → Histórico
Exemplo: clxxxxxxxx
```

### 2. ID da Campanha
```
Onde encontrar: Dashboard → Campanhas → lista de campanhas
Exemplo: clxxxxxxxx
```

### 3. ID do Produto vendido
```
Onde encontrar: Cadastro de Produtos
Exemplo: clxxxxxxxx
```

---

## 🧪 QUERIES DE DIAGNÓSTICO

### Execute no Prisma Studio ou banco de dados:

#### 1. Verificar se a campanha está ATIVA
```sql
SELECT
  id,
  name,
  status,
  scope,
  bonusType,
  startDate,
  endDate,
  branchId
FROM "ProductCampaign"
WHERE id = 'ID_DA_CAMPANHA';
```

**Verificar:**
- ✅ status = 'ACTIVE'
- ✅ startDate <= AGORA
- ✅ endDate >= AGORA
- ✅ branchId = NULL OU branchId da venda

---

#### 2. Verificar PRODUTOS configurados na campanha
```sql
SELECT
  id,
  productId,
  categoryId,
  brandId,
  supplierId
FROM "ProductCampaignItem"
WHERE campaignId = 'ID_DA_CAMPANHA';
```

**Verificar:**
- ✅ Existe ao menos 1 registro
- ✅ Se productId preenchido: deve ser o ID do produto vendido
- ✅ Se categoryId preenchido: deve ser a categoria do produto vendido
- ✅ Se brandId preenchido: deve ser a marca do produto vendido

**Se retornar VAZIO:** Campanha sem produtos = não gera bônus (por design)

---

#### 3. Verificar dados do PRODUTO vendido
```sql
SELECT
  id,
  name,
  categoryId,
  brandId,
  supplierId
FROM "Product"
WHERE id = 'ID_DO_PRODUTO';
```

**Anotar:** categoryId, brandId, supplierId para comparar com a campanha

---

#### 4. Verificar ITENS da venda
```sql
SELECT
  si.id,
  si.saleId,
  si.productId,
  si.qty,
  p.name as productName,
  p.categoryId,
  p.brandId,
  p.supplierId
FROM "SaleItem" si
JOIN "Product" p ON p.id = si.productId
WHERE si.saleId = 'ID_DA_VENDA';
```

**Verificar:**
- ✅ Produto vendido está na lista
- ✅ qty > 0

---

#### 5. Verificar se já existe BÔNUS gerado
```sql
SELECT
  cbe.id,
  cbe.campaignId,
  cbe.saleId,
  cbe.saleItemId,
  cbe.bonusAmount,
  cbe.sellerUserId,
  cbe.branchId,
  pc.name as campaignName
FROM "CampaignBonusEntry" cbe
JOIN "ProductCampaign" pc ON pc.id = cbe.campaignId
WHERE cbe.saleId = 'ID_DA_VENDA';
```

**Verificar:**
- ✅ Se retornar registros = bônus FOI gerado (verificar valores)
- ❌ Se retornar VAZIO = bônus NÃO foi gerado (problema!)

---

#### 6. Verificar LOGS do servidor (Vercel)

```
1. Acessar: https://vercel.com/dashboard
2. Ir no projeto PDV-OTICA
3. Clicar em "Functions"
4. Procurar logs próximos ao horário da venda
5. Buscar por:
   - "🎯 Processando campanhas para venda"
   - "✅ Campanhas processadas"
   - "❌ Erro ao processar campanhas"
```

---

## 🔍 POSSÍVEIS CAUSAS

### Causa 1: Campanha sem produtos configurados
**Sintoma:** Query 2 retorna vazio
**Solução:**
1. Editar campanha
2. Adicionar produtos elegíveis
3. Salvar
4. Fazer nova venda teste

---

### Causa 2: Produto não corresponde aos filtros
**Sintoma:**
- Query 2 retorna registros
- Mas productId/categoryId/brandId não correspondem ao produto vendido

**Exemplo:**
```
Campanha configurada: productId = "produto_X"
Produto vendido: "produto_Y"
Resultado: Não corresponde = sem bônus
```

**Solução:**
1. Verificar qual produto foi configurado na campanha
2. Verificar qual produto foi vendido
3. Se diferente, editar campanha ou vender produto correto

---

### Causa 3: Datas fora do período
**Sintoma:** Query 1 mostra startDate > AGORA ou endDate < AGORA
**Solução:**
1. Editar campanha
2. Ajustar datas
3. Fazer nova venda teste

---

### Causa 4: Status não ACTIVE
**Sintoma:** Query 1 mostra status = 'DRAFT' ou 'PAUSED'
**Solução:**
1. Ativar campanha
2. Fazer nova venda teste

---

### Causa 5: Branch não corresponde
**Sintoma:**
- Campanha tem branchId específico
- Venda foi feita em outra filial

**Solução:**
1. Editar campanha e remover branchId (deixar NULL para todas filiais)
2. OU fazer venda na filial correta

---

### Causa 6: Erro de cálculo (bonusAmount = 0)
**Sintoma:**
- Tudo OK mas bonusAmount calculado = 0
- Possível se minimumCount não foi atingido

**Exemplo:**
```
Tipo: MINIMUM_FIXED
minimumCount: 5 unidades
Vendido: 2 unidades
Resultado: Não atingiu mínimo = R$ 0
```

**Solução:**
1. Verificar configuração da campanha (tipo, minimumCount, etc)
2. Vender quantidade suficiente

---

### Causa 7: Limite atingido
**Sintoma:** Campanha tem limite diário/mensal e já foi atingido
**Solução:**
1. Verificar limites da campanha
2. Aumentar ou remover limites
3. Aguardar próximo período

---

### Causa 8: Conflito de stacking
**Sintoma:**
- allowStacking = false
- Já existe outro bônus na mesma venda
**Solução:**
1. Editar campanha e marcar allowStacking = true
2. OU remover outras campanhas conflitantes

---

## 🧪 TESTE MANUAL COMPLETO

### Passo a passo para criar venda teste:

```
1. Criar campanha nova:
   - Nome: "TESTE DEBUG 100 REAIS"
   - Tipo: PER_UNIT
   - Bônus por unidade: R$ 100
   - Datas: HOJE até daqui 7 dias
   - Produto: Selecionar produto específico (anotar qual)
   - Status: ATIVAR

2. Fazer venda:
   - PDV → Nova venda
   - Adicionar O MESMO produto configurado
   - Quantidade: 1
   - Finalizar venda
   - Anotar ID da venda

3. Aguardar 5 segundos

4. Verificar:
   - Executar Query 5 (verificar bônus)
   - Deve retornar 1 registro com bonusAmount = 100

5. Se não funcionar:
   - Executar TODAS as queries acima
   - Anotar resultados
   - Enviar para análise
```

---

## 📋 CHECKLIST DE VERIFICAÇÃO

Marque cada item após verificar:

- [ ] Query 1: Campanha está ACTIVE
- [ ] Query 1: Datas válidas (hoje entre start e end)
- [ ] Query 1: branchId NULL ou corresponde à venda
- [ ] Query 2: Campanha TEM produtos configurados
- [ ] Query 2: productId/categoryId/brandId corresponde ao vendido
- [ ] Query 3: Produto existe e está ativo
- [ ] Query 4: Venda tem itens com qty > 0
- [ ] Query 5: Bônus FOI ou NÃO FOI gerado
- [ ] Logs do Vercel: Verificar se há erros

---

## 🆘 SE AINDA NÃO FUNCIONAR

**Forneça estas informações:**

```
1. ID da Campanha: _______________
2. ID da Venda: _______________
3. ID do Produto vendido: _______________

4. Resultado Query 1 (status da campanha):
   [copiar aqui]

5. Resultado Query 2 (produtos da campanha):
   [copiar aqui]

6. Resultado Query 3 (dados do produto):
   [copiar aqui]

7. Resultado Query 4 (itens da venda):
   [copiar aqui]

8. Resultado Query 5 (bônus gerados):
   [copiar aqui]

9. Logs do Vercel (se houver):
   [copiar aqui]
```

Com essas informações consigo identificar o problema exato!
