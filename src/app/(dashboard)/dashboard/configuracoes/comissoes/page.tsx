"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Percent, DollarSign, Award } from "lucide-react";

export default function CommissionConfigPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [basePercent, setBasePercent] = useState("5");
  const [bonusPercent, setBonusPercent] = useState("2");

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch("/api/goals/config");
      const result = await response.json();

      if (result.success) {
        setBasePercent(String(result.data.baseCommissionPercent));
        setBonusPercent(String(result.data.goalBonusPercent));
      }
    } catch (error) {
      console.error("Erro ao carregar:", error);
      toast({ title: "Erro", description: "Erro ao carregar configurações", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/goals/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseCommissionPercent: parseFloat(basePercent),
          goalBonusPercent: parseFloat(bonusPercent),
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({ title: "Sucesso", description: "Configurações salvas" });
      } else {
        toast({ title: "Erro", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Exemplo de cálculo
  const exampleSale = 10000;
  const baseComm = exampleSale * (parseFloat(basePercent) || 0) / 100;
  const bonusComm = exampleSale * (parseFloat(bonusPercent) || 0) / 100;
  const totalComm = baseComm + bonusComm;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Percent className="h-6 w-6" />
            Configuração de Comissões
          </h1>
          <p className="text-muted-foreground">
            Defina os percentuais de comissão da equipe
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar Configurações
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Comissão Base */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Comissão Base</CardTitle>
                <CardDescription>
                  Percentual aplicado sobre todas as vendas
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Percentual (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={basePercent}
                onChange={(e) => setBasePercent(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Todo vendedor recebe este percentual sobre suas vendas
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Bônus por Meta */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Award className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Bônus por Meta</CardTitle>
                <CardDescription>
                  Percentual adicional ao atingir a meta
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Percentual (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={bonusPercent}
                onChange={(e) => setBonusPercent(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Adicional quando o vendedor atinge sua meta individual
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Exemplo de Cálculo */}
      <Card>
        <CardHeader>
          <CardTitle>Exemplo de Cálculo</CardTitle>
          <CardDescription>
            Simulação com vendas de R$ {exampleSale.toLocaleString("pt-BR")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-muted-foreground">Comissão Base ({basePercent}%)</p>
              <p className="text-xl font-bold text-blue-600">
                R$ {baseComm.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-muted-foreground">Bônus Meta ({bonusPercent}%)</p>
              <p className="text-xl font-bold text-green-600">
                + R$ {bonusComm.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-muted-foreground">Total (se atingir meta)</p>
              <p className="text-xl font-bold text-purple-600">
                R$ {totalComm.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
