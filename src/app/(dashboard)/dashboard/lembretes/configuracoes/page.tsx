"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

const SEGMENTS = [
  { key: "BIRTHDAY", label: "🎂 Aniversário", defaultMessage: "Olá {{primeiro_nome}}! 🎂\n\nHoje é seu dia especial e a {{nome_empresa}} quer te parabenizar!\n\nPreparamos um presente: 15% de desconto em qualquer compra! Válido até o final do mês.\n\nTe esperamos! 👓" },
  { key: "POST_SALE_30_DAYS", label: "📦 Pós-Venda 30 dias", defaultMessage: "Oi {{primeiro_nome}}! 👓\n\nPassando para saber se está tudo certo com seu(s) {{produto_comprado}}!\n\nSe precisar de qualquer ajuste, estamos à disposição! 😊" },
  { key: "POST_SALE_90_DAYS", label: "📦 Pós-Venda 90 dias", defaultMessage: "Oi {{primeiro_nome}}! 👋\n\nJá faz 3 meses da sua última compra! Como está seu {{produto_comprado}}?\n\nSe precisar de algo, estamos aqui! 😊" },
  { key: "INACTIVE_6_MONTHS", label: "⏰ Cliente Inativo - 6 Meses", defaultMessage: "Oi {{primeiro_nome}}, tudo bem? 👋\n\nFaz 6 meses que não te vemos! Sua última visita foi em {{ultima_compra}}.\n\nVem nos visitar! Temos novidades que você vai adorar! 👓" },
  { key: "INACTIVE_1_YEAR", label: "⏰ Cliente Inativo - 1 Ano", defaultMessage: "Oi {{primeiro_nome}}, tudo bem? 👋\n\nFaz tempo que você não aparece por aqui! Sua última visita foi em {{ultima_compra}}.\n\nTemos novidades incríveis e sentimos sua falta! Quando pode dar uma passada? 😊" },
  { key: "INACTIVE_2_YEARS", label: "⏰ Cliente Inativo - 2 Anos", defaultMessage: "{{nome}}, que saudade! 💙\n\nJá faz {{dias_sem_comprar}} dias que você não aparece!\n\nQue tal voltarmos a nos ver? Temos muitas novidades te esperando! ✨" },
  { key: "INACTIVE_3_YEARS", label: "⏰ Cliente Inativo - 3+ Anos", defaultMessage: "{{nome}}, sentimos muito sua falta! 💙\n\nJá faz mais de 3 anos! Sua última visita foi em {{ultima_compra}}.\n\nQueremos te ver novamente! Preparamos condições especiais para você voltar! ✨" },
  { key: "VIP_CUSTOMER", label: "⭐ Cliente VIP", defaultMessage: "Olá {{nome}}! ⭐\n\nVocê é um cliente especial para nós!\n\nSeparamos uma condição exclusiva VIP: [descreva a oferta]\n\nVamos conversar? 😊" },
  { key: "CASHBACK_EXPIRING", label: "💰 Cashback Expirando", defaultMessage: "{{primeiro_nome}}, atenção! ⚠️\n\nVocê tem R$ {{valor_cashback}} de cashback disponível!\n\nNão deixe expirar! Venha usar seu saldo! 💰" },
];

export default function ConfiguracoesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [templatesRes, settingsRes] = await Promise.all([
        fetch("/api/crm/templates"),
        fetch("/api/crm/settings"),
      ]);

      const [templatesData, settingsData] = await Promise.all([
        templatesRes.json(),
        settingsRes.json(),
      ]);

      if (templatesData.success) {
        setTemplates(templatesData.data);
      }
      if (settingsData.success) {
        setSettings(settingsData.data);
      }
    } catch (error) {
      console.error("Erro ao carregar:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar configurações",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async (segment: string, message: string) => {
    try {
      setSaving(true);
      const res = await fetch("/api/crm/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment,
          name: SEGMENTS.find((s) => s.key === segment)?.label || segment,
          message,
          channel: "whatsapp",
          isActive: true,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast({
          title: "Sucesso",
          description: "Template salvo com sucesso",
        });
        loadData();
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao salvar template",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      const res = await fetch("/api/crm/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      const data = await res.json();

      if (data.success) {
        toast({
          title: "Sucesso",
          description: "Configurações salvas com sucesso",
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao salvar configurações",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getTemplateMessage = (segment: string) => {
    const template = templates.find((t) => t.segment === segment);
    if (template) return template.message;
    return SEGMENTS.find((s) => s.key === segment)?.defaultMessage || "";
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/lembretes">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Configurações do CRM</h1>
          <p className="text-gray-500">Templates de mensagem e critérios de segmentação</p>
        </div>
      </div>

      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates">📝 Templates de Mensagem</TabsTrigger>
          <TabsTrigger value="metas">🎯 Metas de Contato</TabsTrigger>
          <TabsTrigger value="criterios">⚙️ Critérios de Segmentação</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Variáveis Disponíveis</CardTitle>
              <CardDescription>
                Use estas variáveis nas mensagens (serão substituídas automaticamente):
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <code className="bg-gray-100 px-2 py-1 rounded">
                  {"{"}
                  {"{"}nome{"}}"}
                  {"}"}
                </code>
                <span className="text-gray-600">Nome completo do cliente</span>
                <code className="bg-gray-100 px-2 py-1 rounded">
                  {"{"}
                  {"{"}primeiro_nome{"}}"}
                  {"}"}
                </code>
                <span className="text-gray-600">Primeiro nome</span>
                <code className="bg-gray-100 px-2 py-1 rounded">
                  {"{"}
                  {"{"}ultima_compra{"}}"}
                  {"}"}
                </code>
                <span className="text-gray-600">Data da última compra</span>
                <code className="bg-gray-100 px-2 py-1 rounded">
                  {"{"}
                  {"{"}dias_sem_comprar{"}}"}
                  {"}"}
                </code>
                <span className="text-gray-600">Dias desde a última compra</span>
                <code className="bg-gray-100 px-2 py-1 rounded">
                  {"{"}
                  {"{"}produto_comprado{"}}"}
                  {"}"}
                </code>
                <span className="text-gray-600">Último produto comprado</span>
                <code className="bg-gray-100 px-2 py-1 rounded">
                  {"{"}
                  {"{"}valor_cashback{"}}"}
                  {"}"}
                </code>
                <span className="text-gray-600">Saldo de cashback</span>
              </div>
            </CardContent>
          </Card>

          {SEGMENTS.map((segment) => (
            <Card key={segment.key}>
              <CardHeader>
                <CardTitle>{segment.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Mensagem do Template</Label>
                  <Textarea
                    value={getTemplateMessage(segment.key)}
                    onChange={(e) => {
                      const newTemplates = [...templates];
                      const idx = newTemplates.findIndex((t) => t.segment === segment.key);
                      if (idx >= 0) {
                        newTemplates[idx].message = e.target.value;
                      } else {
                        newTemplates.push({
                          segment: segment.key,
                          message: e.target.value,
                        });
                      }
                      setTemplates(newTemplates);
                    }}
                    rows={6}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => handleSaveTemplate(segment.key, getTemplateMessage(segment.key))}
                    disabled={saving}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Salvar Template
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="metas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Metas de Contato</CardTitle>
              <CardDescription>
                Configure as metas padrão de contatos por período
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Meta Diária</Label>
                  <Input
                    type="number"
                    value={settings?.defaultDailyGoal || 10}
                    onChange={(e) =>
                      setSettings({ ...settings, defaultDailyGoal: parseInt(e.target.value) })
                    }
                  />
                  <p className="text-xs text-gray-500 mt-1">Contatos por dia</p>
                </div>
                <div>
                  <Label>Meta Semanal</Label>
                  <Input
                    type="number"
                    value={settings?.defaultWeeklyGoal || 50}
                    onChange={(e) =>
                      setSettings({ ...settings, defaultWeeklyGoal: parseInt(e.target.value) })
                    }
                  />
                  <p className="text-xs text-gray-500 mt-1">Contatos por semana</p>
                </div>
                <div>
                  <Label>Meta Mensal</Label>
                  <Input
                    type="number"
                    value={settings?.defaultMonthlyGoal || 200}
                    onChange={(e) =>
                      setSettings({ ...settings, defaultMonthlyGoal: parseInt(e.target.value) })
                    }
                  />
                  <p className="text-xs text-gray-500 mt-1">Contatos por mês</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveSettings} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Metas
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="criterios" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Critérios de Segmentação</CardTitle>
              <CardDescription>
                Ajuste os critérios para classificação de clientes (em dias)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Pós-Venda Fase 1</Label>
                  <Input
                    type="number"
                    value={settings?.postSaleDays1 || 7}
                    onChange={(e) =>
                      setSettings({ ...settings, postSaleDays1: parseInt(e.target.value) })
                    }
                  />
                  <p className="text-xs text-gray-500 mt-1">Dias após a compra</p>
                </div>
                <div>
                  <Label>Pós-Venda Fase 2</Label>
                  <Input
                    type="number"
                    value={settings?.postSaleDays2 || 30}
                    onChange={(e) =>
                      setSettings({ ...settings, postSaleDays2: parseInt(e.target.value) })
                    }
                  />
                  <p className="text-xs text-gray-500 mt-1">30 dias sem comprar</p>
                </div>
                <div>
                  <Label>Pós-Venda Fase 3</Label>
                  <Input
                    type="number"
                    value={settings?.postSaleDays3 || 90}
                    onChange={(e) =>
                      setSettings({ ...settings, postSaleDays3: parseInt(e.target.value) })
                    }
                  />
                  <p className="text-xs text-gray-500 mt-1">90 dias sem comprar</p>
                </div>
                <div>
                  <Label>Inativo 6 Meses</Label>
                  <Input
                    type="number"
                    value={settings?.inactiveDays6Months || 180}
                    onChange={(e) =>
                      setSettings({ ...settings, inactiveDays6Months: parseInt(e.target.value) })
                    }
                  />
                  <p className="text-xs text-gray-500 mt-1">~180 dias</p>
                </div>
                <div>
                  <Label>Inativo 1 Ano</Label>
                  <Input
                    type="number"
                    value={settings?.inactiveDays1Year || 365}
                    onChange={(e) =>
                      setSettings({ ...settings, inactiveDays1Year: parseInt(e.target.value) })
                    }
                  />
                  <p className="text-xs text-gray-500 mt-1">~365 dias</p>
                </div>
                <div>
                  <Label>Inativo 2 Anos</Label>
                  <Input
                    type="number"
                    value={settings?.inactiveDays2Years || 730}
                    onChange={(e) =>
                      setSettings({ ...settings, inactiveDays2Years: parseInt(e.target.value) })
                    }
                  />
                  <p className="text-xs text-gray-500 mt-1">~730 dias</p>
                </div>
                <div>
                  <Label>Inativo 3 Anos</Label>
                  <Input
                    type="number"
                    value={settings?.inactiveDays3Years || 1095}
                    onChange={(e) =>
                      setSettings({ ...settings, inactiveDays3Years: parseInt(e.target.value) })
                    }
                  />
                  <p className="text-xs text-gray-500 mt-1">~1095 dias</p>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold mb-4">Critérios de Cliente VIP</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Mínimo de Compras</Label>
                    <Input
                      type="number"
                      value={settings?.vipMinPurchases || 5}
                      onChange={(e) =>
                        setSettings({ ...settings, vipMinPurchases: parseInt(e.target.value) })
                      }
                    />
                    <p className="text-xs text-gray-500 mt-1">Quantidade de compras</p>
                  </div>
                  <div>
                    <Label>Valor Mínimo Total</Label>
                    <Input
                      type="number"
                      value={settings?.vipMinTotalSpent || 5000}
                      onChange={(e) =>
                        setSettings({ ...settings, vipMinTotalSpent: parseFloat(e.target.value) })
                      }
                    />
                    <p className="text-xs text-gray-500 mt-1">Em reais (R$)</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveSettings} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Critérios
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
