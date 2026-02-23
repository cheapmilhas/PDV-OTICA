"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Gift, Users, TrendingUp, TrendingDown } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

interface CashbackConfig {
  id: string;
  isActive: boolean;
  earnPercent: number;
  minPurchaseToEarn: number;
  maxCashbackPerSale: number | null;
  expirationDays: number | null;
  minPurchaseMultiplier: number;
  maxUsagePercent: number;
  birthdayMultiplier: number;
  birthdayDaysRange: number;
}

interface Summary {
  config: CashbackConfig;
  totalBalance: number;
  activeCustomers: number;
  earnedThisMonth: number;
  usedThisMonth: number;
}

function CashbackConfigPageContent() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [config, setConfig] = useState<CashbackConfig>({
    id: "",
    isActive: true,
    earnPercent: 5,
    minPurchaseToEarn: 0,
    maxCashbackPerSale: null,
    expirationDays: null,
    minPurchaseMultiplier: 2,
    maxUsagePercent: 50,
    birthdayMultiplier: 2,
    birthdayDaysRange: 7,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [configRes, summaryRes] = await Promise.all([
        fetch("/api/cashback/config"),
        fetch("/api/cashback/summary"),
      ]);

      if (!configRes.ok || !summaryRes.ok) {
        throw new Error("Erro ao carregar dados");
      }

      const configData = await configRes.json();
      const summaryData = await summaryRes.json();

      // Mapear campos do backend para o frontend
      const backendConfig = configData.data;
      setConfig({
        id: backendConfig.id,
        isActive: backendConfig.enabled,
        earnPercent: Number(backendConfig.earnPercent),
        minPurchaseToEarn: Number(backendConfig.minPurchaseToEarn),
        maxCashbackPerSale: backendConfig.maxCashbackPerSale
          ? Number(backendConfig.maxCashbackPerSale)
          : null,
        expirationDays: backendConfig.expirationDays,
        minPurchaseMultiplier: Number(backendConfig.minPurchaseMultiplier),
        maxUsagePercent: Number(backendConfig.maxUsagePercent),
        birthdayMultiplier: Number(backendConfig.birthdayMultiplier),
        birthdayDaysRange: 7, // Campo não existe no schema, usar valor padrão
      });
      setSummary(summaryData.data);
    } catch (error) {
      toast({
        title: "Erro ao carregar configurações",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const response = await fetch("/api/cashback/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || errorData.message || "Erro ao salvar configurações");
      }

      toast({
        title: "Configurações salvas",
        description: "As configurações de cashback foram atualizadas com sucesso",
      });

      await loadData();
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configurações de Cashback</h1>
        <p className="text-muted-foreground mt-2">
          Configure as regras do programa de cashback da sua ótica
        </p>
      </div>

      {/* Cards de Resumo */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Total</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary?.totalBalance || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Cashback disponível dos clientes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.activeCustomers || 0}</div>
            <p className="text-xs text-muted-foreground">
              Com saldo de cashback
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ganho no Mês</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(summary?.earnedThisMonth || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Cashback gerado em vendas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usado no Mês</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(summary?.usedThisMonth || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Cashback utilizado pelos clientes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Configurações */}
      <Card>
        <CardHeader>
          <CardTitle>Regras de Acúmulo</CardTitle>
          <CardDescription>
            Configure como os clientes ganham cashback nas compras
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="isActive">Sistema Ativo</Label>
              <p className="text-sm text-muted-foreground">
                Ativar ou desativar o programa de cashback
              </p>
            </div>
            <Switch
              id="isActive"
              checked={config.isActive}
              onCheckedChange={(checked) =>
                setConfig({ ...config, isActive: checked })
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="earnPercent">Percentual de Ganho (%)</Label>
              <Input
                id="earnPercent"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={config.earnPercent}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    earnPercent: parseFloat(e.target.value),
                  })
                }
              />
              <p className="text-sm text-muted-foreground">
                Porcentagem do valor da compra que vira cashback
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="minPurchaseToEarn">
                Compra Mínima para Ganhar (R$)
              </Label>
              <Input
                id="minPurchaseToEarn"
                type="number"
                min="0"
                step="0.01"
                value={config.minPurchaseToEarn}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    minPurchaseToEarn: parseFloat(e.target.value),
                  })
                }
              />
              <p className="text-sm text-muted-foreground">
                Valor mínimo de compra para gerar cashback
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxCashbackPerSale">
                Cashback Máximo por Venda (R$)
              </Label>
              <Input
                id="maxCashbackPerSale"
                type="number"
                min="0"
                step="0.01"
                value={config.maxCashbackPerSale || ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    maxCashbackPerSale: e.target.value
                      ? parseFloat(e.target.value)
                      : null,
                  })
                }
                placeholder="Sem limite"
              />
              <p className="text-sm text-muted-foreground">
                Limite máximo de cashback por venda (opcional)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expirationDays">Expiração (dias)</Label>
              <Input
                id="expirationDays"
                type="number"
                min="0"
                step="1"
                value={config.expirationDays || ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    expirationDays: e.target.value
                      ? parseInt(e.target.value)
                      : null,
                  })
                }
                placeholder="Nunca expira"
              />
              <p className="text-sm text-muted-foreground">
                Dias até o cashback expirar (opcional)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regras de Uso</CardTitle>
          <CardDescription>
            Configure como os clientes podem usar o cashback acumulado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="minPurchaseMultiplier">
                Multiplicador de Compra Mínima
              </Label>
              <Input
                id="minPurchaseMultiplier"
                type="number"
                min="1"
                max="10"
                step="0.1"
                value={config.minPurchaseMultiplier}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    minPurchaseMultiplier: parseFloat(e.target.value),
                  })
                }
              />
              <p className="text-sm text-muted-foreground">
                Cliente pode usar até {config.minPurchaseMultiplier}x o valor da
                compra
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxUsagePercent">Uso Máximo (%)</Label>
              <Input
                id="maxUsagePercent"
                type="number"
                min="0"
                max="100"
                step="1"
                value={config.maxUsagePercent}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    maxUsagePercent: parseFloat(e.target.value),
                  })
                }
              />
              <p className="text-sm text-muted-foreground">
                Máximo de {config.maxUsagePercent}% do valor da venda pode ser
                pago com cashback
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bônus de Aniversário</CardTitle>
          <CardDescription>
            Configure o bônus especial para clientes no mês de aniversário
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="birthdayMultiplier">
                Multiplicador de Aniversário
              </Label>
              <Input
                id="birthdayMultiplier"
                type="number"
                min="1"
                max="10"
                step="0.1"
                value={config.birthdayMultiplier}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    birthdayMultiplier: parseFloat(e.target.value),
                  })
                }
              />
              <p className="text-sm text-muted-foreground">
                Cashback multiplicado por {config.birthdayMultiplier}x no
                aniversário
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="birthdayDaysRange">
                Dias de Validade do Bônus
              </Label>
              <Input
                id="birthdayDaysRange"
                type="number"
                min="0"
                max="30"
                step="1"
                value={config.birthdayDaysRange}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    birthdayDaysRange: parseInt(e.target.value),
                  })
                }
              />
              <p className="text-sm text-muted-foreground">
                Bônus válido {config.birthdayDaysRange} dias antes e depois do
                aniversário
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exemplo Prático */}
      <Card>
        <CardHeader>
          <CardTitle>Exemplo Prático</CardTitle>
          <CardDescription>
            Veja como funciona com as configurações atuais
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">
            • Compra de R$ 1.000,00 gera{" "}
            <strong>{formatCurrency((1000 * config.earnPercent) / 100)}</strong>{" "}
            de cashback
          </p>
          <p className="text-sm">
            • No aniversário, a mesma compra gera{" "}
            <strong>
              {formatCurrency(
                (1000 * config.earnPercent * config.birthdayMultiplier) / 100
              )}
            </strong>
          </p>
          <p className="text-sm">
            • Em uma compra de R$ 500,00, pode usar até{" "}
            <strong>
              {formatCurrency((500 * config.maxUsagePercent) / 100)}
            </strong>{" "}
            de cashback ({config.maxUsagePercent}%)
          </p>
          {config.expirationDays && (
            <p className="text-sm">
              • Cashback expira após{" "}
              <strong>{config.expirationDays} dias</strong> sem uso
            </p>
          )}
        </CardContent>
      </Card>

      {/* Botão Salvar */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}

export default function CashbackConfigPage() {
  return (
    <ProtectedRoute permission="settings.edit">
      <CashbackConfigPageContent />
    </ProtectedRoute>
  );
}
