"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";
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
  Edit3,
  Send,
  Phone,
  ChevronRight,
  ChevronLeft,
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
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
import { Progress } from "@/components/ui/progress";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// ============================================================================
// Tipos
// ============================================================================

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

interface CompanySettings {
  displayName: string;
  phone: string;
  whatsapp: string;
  messageThankYou: string | null;
  messageReminder: string | null;
  messageBirthday: string | null;
}

// ============================================================================
// Configuração por tipo
// ============================================================================

const typeConfig = {
  PRESCRIPTION_REMINDER: {
    label: "Receita Vencendo",
    icon: Bell,
    color: "bg-blue-500",
    badgeColor: "bg-blue-100 text-blue-800 border-blue-200",
    lightBg: "bg-blue-50",
    description: "Receita oftálmica está vencendo",
    emoji: "📋",
  },
  BIRTHDAY_GREETING: {
    label: "Aniversário",
    icon: Cake,
    color: "bg-pink-500",
    badgeColor: "bg-pink-100 text-pink-800 border-pink-200",
    lightBg: "bg-pink-50",
    description: "Aniversário do cliente",
    emoji: "🎂",
  },
  INACTIVE_REACTIVATION: {
    label: "Cliente Inativo",
    icon: UserX,
    color: "bg-orange-500",
    badgeColor: "bg-orange-100 text-orange-800 border-orange-200",
    lightBg: "bg-orange-50",
    description: "Cliente há muito tempo sem comprar",
    emoji: "👋",
  },
  CASHBACK_EXPIRING: {
    label: "Cashback Expirando",
    icon: Gift,
    color: "bg-purple-500",
    badgeColor: "bg-purple-100 text-purple-800 border-purple-200",
    lightBg: "bg-purple-50",
    description: "Cashback prestes a expirar",
    emoji: "💰",
  },
};

// ============================================================================
// Mensagens padrão
// ============================================================================

const DEFAULT_MESSAGES = {
  PRESCRIPTION_REMINDER: `Olá {cliente}! 👋

Sua receita oftálmica vence em {dias} dias. Que tal agendar uma nova consulta com seu oftalmologista?

Depois é só passar aqui na {empresa} para renovar seus óculos com as melhores condições!

{empresa}
{telefone}`,

  BIRTHDAY_GREETING: `Feliz Aniversário, {cliente}! 🎂🎉

A equipe da {empresa} deseja um dia maravilhoso!

Como presente, preparamos uma condição especial para você. Venha nos visitar!

{empresa}
{telefone}`,

  INACTIVE_REACTIVATION: `Olá {cliente}! 👋

Sentimos sua falta! Faz {meses} meses que não nos vemos.

Temos novidades incríveis e condições especiais esperando por você. Que tal nos visitar?

{empresa}
{telefone}`,

  CASHBACK_EXPIRING: `Olá {cliente}! 💰

Você tem R$ {valor} em cashback que expira em {dias} dias!

Não deixe seu crédito expirar! Venha aproveitar na {empresa}.

{empresa}
{telefone}`,
};

// ============================================================================
// Gerador de mensagem
// ============================================================================

function generateMessage(
  reminder: Reminder,
  companySettings: CompanySettings | null,
  customTemplates?: Record<string, string | null>
): string {
  const { customer, type, metadata } = reminder;
  const empresa = companySettings?.displayName || "nossa loja";
  const telefone = companySettings?.whatsapp || companySettings?.phone || "";

  let template = "";

  // Prioridade: templates da empresa > defaults
  if (type === "BIRTHDAY_GREETING" && customTemplates?.messageBirthday) {
    template = customTemplates.messageBirthday;
  } else if (type === "PRESCRIPTION_REMINDER" && customTemplates?.messageReminder) {
    template = customTemplates.messageReminder;
  } else {
    template = DEFAULT_MESSAGES[type as keyof typeof DEFAULT_MESSAGES] || `Olá {cliente}!`;
  }

  let message = template
    .replace(/\{cliente\}/g, customer.name.split(" ")[0])
    .replace(/\{empresa\}/g, empresa)
    .replace(/\{telefone\}/g, telefone);

  // Substituições específicas por tipo
  switch (type) {
    case "PRESCRIPTION_REMINDER":
      message = message.replace(/\{dias\}/g, String(metadata?.daysUntilExpiration || 0));
      break;
    case "INACTIVE_REACTIVATION":
      message = message.replace(/\{meses\}/g, String(Math.floor((metadata?.daysSinceLastSale || 0) / 30)));
      message = message.replace(/\{dias\}/g, String(metadata?.daysSinceLastSale || 0));
      break;
    case "CASHBACK_EXPIRING":
      message = message.replace(/\{valor\}/g, (metadata?.amount || 0).toFixed(2));
      message = message.replace(/\{dias\}/g, String(metadata?.daysUntilExpiration || 0));
      break;
  }

  return message;
}

// ============================================================================
// Componente Principal
// ============================================================================

function RemindersPageContent() {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [reminders, setReminders] = useState<RemindersData | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");

  // Modo sequência
  const [sequenceMode, setSequenceMode] = useState(false);
  const [currentSequenceIndex, setCurrentSequenceIndex] = useState(0);
  const [completedInSequence, setCompletedInSequence] = useState(0);

  // Modal de WhatsApp com preview/edição
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [whatsappReminder, setWhatsappReminder] = useState<Reminder | null>(null);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);

  // Modal de dispensar
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [dismissReminder, setDismissReminder] = useState<Reminder | null>(null);
  const [dismissReason, setDismissReason] = useState("");

  // ============================================================================
  // Data Loading
  // ============================================================================

  const loadReminders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/reminders");
      if (!response.ok) throw new Error("Erro ao carregar lembretes");
      const data = await response.json();
      setReminders(data.data);
    } catch (error) {
      toast.error("Erro ao carregar lembretes");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCompanySettings = useCallback(async () => {
    try {
      const response = await fetch("/api/company/settings");
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setCompanySettings({
            displayName: data.data.displayName || "",
            phone: data.data.phone || "",
            whatsapp: data.data.whatsapp || "",
            messageThankYou: data.data.messageThankYou || null,
            messageReminder: data.data.messageReminder || null,
            messageBirthday: data.data.messageBirthday || null,
          });
        }
      }
    } catch {
      // Não bloqueia se settings falhar
    }
  }, []);

  useEffect(() => {
    loadReminders();
    loadCompanySettings();
  }, [loadReminders, loadCompanySettings]);

  // ============================================================================
  // Ações
  // ============================================================================

  const generateReminders = async () => {
    try {
      setGenerating(true);
      const response = await fetch("/api/reminders", { method: "POST" });
      if (!response.ok) throw new Error("Erro ao gerar lembretes");
      const data = await response.json();
      toast.success(`${data.data.total} lembretes gerados!`);
      await loadReminders();
    } catch {
      toast.error("Erro ao gerar lembretes");
    } finally {
      setGenerating(false);
    }
  };

  const prepareWhatsApp = (reminder: Reminder) => {
    const message = generateMessage(reminder, companySettings, {
      messageReminder: companySettings?.messageReminder || null,
      messageBirthday: companySettings?.messageBirthday || null,
    });
    setWhatsappMessage(message);
    setWhatsappReminder(reminder);
    setWhatsappDialogOpen(true);
  };

  const sendWhatsApp = async () => {
    if (!whatsappReminder) return;
    const { customer } = whatsappReminder;

    if (!customer.phone) {
      toast.error("Cliente sem telefone cadastrado");
      return;
    }

    setSendingWhatsapp(true);

    try {
      // Limpar e formatar telefone
      const cleanPhone = customer.phone.replace(/\D/g, "");
      const phoneWithCountry = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
      const encodedMessage = encodeURIComponent(whatsappMessage);
      const whatsappUrl = `https://wa.me/${phoneWithCountry}?text=${encodedMessage}`;

      // Marcar como em progresso
      await fetch(`/api/reminders/${whatsappReminder.id}`, { method: "POST" });

      // Abrir WhatsApp
      window.open(whatsappUrl, "_blank");

      // Registrar contato
      await fetch("/api/reminders/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          type: whatsappReminder.type,
          channel: "WHATSAPP",
          status: "SENT",
          message: whatsappMessage,
          reminderId: whatsappReminder.id,
        }),
      });

      toast.success("WhatsApp aberto com sucesso!");

      setWhatsappDialogOpen(false);
      setWhatsappReminder(null);
      setWhatsappMessage("");

      await loadReminders();

      if (sequenceMode) {
        setCompletedInSequence((prev) => prev + 1);
        handleNextInSequence();
      }
    } catch {
      toast.error("Erro ao enviar mensagem");
    } finally {
      setSendingWhatsapp(false);
    }
  };

  const markAsCompleted = async (reminder: Reminder) => {
    try {
      const response = await fetch(`/api/reminders/${reminder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });

      if (!response.ok) throw new Error("Erro ao marcar como concluído");

      toast.success("Lembrete concluído!");
      await loadReminders();

      if (sequenceMode) {
        setCompletedInSequence((prev) => prev + 1);
        handleNextInSequence();
      }
    } catch {
      toast.error("Erro ao marcar como concluído");
    }
  };

  const skip = async (reminder: Reminder) => {
    try {
      const response = await fetch(`/api/reminders/${reminder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SKIPPED" }),
      });

      if (!response.ok) throw new Error("Erro ao pular lembrete");

      toast.success("Lembrete pulado");
      await loadReminders();

      if (sequenceMode) {
        setCompletedInSequence((prev) => prev + 1);
        handleNextInSequence();
      }
    } catch {
      toast.error("Erro ao pular lembrete");
    }
  };

  const openDismissDialog = (reminder: Reminder) => {
    setDismissReminder(reminder);
    setDismissReason("");
    setDismissDialogOpen(true);
  };

  const confirmDismiss = async () => {
    if (!dismissReminder) return;

    try {
      const response = await fetch(`/api/reminders/${dismissReminder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DISMISSED", dismissReason }),
      });

      if (!response.ok) throw new Error("Erro ao dispensar lembrete");

      toast.success("Lembrete dispensado");
      setDismissDialogOpen(false);
      setDismissReminder(null);
      setDismissReason("");

      await loadReminders();

      if (sequenceMode) {
        setCompletedInSequence((prev) => prev + 1);
        handleNextInSequence();
      }
    } catch {
      toast.error("Erro ao dispensar lembrete");
    }
  };

  // ============================================================================
  // Modo Sequência
  // ============================================================================

  const handleNextInSequence = () => {
    if (!reminders) return;
    const totalReminders = reminders.all.length;

    if (currentSequenceIndex < totalReminders - 1) {
      setCurrentSequenceIndex((prev) => prev + 1);
    } else {
      setSequenceMode(false);
      setCurrentSequenceIndex(0);
      toast.success("Todos os lembretes foram processados!");
    }
  };

  const handlePrevInSequence = () => {
    if (currentSequenceIndex > 0) {
      setCurrentSequenceIndex((prev) => prev - 1);
    }
  };

  const startSequenceMode = () => {
    setSequenceMode(true);
    setCurrentSequenceIndex(0);
    setCompletedInSequence(0);
  };

  const exitSequenceMode = () => {
    setSequenceMode(false);
    setCurrentSequenceIndex(0);
    setCompletedInSequence(0);
  };

  // ============================================================================
  // Helpers
  // ============================================================================

  const getActiveReminders = (): Reminder[] => {
    if (!reminders) return [];
    if (activeTab === "all") return reminders.all;
    return reminders.grouped[activeTab] || [];
  };

  const getMetadataInfo = (reminder: Reminder): string => {
    const { type, metadata } = reminder;
    switch (type) {
      case "CASHBACK_EXPIRING":
        return `R$ ${(metadata?.amount || 0).toFixed(2)} expirando em ${metadata?.daysUntilExpiration || 0} dias`;
      case "PRESCRIPTION_REMINDER":
        return `Receita expira em ${metadata?.daysUntilExpiration || 0} dias`;
      case "INACTIVE_REACTIVATION":
        return `${Math.floor((metadata?.daysSinceLastSale || 0) / 30)} meses sem comprar`;
      case "BIRTHDAY_GREETING":
        return "Aniversariante de hoje!";
      default:
        return "";
    }
  };

  // ============================================================================
  // Card do Lembrete
  // ============================================================================

  const ReminderCard = ({
    reminder,
    isHighlighted = false,
  }: {
    reminder: Reminder;
    isHighlighted?: boolean;
  }) => {
    const config = typeConfig[reminder.type as keyof typeof typeConfig];
    if (!config) return null;

    const Icon = config.icon;
    const cashbackBalance =
      reminder.customer.cashback?.reduce((sum, c) => sum + c.balance, 0) || 0;
    const metaInfo = getMetadataInfo(reminder);

    return (
      <Card
        className={`hover:shadow-md transition-all ${
          isHighlighted ? "ring-2 ring-primary shadow-lg" : ""
        }`}
      >
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start gap-3">
            {/* Ícone colorido */}
            <div
              className={`p-2.5 rounded-xl ${config.color} flex-shrink-0`}
            >
              <Icon className="h-5 w-5 text-white" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-base truncate">
                  {reminder.customer.name}
                </h3>
                <Badge
                  variant="outline"
                  className={`text-[11px] px-2 py-0 ${config.badgeColor} border`}
                >
                  {config.label}
                </Badge>
              </div>

              {/* Metadata */}
              <p className="text-sm text-muted-foreground mt-1">
                {metaInfo}
              </p>

              {/* Phone + cashback */}
              <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                {reminder.customer.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {reminder.customer.phone}
                  </span>
                )}
                {cashbackBalance > 0 && (
                  <span className="flex items-center gap-1 text-green-600 font-medium">
                    <Gift className="h-3 w-3" />
                    R$ {cashbackBalance.toFixed(2)} cashback
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Ações */}
          <div className="flex gap-2 mt-3 pt-3 border-t">
            <Button
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => prepareWhatsApp(reminder)}
              disabled={!reminder.customer.phone}
            >
              <MessageSquare className="h-4 w-4" />
              Enviar WhatsApp
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              title="Marcar como concluído"
              onClick={() => markAsCompleted(reminder)}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              title="Pular"
              onClick={() => skip(reminder)}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              title="Dispensar"
              onClick={() => openDismissDialog(reminder)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ============================================================================
  // Modo Sequência (card maior com foco)
  // ============================================================================

  const SequenceView = () => {
    if (!reminders || reminders.all.length === 0) return null;

    const activeItems = getActiveReminders();
    if (activeItems.length === 0) return null;

    const current = activeItems[currentSequenceIndex];
    if (!current) {
      exitSequenceMode();
      return null;
    }

    const config = typeConfig[current.type as keyof typeof typeConfig];
    if (!config) return null;

    const total = activeItems.length;
    const progressPercent = total > 0 ? (completedInSequence / total) * 100 : 0;

    return (
      <div className="space-y-4">
        {/* Header de progresso */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  Lembrete {currentSequenceIndex + 1} de {total}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">
                  {completedInSequence} processados
                </span>
              </div>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </CardContent>
        </Card>

        {/* Card do lembrete atual - destacado */}
        <ReminderCard reminder={current} isHighlighted />

        {/* Navegação */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevInSequence}
            disabled={currentSequenceIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Anterior
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={exitSequenceMode}
          >
            Sair da Sequência
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleNextInSequence}
            disabled={currentSequenceIndex >= total - 1}
          >
            Próximo
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Carregando lembretes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Lembretes</h1>
          <p className="text-muted-foreground mt-1">
            Central de contatos com clientes
          </p>
        </div>
        <div className="flex gap-2">
          {reminders && reminders.all.length > 0 && !sequenceMode && (
            <Button variant="outline" onClick={startSequenceMode}>
              <Send className="h-4 w-4 mr-2" />
              Modo Sequência
            </Button>
          )}
          <Button onClick={generateReminders} disabled={generating}>
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Gerar Lembretes
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      {reminders && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
          <Card
            className={`cursor-pointer transition-all ${
              activeTab === "all" ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setActiveTab("all")}
          >
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  Total
                </p>
                <Bell className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold mt-1">{reminders.counts.total}</p>
            </CardContent>
          </Card>

          {Object.entries(typeConfig).map(([type, config]) => {
            const Icon = config.icon;
            const count =
              reminders.counts[type as keyof typeof reminders.counts] || 0;

            return (
              <Card
                key={type}
                className={`cursor-pointer transition-all ${
                  activeTab === type ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setActiveTab(type)}
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground truncate">
                      {config.label}
                    </p>
                    <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </div>
                  <p className="text-2xl font-bold mt-1">{count}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tabs por tipo de lembrete */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="all" className="text-xs">
            Todos ({reminders?.counts.total || 0})
          </TabsTrigger>
          {Object.entries(typeConfig).map(([type, config]) => {
            const count =
              reminders?.counts[type as keyof typeof reminders.counts] || 0;
            return (
              <TabsTrigger key={type} value={type} className="text-xs">
                {config.label} ({count})
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Conteúdo: Modo Sequência ou Lista */}
        <div className="mt-6">
          {sequenceMode ? (
            <SequenceView />
          ) : (
            <>
              {/* Todos */}
              <TabsContent value="all" className="space-y-3 mt-0">
                {reminders && reminders.all.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Bell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                      <h3 className="text-lg font-medium">Nenhum lembrete pendente</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Clique em &quot;Gerar Lembretes&quot; para criar novos lembretes automaticamente.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  reminders?.all.map((reminder) => (
                    <ReminderCard key={reminder.id} reminder={reminder} />
                  ))
                )}
              </TabsContent>

              {/* Por tipo */}
              {Object.keys(typeConfig).map((type) => (
                <TabsContent key={type} value={type} className="space-y-3 mt-0">
                  {(!reminders?.grouped[type] ||
                    reminders.grouped[type].length === 0) ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                        <h3 className="text-lg font-medium">Nenhum lembrete deste tipo</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Não há lembretes de{" "}
                          {typeConfig[type as keyof typeof typeConfig]?.label?.toLowerCase()}{" "}
                          no momento.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    reminders?.grouped[type]?.map((reminder) => (
                      <ReminderCard key={reminder.id} reminder={reminder} />
                    ))
                  )}
                </TabsContent>
              ))}
            </>
          )}
        </div>
      </Tabs>

      {/* ================================================================== */}
      {/* Dialog: Preview/Editar WhatsApp */}
      {/* ================================================================== */}
      <Dialog open={whatsappDialogOpen} onOpenChange={setWhatsappDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-green-600" />
              Enviar WhatsApp
            </DialogTitle>
            <DialogDescription>
              {whatsappReminder && (
                <span>
                  Para: <strong>{whatsappReminder.customer.name}</strong>{" "}
                  ({whatsappReminder.customer.phone})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Mensagem:</label>
              <span className="text-xs text-muted-foreground">
                Edite antes de enviar se necessário
              </span>
            </div>

            {/* Preview estilo WhatsApp */}
            <div className="bg-[#e5ddd5] rounded-lg p-4">
              <div className="bg-[#dcf8c6] rounded-lg p-3 max-w-[90%] ml-auto shadow-sm">
                <Textarea
                  value={whatsappMessage}
                  onChange={(e) => setWhatsappMessage(e.target.value)}
                  className="min-h-[180px] bg-transparent border-0 p-0 resize-none text-[13px] leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
                  placeholder="Escreva a mensagem..."
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setWhatsappDialogOpen(false);
                setWhatsappReminder(null);
                setWhatsappMessage("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={sendWhatsApp}
              disabled={sendingWhatsapp || !whatsappMessage.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {sendingWhatsapp ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Abrir WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================== */}
      {/* Dialog: Dispensar Lembrete */}
      {/* ================================================================== */}
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
                setDismissReminder(null);
              }}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDismiss}>
              Dispensar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RemindersPage() {
  return (
    <ProtectedRoute>
      <RemindersPageContent />
    </ProtectedRoute>
  );
}
