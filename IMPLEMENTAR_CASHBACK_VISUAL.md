# 💰 GUIA DE IMPLEMENTAÇÃO: CASHBACK VISUAL COMPLETO

> **Status:** APIs criadas ✅ | PDV atualizado ✅ | Faltam: Detalhes da Venda e Cliente

---

## ✅ JÁ IMPLEMENTADO

### 1. APIs Criadas/Atualizadas:
- ✅ `/api/sales/[id]/cashback/route.ts` - Buscar cashback de uma venda
- ✅ `/api/cashback/customer/[customerId]/route.ts` - Usa a rota existente

### 2. PDV Atualizado:
- ✅ Toast mostra cashback ganho após finalizar venda
- ✅ Busca automática do cashback gerado
- ✅ Mensagem personalizada com valor

---

## 🔨 FALTA IMPLEMENTAR

### PARTE 3: Card de Cashback na Página de Detalhes da Venda

**Arquivo:** `src/app/(dashboard)/dashboard/vendas/[id]/detalhes/page.tsx`

#### 3.1. Adicionar imports no topo:
```typescript
import { Gift, Calendar } from "lucide-react";
```

#### 3.2. Adicionar estado (após os outros useState):
```typescript
const [cashbackInfo, setCashbackInfo] = useState<any>(null);
```

#### 3.3. Adicionar useEffect para buscar cashback (após outros useEffects):
```typescript
// Buscar cashback da venda
useEffect(() => {
  const fetchCashback = async () => {
    if (!venda?.id) return;
    try {
      const res = await fetch(`/api/sales/${venda.id}/cashback`);
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          setCashbackInfo(data.data);
        }
      }
    } catch (e) {
      console.log("Cashback não disponível");
    }
  };
  fetchCashback();
}, [venda?.id]);
```

#### 3.4. Adicionar Card de Cashback no JSX (procure onde ficam os cards de resumo e adicione após eles):
```tsx
{/* Card de Cashback Gerado */}
{cashbackInfo && cashbackInfo.amount > 0 && (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg">
        <Gift className="h-5 w-5 text-green-600" />
        Cashback Gerado
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
        <div>
          <p className="text-sm text-muted-foreground">Valor Creditado</p>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(Number(cashbackInfo.amount))}
          </p>
        </div>
        {cashbackInfo.expiresAt && (
          <div className="text-right">
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Válido até
            </p>
            <p className="text-sm font-medium">
              {new Date(cashbackInfo.expiresAt).toLocaleDateString("pt-BR")}
            </p>
          </div>
        )}
      </div>
      {venda?.customer && (
        <div className="text-sm text-muted-foreground text-center p-2 bg-muted/50 rounded">
          💰 Este cashback foi creditado na conta de <strong>{venda.customer.name}</strong>
        </div>
      )}
    </CardContent>
  </Card>
)}
```

---

### PARTE 4: Aba de Cashback no Cadastro do Cliente

**Arquivo:** `src/app/(dashboard)/dashboard/clientes/[id]/page.tsx`

#### 4.1. Adicionar imports:
```typescript
import { Wallet, Gift, TrendingUp, TrendingDown, Clock, AlertTriangle } from "lucide-react";
```

#### 4.2. Adicionar estado:
```typescript
const [cashbackData, setCashbackData] = useState<{
  balance: number;
  totalEarned: number;
  totalUsed: number;
  totalExpired: number;
  expiringAmount: number;
  expiringDate: string | null;
  movements: any[];
} | null>(null);
```

#### 4.3. Adicionar useEffect:
```typescript
// Buscar dados de cashback
useEffect(() => {
  const fetchCashback = async () => {
    if (!cliente?.id) return;
    try {
      const res = await fetch(`/api/cashback/customer/${cliente.id}`);
      if (res.ok) {
        const data = await res.json();
        setCashbackData(data.data);
      }
    } catch (e) {
      console.log("Cashback não disponível");
    }
  };
  fetchCashback();
}, [cliente?.id]);
```

#### 4.4. Adicionar Tab no TabsList (encontre onde estão as outras tabs):
```tsx
<TabsTrigger value="cashback" className="gap-2">
  <Wallet className="h-4 w-4" />
  Cashback
  {cashbackData && cashbackData.balance > 0 && (
    <Badge variant="secondary" className="ml-2">
      {formatCurrency(cashbackData.balance)}
    </Badge>
  )}
</TabsTrigger>
```

#### 4.5. Adicionar TabsContent completo (procure onde ficam os outros TabsContent e adicione):

```tsx
<TabsContent value="cashback" className="space-y-4">
  {cashbackData ? (
    <>
      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Saldo Disponível */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4 text-green-600" />
              Saldo Disponível
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(cashbackData.balance)}
            </p>
          </CardContent>
        </Card>

        {/* Total Ganho */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              Total Ganho
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              {formatCurrency(cashbackData.totalEarned)}
            </p>
          </CardContent>
        </Card>

        {/* Total Usado */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-purple-600" />
              Total Usado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-purple-600">
              {formatCurrency(cashbackData.totalUsed)}
            </p>
          </CardContent>
        </Card>

        {/* Expirado */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-600" />
              Expirado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-600">
              {formatCurrency(cashbackData.totalExpired)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alerta de Expiração */}
      {cashbackData.expiringAmount > 0 && (
        <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                ⚠️ {formatCurrency(cashbackData.expiringAmount)} expirando em breve
              </p>
              {cashbackData.expiringDate && (
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  Válido até {new Date(cashbackData.expiringDate).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Histórico de Movimentações */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Movimentações</CardTitle>
        </CardHeader>
        <CardContent>
          {cashbackData.movements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wallet className="h-12 w-12 mx-auto opacity-20 mb-2" />
              Nenhuma movimentação de cashback
            </div>
          ) : (
            <div className="space-y-2">
              {cashbackData.movements.map((mov: any) => (
                <div
                  key={mov.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      mov.type === "CREDIT" ? "bg-green-100 text-green-600" :
                      mov.type === "DEBIT" ? "bg-blue-100 text-blue-600" :
                      mov.type === "EXPIRED" ? "bg-gray-100 text-gray-600" :
                      "bg-purple-100 text-purple-600"
                    }`}>
                      {mov.type === "CREDIT" && <TrendingUp className="h-4 w-4" />}
                      {mov.type === "DEBIT" && <TrendingDown className="h-4 w-4" />}
                      {mov.type === "EXPIRED" && <Clock className="h-4 w-4" />}
                      {mov.type === "BONUS" && <Gift className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {mov.type === "CREDIT" && "Cashback de Compra"}
                        {mov.type === "DEBIT" && "Uso de Cashback"}
                        {mov.type === "EXPIRED" && "Cashback Expirado"}
                        {mov.type === "BONUS" && "Bônus"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(mov.createdAt).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${
                      mov.type === "CREDIT" || mov.type === "BONUS" ? "text-green-600" :
                      mov.type === "DEBIT" ? "text-blue-600" :
                      "text-gray-500"
                    }`}>
                      {mov.type === "CREDIT" || mov.type === "BONUS" ? "+" : "-"}
                      {formatCurrency(Number(mov.amount))}
                    </p>
                    {mov.expiresAt && mov.type === "CREDIT" && (
                      <p className="text-xs text-muted-foreground">
                        Expira: {new Date(mov.expiresAt).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  ) : (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <Wallet className="h-12 w-12 mx-auto opacity-20 mb-2" />
        <p className="text-muted-foreground">Carregando informações de cashback...</p>
      </div>
    </div>
  )}
</TabsContent>
```

---

## 🧪 COMO TESTAR APÓS IMPLEMENTAR

### 1. Testar no PDV:
1. Adicione produtos ao carrinho
2. Selecione um cliente
3. Finalize a venda
4. **Resultado esperado:** Toast mostra "💰 Cliente ganhou R$ X de cashback"

### 2. Testar na página de detalhes da venda:
1. Acesse qualquer venda que tenha cliente
2. **Resultado esperado:** Card verde "Cashback Gerado" aparece

### 3. Testar na página do cliente:
1. Acesse um cliente que tenha feito compras
2. Clique na aba "Cashback"
3. **Resultado esperado:** Cards de resumo + histórico completo

---

## 📦 COMMIT E DEPLOY

Após implementar tudo:

```bash
npm run build
git add .
git commit -m "feat: implementar visualização completa de cashback

- Toast no PDV mostrando cashback ganho após venda
- Card de cashback na página de detalhes da venda
- Aba de cashback completa no cadastro do cliente
- Histórico de movimentações com ícones e cores
- Alerta de cashback próximo a expirar
- APIs criadas para buscar dados de cashback"

git push origin main
vercel --prod --yes
```

---

## ✅ CHECKLIST

- [x] API `/api/sales/[id]/cashback` criada
- [x] API `/api/cashback/customer/[id]` criada
- [x] Toast no PDV com cashback
- [ ] Card na página de detalhes da venda (IMPLEMENTAR)
- [ ] Aba de cashback no cadastro do cliente (IMPLEMENTAR)

---

**Implemente as partes 3 e 4 e me avise quando terminar!** 🚀
