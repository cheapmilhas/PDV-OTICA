"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bell, Cake, UserX, Gift } from "lucide-react";

interface ReminderConfig {
  id?: string;
  prescriptionReminderEnabled: boolean;
  prescriptionReminderDays: number;
  prescriptionValidityMonths: number;
  inactiveReminderEnabled: boolean;
  inactiveAfterDays: number;
  birthdayReminderEnabled: boolean;
  birthdayReminderDaysBefore: number;
  cashbackExpiringReminderEnabled: boolean;
  cashbackExpiringDaysBefore: number;
}

export default function RemindersConfigPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ReminderConfig>({
    prescriptionReminderEnabled: true,
    prescriptionReminderDays: 30,
    prescriptionValidityMonths: 12,
    inactiveReminderEnabled: true,
    inactiveAfterDays: 180,
    birthdayReminderEnabled: true,
    birthdayReminderDaysBefore: 0,
    cashbackExpiringReminderEnabled: true,
    cashbackExpiringDaysBefore: 7,
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/reminders/config");

      if (!response.ok) {
        throw new Error("Erro ao carregar configurações");
      }

      const data = await response.json();
      setConfig(data.data);
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

      const response = await fetch("/api/reminders/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao salvar configurações");
      }

      toast({
        title: "Configurações salvas",
        description: "As configurações de lembretes foram atualizadas com sucesso",
      });

      await loadConfig();
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
        <h1 className="text-3xl font-bold">Configurações de Lembretes</h1>
        <p className="text-muted-foreground mt-2">
          Configure os tipos de lembretes e quando devem ser gerados
        </p>
      </div>

      {/* Lembretes de Receita */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-500" />
            <CardTitle>Lembretes de Receita</CardTitle>
          </div>
          <CardDescription>
            Notificar clientes quando a receita oftálmica estiver vencendo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="prescriptionEnabled">Ativar Lembretes</Label>
              <p className="text-sm text-muted-foreground">
                Gerar lembretes automáticos de receita vencendo
              </p>
            </div>
            <Switch
              id="prescriptionEnabled"
              checked={config.prescriptionReminderEnabled}
              onCheckedChange={(checked) =>
                setConfig({ ...config, prescriptionReminderEnabled: checked })
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prescriptionReminderDays">
                Avisar Quantos Dias Antes (dias)
              </Label>
              <Input
                id="prescriptionReminderDays"
                type="number"
                min="1"
                max="90"
                value={config.prescriptionReminderDays}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    prescriptionReminderDays: parseInt(e.target.value) || 30,
                  })
                }
                disabled={!config.prescriptionReminderEnabled}
              />
              <p className="text-sm text-muted-foreground">
                Alertar {config.prescriptionReminderDays} dias antes da receita vencer
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prescriptionValidityMonths">
                Validade da Receita (meses)
              </Label>
              <Input
                id="prescriptionValidityMonths"
                type="number"
                min="1"
                max="24"
                value={config.prescriptionValidityMonths}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    prescriptionValidityMonths: parseInt(e.target.value) || 12,
                  })
                }
                disabled={!config.prescriptionReminderEnabled}
              />
              <p className="text-sm text-muted-foreground">
                Receitas são válidas por {config.prescriptionValidityMonths} meses
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lembretes de Aniversário */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cake className="h-5 w-5 text-pink-500" />
            <CardTitle>Lembretes de Aniversário</CardTitle>
          </div>
          <CardDescription>
            Enviar felicitações de aniversário para clientes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="birthdayEnabled">Ativar Lembretes</Label>
              <p className="text-sm text-muted-foreground">
                Gerar lembretes de aniversário dos clientes
              </p>
            </div>
            <Switch
              id="birthdayEnabled"
              checked={config.birthdayReminderEnabled}
              onCheckedChange={(checked) =>
                setConfig({ ...config, birthdayReminderEnabled: checked })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="birthdayReminderDaysBefore">
              Avisar Quantos Dias Antes (dias)
            </Label>
            <Input
              id="birthdayReminderDaysBefore"
              type="number"
              min="0"
              max="7"
              value={config.birthdayReminderDaysBefore}
              onChange={(e) =>
                setConfig({
                  ...config,
                  birthdayReminderDaysBefore: parseInt(e.target.value) || 0,
                })
              }
              disabled={!config.birthdayReminderEnabled}
            />
            <p className="text-sm text-muted-foreground">
              {config.birthdayReminderDaysBefore === 0
                ? "Lembrar no dia do aniversário"
                : `Lembrar ${config.birthdayReminderDaysBefore} dias antes do aniversário`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Lembretes de Inatividade */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-orange-500" />
            <CardTitle>Lembretes de Reativação</CardTitle>
          </div>
          <CardDescription>
            Contatar clientes que não compram há muito tempo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="inactiveEnabled">Ativar Lembretes</Label>
              <p className="text-sm text-muted-foreground">
                Gerar lembretes de clientes inativos
              </p>
            </div>
            <Switch
              id="inactiveEnabled"
              checked={config.inactiveReminderEnabled}
              onCheckedChange={(checked) =>
                setConfig({ ...config, inactiveReminderEnabled: checked })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="inactiveAfterDays">
              Considerar Inativo Após (dias)
            </Label>
            <Input
              id="inactiveAfterDays"
              type="number"
              min="30"
              max="365"
              value={config.inactiveAfterDays}
              onChange={(e) =>
                setConfig({
                  ...config,
                  inactiveAfterDays: parseInt(e.target.value) || 180,
                })
              }
              disabled={!config.inactiveReminderEnabled}
            />
            <p className="text-sm text-muted-foreground">
              Clientes sem comprar há {config.inactiveAfterDays} dias (
              {Math.floor(config.inactiveAfterDays / 30)} meses)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Lembretes de Cashback Expirando */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-purple-500" />
            <CardTitle>Lembretes de Cashback Expirando</CardTitle>
          </div>
          <CardDescription>
            Avisar clientes quando o cashback estiver prestes a expirar
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="cashbackEnabled">Ativar Lembretes</Label>
              <p className="text-sm text-muted-foreground">
                Gerar lembretes de cashback expirando
              </p>
            </div>
            <Switch
              id="cashbackEnabled"
              checked={config.cashbackExpiringReminderEnabled}
              onCheckedChange={(checked) =>
                setConfig({ ...config, cashbackExpiringReminderEnabled: checked })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cashbackExpiringDaysBefore">
              Avisar Quantos Dias Antes (dias)
            </Label>
            <Input
              id="cashbackExpiringDaysBefore"
              type="number"
              min="1"
              max="30"
              value={config.cashbackExpiringDaysBefore}
              onChange={(e) =>
                setConfig({
                  ...config,
                  cashbackExpiringDaysBefore: parseInt(e.target.value) || 7,
                })
              }
              disabled={!config.cashbackExpiringReminderEnabled}
            />
            <p className="text-sm text-muted-foreground">
              Alertar {config.cashbackExpiringDaysBefore} dias antes do cashback expirar
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Exemplo Prático */}
      <Card>
        <CardHeader>
          <CardTitle>Como Funciona</CardTitle>
          <CardDescription>
            Os lembretes serão gerados automaticamente de acordo com as configurações
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {config.prescriptionReminderEnabled && (
            <p>
              • Receitas vencendo em até {config.prescriptionReminderDays} dias gerarão
              lembretes
            </p>
          )}
          {config.birthdayReminderEnabled && (
            <p>
              • Aniversários {config.birthdayReminderDaysBefore === 0 ? "hoje" : `em ${config.birthdayReminderDaysBefore} dias`} gerarão lembretes
            </p>
          )}
          {config.inactiveReminderEnabled && (
            <p>
              • Clientes sem comprar há mais de {config.inactiveAfterDays} dias (
              {Math.floor(config.inactiveAfterDays / 30)} meses) gerarão lembretes
            </p>
          )}
          {config.cashbackExpiringReminderEnabled && (
            <p>
              • Cashback expirando em até {config.cashbackExpiringDaysBefore} dias gerará
              lembretes
            </p>
          )}
          <p className="text-muted-foreground mt-4">
            Clique em "Gerar Lembretes" na página principal para criar novos lembretes
            com base nestas configurações.
          </p>
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
