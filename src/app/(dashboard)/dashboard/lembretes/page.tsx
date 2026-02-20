"use client";

import { useState, useEffect } from "react";
import { Users, Phone, MessageSquare, TrendingUp, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const SEGMENTS = [
  { key: "all", label: "Todos" },
  { key: "BIRTHDAY", label: "🎂 Aniversário" },
  { key: "POST_SALE_30_DAYS", label: "📦 Pós-Venda 30d" },
  { key: "INACTIVE_1_YEAR", label: "⏰ 1 Ano" },
  { key: "INACTIVE_2_YEARS", label: "⏰ 2 Anos" },
  { key: "VIP_CUSTOMER", label: "⭐ VIP" },
];

export default function CrmPage() {
  const [reminders, setReminders] = useState<any[]>([]);
  const [counts, setCounts] = useState<any>({});
  const [goals, setGoals] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSegment, setSelectedSegment] = useState("all");
  const { toast } = useToast();

  const loadData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedSegment !== "all") params.set("segment", selectedSegment);

      const [remindersRes, countsRes, goalsRes] = await Promise.all([
        fetch(`/api/crm/reminders?${params}`),
        fetch("/api/crm/reminders/counts"),
        fetch("/api/crm/goals"),
      ]);

      const [remindersData, countsData, goalsData] = await Promise.all([
        remindersRes.json(),
        countsRes.json(),
        goalsRes.json(),
      ]);

      if (remindersData.success) setReminders(remindersData.data);
      if (countsData.success) setCounts(countsData.data);
      if (goalsData.success) setGoals(goalsData.data);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar lembretes",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    try {
      const res = await fetch("/api/crm/reminders", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        toast({
          title: "Sucesso",
          description: data.message,
        });
        loadData();
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao gerar lembretes",
        variant: "destructive",
      });
    }
  };

  const handleWhatsApp = (reminder: any) => {
    const phone = reminder.customer.phone?.replace(/\D/g, "");
    if (phone) {
      const message = `Olá ${reminder.customer.name.split(" ")[0]}! 👋`;
      window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, "_blank");
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedSegment]);

  const totalPending = Object.values(counts).reduce((a: any, b: any) => (a as number) + (b as number), 0) as number;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">CRM - Lembretes de Contato</h1>
          <p className="text-gray-500">Central de Follow-up e Reativação de Clientes</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleGenerate} variant="outline">
            <RefreshCw className="mr-2 w-4 h-4" />
            Gerar Lembretes
          </Button>
          <Button onClick={loadData} variant="outline">
            <RefreshCw className="mr-2 w-4 h-4" />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500">Pendentes</p>
                <p className="text-2xl font-bold">{totalPending || 0}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500">Meta Diária</p>
                <p className="text-2xl font-bold">
                  {goals?.daily?.current || 0}/{goals?.daily?.target || 10}
                </p>
              </div>
              <Phone className="w-8 h-8 text-green-500" />
            </div>
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full"
                style={{
                  width: `${Math.min(
                    ((goals?.daily?.current || 0) / (goals?.daily?.target || 10)) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500">Meta Semanal</p>
                <p className="text-2xl font-bold">
                  {goals?.weekly?.current || 0}/{goals?.weekly?.target || 50}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-500" />
            </div>
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-purple-500 h-2 rounded-full"
                style={{
                  width: `${Math.min(
                    ((goals?.weekly?.current || 0) / (goals?.weekly?.target || 50)) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500">Meta Mensal</p>
                <p className="text-2xl font-bold">
                  {goals?.monthly?.current || 0}/{goals?.monthly?.target || 200}
                </p>
              </div>
              <MessageSquare className="w-8 h-8 text-orange-500" />
            </div>
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-orange-500 h-2 rounded-full"
                style={{
                  width: `${Math.min(
                    ((goals?.monthly?.current || 0) / (goals?.monthly?.target || 200)) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2 flex-wrap">
            {SEGMENTS.map((segment) => (
              <Button
                key={segment.key}
                onClick={() => setSelectedSegment(segment.key)}
                variant={selectedSegment === segment.key ? "default" : "outline"}
                size="sm"
              >
                {segment.label}
                {segment.key !== "all" && counts[segment.key] > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {counts[segment.key]}
                  </Badge>
                )}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {loading ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">Carregando...</CardContent>
          </Card>
        ) : reminders.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              Nenhum lembrete encontrado. Clique em "Gerar Lembretes" para criar novos.
            </CardContent>
          </Card>
        ) : (
          reminders.map((reminder: any) => (
            <Card key={reminder.id}>
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold">{reminder.customer.name}</h3>
                      <Badge>{reminder.segment.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      📞 {reminder.customer.phone || "Sem telefone"}
                    </p>

                    {reminder.lastPurchaseDate && (
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>
                          📦 Última compra:{" "}
                          {new Date(reminder.lastPurchaseDate).toLocaleDateString("pt-BR")} (
                          {reminder.daysSinceLastPurchase} dias)
                        </p>
                        {reminder.lastPurchaseProduct && (
                          <p>🛒 Produto: {reminder.lastPurchaseProduct}</p>
                        )}
                        {reminder.lastPurchaseAmount && (
                          <p>
                            💰 Valor: R${" "}
                            {Number(reminder.lastPurchaseAmount).toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                            })}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="text-sm text-gray-500 mt-2">
                      <p>
                        📊 Total: {reminder.totalPurchases} compras • R${" "}
                        {Number(reminder.totalSpent).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button onClick={() => handleWhatsApp(reminder)} size="sm">
                      <MessageSquare className="mr-2 w-4 h-4" />
                      WhatsApp
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
