"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Bell,
  Cake,
  UserX,
  Gift,
  MessageSquare,
  Check,
  SkipForward,
  X,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthDate: Date | null;
  cashback: Array<{ balance: number }>;
}

interface Reminder {
  id: string;
  type: string;
  scheduledFor: Date;
  status: string;
  metadata: any;
  customer: Customer;
}

interface RemindersData {
  all: Reminder[];
  grouped: Record<string, Reminder[]>;
  counts: {
    PRESCRIPTION_REMINDER: number;
    BIRTHDAY_GREETING: number;
    INACTIVE_REACTIVATION: number;
    CASHBACK_EXPIRING: number;
    total: number;
  };
}

const typeConfig = {
  PRESCRIPTION_REMINDER: {
    label: "Receita Vencendo",
    icon: Bell,
    color: "bg-blue-500",
    description: "Receita oftálmica está vencendo",
  },
  BIRTHDAY_GREETING: {
    label: "Aniversário",
    icon: Cake,
    color: "bg-pink-500",
    description: "Aniversário do cliente",
  },
  INACTIVE_REACTIVATION: {
    label: "Cliente Inativo",
    icon: UserX,
    color: "bg-orange-500",
    description: "Cliente há muito tempo sem comprar",
  },
  CASHBACK_EXPIRING: {
    label: "Cashback Expirando",
    icon: Gift,
    color: "bg-purple-500",
    description: "Cashback prestes a expirar",
  },
};

function RemindersPageContent() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [reminders, setReminders] = useState<RemindersData | null>(null);
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [dismissReason, setDismissReason] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [sequenceMode, setSequenceMode] = useState(false);
  const [currentSequenceIndex, setCurrentSequenceIndex] = useState(0);

  useEffect(() => {
    loadReminders();
  }, []);

  const loadReminders = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/reminders");

      if (!response.ok) {
        throw new Error("Erro ao carregar lembretes");
      }

      const data = await response.json();
      setReminders(data.data);
    } catch (error) {
      toast({
        title: "Erro ao carregar lembretes",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateReminders = async () => {
    try {
      setGenerating(true);
      const response = await fetch("/api/reminders", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Erro ao gerar lembretes");
      }

      const data = await response.json();
      toast({
        title: "Lembretes gerados",
        description: data.message,
      });

      await loadReminders();
    } catch (error) {
      toast({
        title: "Erro ao gerar lembretes",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const openWhatsApp = async (reminder: Reminder) => {
    const { customer, type, metadata } = reminder;

    if (!customer.phone) {
      toast({
        title: "Cliente sem telefone",
        description: "Este cliente não possui WhatsApp cadastrado",
        variant: "destructive",
      });
      return;
    }

    // Gerar mensagem baseada no tipo
    let message = "";
    switch (type) {
      case "PRESCRIPTION_REMINDER":
        const daysUntilExpiration = metadata?.daysUntilExpiration || 0;
        message = `Olá ${customer.name}! Sua receita vence em ${daysUntilExpiration} dias. Que tal agendar uma nova consulta?`;
        break;
      case "BIRTHDAY_GREETING":
        message = `Parabéns, ${customer.name}! Temos um presente especial de aniversário para você!`;
        break;
      case "INACTIVE_REACTIVATION":
        const daysSinceLastSale = metadata?.daysSinceLastSale || 0;
        message = `Olá ${customer.name}! Sentimos sua falta! Faz ${Math.floor(daysSinceLastSale / 30)} meses que não nos vemos. Que tal passar aqui?`;
        break;
      case "CASHBACK_EXPIRING":
        const amount = metadata?.amount || 0;
        const daysToExpire = metadata?.daysUntilExpiration || 0;
        message = `Olá ${customer.name}! Você tem R$ ${amount.toFixed(2)} em cashback expirando em ${daysToExpire} dias!`;
        break;
      default:
        message = `Olá ${customer.name}!`;
    }

    // Limpar e formatar telefone
    const cleanPhone = customer.phone.replace(/\D/g, "");
    const phoneWithCountry = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${phoneWithCountry}?text=${encodedMessage}`;

    // Marcar como em progresso
    await fetch(`/api/reminders/${reminder.id}`, {
      method: "POST",
    });

    // Abrir WhatsApp
    window.open(whatsappUrl, "_blank");

    // Registrar contato
    await fetch("/api/reminders/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: customer.id,
        type,
        channel: "WHATSAPP",
        status: "SENT",
        message,
        reminderId: reminder.id,
      }),
    });

    toast({
      title: "WhatsApp aberto",
      description: "Mensagem pronta enviada ao WhatsApp",
    });

    await loadReminders();

    // Se estiver em modo sequência, avançar para o próximo
    if (sequenceMode && reminders) {
      handleNextInSequence();
    }
  };

  const markAsCompleted = async (reminder: Reminder) => {
    try {
      const response = await fetch(`/api/reminders/${reminder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "COMPLETED",
        }),
      });

      if (!response.ok) {
        throw new Error("Erro ao marcar como concluído");
      }

      toast({
        title: "Lembrete concluído",
        description: "Contato realizado com sucesso",
      });

      await loadReminders();

      if (sequenceMode) {
        handleNextInSequence();
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const skip = async (reminder: Reminder) => {
    try {
      const response = await fetch(`/api/reminders/${reminder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "SKIPPED",
        }),
      });

      if (!response.ok) {
        throw new Error("Erro ao pular lembrete");
      }

      toast({
        title: "Lembrete pulado",
        description: "Este lembrete foi pulado",
      });

      await loadReminders();

      if (sequenceMode) {
        handleNextInSequence();
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const dismiss = (reminder: Reminder) => {
    setSelectedReminder(reminder);
    setDismissDialogOpen(true);
  };

  const confirmDismiss = async () => {
    if (!selectedReminder) return;

    try {
      const response = await fetch(`/api/reminders/${selectedReminder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "DISMISSED",
          dismissReason,
        }),
      });

      if (!response.ok) {
        throw new Error("Erro ao dispensar lembrete");
      }

      toast({
        title: "Lembrete dispensado",
        description: "Este lembrete foi dispensado",
      });

      setDismissDialogOpen(false);
      setDismissReason("");
      setSelectedReminder(null);

      await loadReminders();

      if (sequenceMode) {
        handleNextInSequence();
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const handleNextInSequence = () => {
    if (!reminders) return;
    const totalReminders = reminders.all.length;

    if (currentSequenceIndex < totalReminders - 1) {
      setCurrentSequenceIndex(currentSequenceIndex + 1);
    } else {
      setSequenceMode(false);
      setCurrentSequenceIndex(0);
      toast({
        title: "Sequência concluída",
        description: "Todos os lembretes foram processados",
      });
    }
  };

  const toggleSequenceMode = () => {
    setSequenceMode(!sequenceMode);
    setCurrentSequenceIndex(0);
  };

  const ReminderCard = ({ reminder }: { reminder: Reminder }) => {
    const config = typeConfig[reminder.type as keyof typeof typeConfig];
    if (!config) return null;

    const Icon = config.icon;

    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              <div className={`p-2 rounded-lg ${config.color}`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{reminder.customer.name}</h3>
                  <Badge variant="outline" className="text-xs">
                    {config.label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {config.description}
                </p>
                {reminder.customer.phone && (
                  <p className="text-sm text-muted-foreground">
                    {reminder.customer.phone}
                  </p>
                )}
                {reminder.metadata && (
                  <div className="text-xs text-muted-foreground mt-2">
                    {reminder.type === "CASHBACK_EXPIRING" && (
                      <span>Valor: R$ {reminder.metadata.amount?.toFixed(2)}</span>
                    )}
                    {reminder.type === "PRESCRIPTION_REMINDER" && (
                      <span>Expira em {reminder.metadata.daysUntilExpiration} dias</span>
                    )}
                    {reminder.type === "INACTIVE_REACTIVATION" && (
                      <span>{reminder.metadata.daysSinceLastSale} dias sem comprar</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              size="sm"
              variant="default"
              className="flex-1"
              onClick={() => openWhatsApp(reminder)}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              WhatsApp
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAsCompleted(reminder)}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => skip(reminder)}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => dismiss(reminder)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Lembretes de Retorno</h1>
          <p className="text-muted-foreground mt-2">
            Central de lembretes para contato com clientes
          </p>
        </div>
        <div className="flex gap-2">
          {reminders && reminders.all.length > 0 && (
            <Button
              variant={sequenceMode ? "default" : "outline"}
              onClick={toggleSequenceMode}
            >
              {sequenceMode ? "Sair do Modo Sequência" : "Modo Sequência"}
            </Button>
          )}
          <Button onClick={generateReminders} disabled={generating}>
            {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <RefreshCw className="mr-2 h-4 w-4" />
            Gerar Lembretes
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      {reminders && (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reminders.counts.total}</div>
            </CardContent>
          </Card>

          {Object.entries(typeConfig).map(([type, config]) => {
            const Icon = config.icon;
            const count = reminders.counts[type as keyof typeof reminders.counts] || 0;

            return (
              <Card key={type}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {config.label}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{count}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tabs por tipo de lembrete */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">
            Todos ({reminders?.counts.total || 0})
          </TabsTrigger>
          {Object.entries(typeConfig).map(([type, config]) => {
            const count = reminders?.counts[type as keyof typeof reminders.counts] || 0;
            return (
              <TabsTrigger key={type} value={type}>
                {config.label} ({count})
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="all" className="space-y-4 mt-6">
          {sequenceMode && reminders && reminders.all.length > 0 ? (
            <div>
              <div className="mb-4 p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">
                  Modo Sequência: {currentSequenceIndex + 1} de {reminders.all.length}
                </p>
              </div>
              <ReminderCard reminder={reminders.all[currentSequenceIndex]} />
            </div>
          ) : (
            <>
              {reminders && reminders.all.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    Nenhum lembrete pendente para hoje
                  </CardContent>
                </Card>
              ) : (
                reminders?.all.map((reminder) => (
                  <ReminderCard key={reminder.id} reminder={reminder} />
                ))
              )}
            </>
          )}
        </TabsContent>

        {Object.keys(typeConfig).map((type) => (
          <TabsContent key={type} value={type} className="space-y-4 mt-6">
            {reminders?.grouped[type]?.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  Nenhum lembrete deste tipo
                </CardContent>
              </Card>
            ) : (
              reminders?.grouped[type]?.map((reminder) => (
                <ReminderCard key={reminder.id} reminder={reminder} />
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Dialog de Dispensar */}
      <Dialog open={dismissDialogOpen} onOpenChange={setDismissDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispensar Lembrete</DialogTitle>
            <DialogDescription>
              Por que você está dispensando este lembrete?
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Ex: Cliente não quer mais ser contatado, número incorreto, etc."
            value={dismissReason}
            onChange={(e) => setDismissReason(e.target.value)}
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDismissDialogOpen(false);
                setDismissReason("");
                setSelectedReminder(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={confirmDismiss}>Dispensar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RemindersPage() {
  return (
    <ProtectedRoute permission="reminders.view">
      <RemindersPageContent />
    </ProtectedRoute>
  );
}
