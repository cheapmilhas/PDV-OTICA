"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import toast from "react-hot-toast";
import {
  Building2,
  Mail,
  MapPin,
  Phone,
  Save,
  FileText,
  MessageSquare,
  RotateCcw,
  Info,
  Upload,
  Trash2,
  Palette,
  CreditCard,
  Loader2,
  Image,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface CompanySettings {
  id?: string;
  displayName: string | null;
  cnpj: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  logoUrl: string | null;
  messageThankYou: string | null;
  messageQuote: string | null;
  messageReminder: string | null;
  messageBirthday: string | null;
  pdfHeaderText: string | null;
  pdfFooterText: string | null;
  defaultQuoteValidDays: number;
  defaultPaymentTerms: string | null;
}

// ============================================================================
// Constants
// ============================================================================

const MENSAGENS_PADRAO = {
  messageThankYou: `Olá {cliente}!

Muito obrigado pela sua compra na {empresa}!

Esperamos que você esteja satisfeito com seu novo {produto}. Se precisar de qualquer assistência, estamos sempre à disposição.

Volte sempre!
{empresa}
{telefone}`,

  messageQuote: `Olá {cliente}!

Segue o orçamento solicitado:

{detalhes_orcamento}

Valor total: {valor}

Este orçamento é válido por 7 dias.

Ficamos à disposição para esclarecer dúvidas.

Atenciosamente,
{empresa}
{telefone}`,

  messageReminder: `Olá {cliente}!

Este é um lembrete amigável sobre seu compromisso na {empresa}.

Data: {data}
Horário: {horario}

Aguardamos você!

{empresa}
{telefone}`,

  messageBirthday: `Feliz Aniversário, {cliente}!

A equipe da {empresa} deseja um dia maravilhoso!

Como presente, preparamos uma condição especial para você. Venha nos visitar!

{empresa}
{telefone}`,
};

const THEME_COLORS = [
  { name: "Azul", hex: "#2563eb" },
  { name: "Verde", hex: "#16a34a" },
  { name: "Vermelho", hex: "#dc2626" },
  { name: "Roxo", hex: "#9333ea" },
  { name: "Laranja", hex: "#ea580c" },
  { name: "Dourado", hex: "#ca8a04" },
  { name: "Rosa", hex: "#db2777" },
  { name: "Cinza Escuro", hex: "#475569" },
];

const PAYMENT_METHODS = [
  { value: "CASH", label: "Dinheiro" },
  { value: "PIX", label: "PIX" },
  { value: "DEBIT_CARD", label: "Cartão de Débito" },
  { value: "CREDIT_CARD", label: "Cartão de Crédito" },
  { value: "BOLETO", label: "Boleto" },
  { value: "STORE_CREDIT", label: "Crediário" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "AGREEMENT", label: "Convênio" },
  { value: "OTHER", label: "Outro" },
] as const;

const ALL_PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map((m) => m.value);

// ============================================================================
// Helper: load/save theme color
// ============================================================================

function loadThemeColor(): string {
  if (typeof window === "undefined") return THEME_COLORS[0].hex;
  return localStorage.getItem("theme-color") || THEME_COLORS[0].hex;
}

function saveThemeColor(hex: string) {
  localStorage.setItem("theme-color", hex);
  applyThemeColor(hex);
}

function applyThemeColor(hex: string) {
  const root = document.documentElement;
  // Convert hex to HSL for CSS custom property
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  const hDeg = Math.round(h * 360);
  const sPercent = Math.round(s * 100);
  const lPercent = Math.round(l * 100);

  root.style.setProperty("--primary", `${hDeg} ${sPercent}% ${lPercent}%`);
  root.style.setProperty(
    "--primary-foreground",
    lPercent > 55 ? "0 0% 10%" : "0 0% 98%"
  );
}

// ============================================================================
// Helper: load/save payment methods
// ============================================================================

function loadEnabledPaymentMethods(): string[] {
  if (typeof window === "undefined") return ALL_PAYMENT_METHOD_VALUES;
  const stored = localStorage.getItem("enabled-payment-methods");
  if (!stored) return ALL_PAYMENT_METHOD_VALUES;
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : ALL_PAYMENT_METHOD_VALUES;
  } catch {
    return ALL_PAYMENT_METHOD_VALUES;
  }
}

function saveEnabledPaymentMethods(methods: string[]) {
  localStorage.setItem("enabled-payment-methods", JSON.stringify(methods));
}

// ============================================================================
// Main component
// ============================================================================

function ConfiguracoesPage() {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<CompanySettings>({
    displayName: "",
    cnpj: "",
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    logoUrl: null,
    messageThankYou: MENSAGENS_PADRAO.messageThankYou,
    messageQuote: MENSAGENS_PADRAO.messageQuote,
    messageReminder: MENSAGENS_PADRAO.messageReminder,
    messageBirthday: MENSAGENS_PADRAO.messageBirthday,
    pdfHeaderText: "",
    pdfFooterText: "Obrigado pela preferência!",
    defaultQuoteValidDays: 15,
    defaultPaymentTerms: "",
  });

  const [themeColor, setThemeColor] = useState<string>(THEME_COLORS[0].hex);
  const [enabledPaymentMethods, setEnabledPaymentMethods] = useState<string[]>(
    ALL_PAYMENT_METHOD_VALUES
  );

  // ---------------------------------------------------------------------------
  // Load settings on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetchSettings();
    // Load localStorage values on client
    const savedColor = loadThemeColor();
    setThemeColor(savedColor);
    applyThemeColor(savedColor);
    setEnabledPaymentMethods(loadEnabledPaymentMethods());
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const res = await fetch("/api/company/settings");
      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        setSettings({
          id: d.id,
          displayName: d.displayName ?? "",
          cnpj: d.cnpj ?? "",
          phone: d.phone ?? "",
          whatsapp: d.whatsapp ?? "",
          email: d.email ?? "",
          address: d.address ?? "",
          city: d.city ?? "",
          state: d.state ?? "",
          zipCode: d.zipCode ?? "",
          logoUrl: d.logoUrl ?? null,
          messageThankYou: d.messageThankYou ?? MENSAGENS_PADRAO.messageThankYou,
          messageQuote: d.messageQuote ?? MENSAGENS_PADRAO.messageQuote,
          messageReminder: d.messageReminder ?? MENSAGENS_PADRAO.messageReminder,
          messageBirthday: d.messageBirthday ?? MENSAGENS_PADRAO.messageBirthday,
          pdfHeaderText: d.pdfHeaderText ?? "",
          pdfFooterText: d.pdfFooterText ?? "Obrigado pela preferência!",
          defaultQuoteValidDays: d.defaultQuoteValidDays ?? 15,
          defaultPaymentTerms: d.defaultPaymentTerms ?? "",
        });
      }
    } catch {
      toast.error("Erro ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Save settings
  // ---------------------------------------------------------------------------
  async function handleSalvarConfiguracoes() {
    setSaving(true);
    try {
      const payload = {
        displayName: settings.displayName || null,
        cnpj: settings.cnpj || null,
        phone: settings.phone || null,
        whatsapp: settings.whatsapp || null,
        email: settings.email || null,
        address: settings.address || null,
        city: settings.city || null,
        state: settings.state || null,
        zipCode: settings.zipCode || null,
        messageThankYou: settings.messageThankYou || null,
        messageQuote: settings.messageQuote || null,
        messageReminder: settings.messageReminder || null,
        messageBirthday: settings.messageBirthday || null,
        pdfHeaderText: settings.pdfHeaderText || null,
        pdfFooterText: settings.pdfFooterText || null,
        defaultQuoteValidDays: settings.defaultQuoteValidDays,
        defaultPaymentTerms: settings.defaultPaymentTerms || null,
      };

      const res = await fetch("/api/company/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Erro ao salvar.");
      }

      toast.success("Configurações salvas com sucesso!");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro ao salvar configurações.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Logo upload / delete
  // ---------------------------------------------------------------------------
  async function handleUploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);

      const res = await fetch("/api/company/logo", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Erro ao enviar logo.");
      }

      setSettings((prev) => ({ ...prev, logoUrl: json.data.logoUrl }));
      toast.success("Logo enviada com sucesso!");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro ao enviar logo.";
      toast.error(message);
    } finally {
      setUploadingLogo(false);
      // Reset file input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDeleteLogo() {
    setDeletingLogo(true);
    try {
      const res = await fetch("/api/company/logo", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Erro ao remover logo.");
      }

      setSettings((prev) => ({ ...prev, logoUrl: null }));
      toast.success("Logo removida com sucesso!");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro ao remover logo.";
      toast.error(message);
    } finally {
      setDeletingLogo(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Theme color
  // ---------------------------------------------------------------------------
  function handleSelectThemeColor(hex: string) {
    setThemeColor(hex);
    saveThemeColor(hex);
    toast.success("Tema atualizado!");
  }

  // ---------------------------------------------------------------------------
  // Payment methods
  // ---------------------------------------------------------------------------
  function handleTogglePaymentMethod(method: string) {
    setEnabledPaymentMethods((prev) => {
      const updated = prev.includes(method)
        ? prev.filter((m) => m !== method)
        : [...prev, method];
      saveEnabledPaymentMethods(updated);
      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // Restore default messages
  // ---------------------------------------------------------------------------
  function handleRestaurarMensagem(
    campo: keyof typeof MENSAGENS_PADRAO
  ) {
    setSettings((prev) => ({ ...prev, [campo]: MENSAGENS_PADRAO[campo] }));
    toast.success("Mensagem padrão restaurada.");
  }

  // ---------------------------------------------------------------------------
  // Update helpers
  // ---------------------------------------------------------------------------
  function updateField(field: keyof CompanySettings, value: string | number) {
    setSettings((prev) => ({ ...prev, [field]: value }));
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configurações</h1>
          <p className="text-muted-foreground">
            Gerencie as configurações do sistema
          </p>
        </div>
        <Button onClick={handleSalvarConfiguracoes} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {saving ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="empresa" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="empresa">
            <Building2 className="mr-2 h-4 w-4" />
            Empresa
          </TabsTrigger>
          <TabsTrigger value="logo">
            <Image className="mr-2 h-4 w-4" />
            Logo
          </TabsTrigger>
          <TabsTrigger value="tema">
            <Palette className="mr-2 h-4 w-4" />
            Tema
          </TabsTrigger>
          <TabsTrigger value="pagamentos">
            <CreditCard className="mr-2 h-4 w-4" />
            Pagamentos
          </TabsTrigger>
          <TabsTrigger value="mensagens">
            <MessageSquare className="mr-2 h-4 w-4" />
            Mensagens
          </TabsTrigger>
          <TabsTrigger value="pdf">
            <FileText className="mr-2 h-4 w-4" />
            PDF
          </TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* Tab: Dados da Empresa                                             */}
        {/* ================================================================ */}
        <TabsContent value="empresa" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Informações da Empresa
              </CardTitle>
              <CardDescription>
                Dados que serão utilizados em documentos e mensagens
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Nome da Empresa</Label>
                  <Input
                    id="displayName"
                    value={settings.displayName ?? ""}
                    onChange={(e) => updateField("displayName", e.target.value)}
                    placeholder="Nome fantasia"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cnpj">CNPJ</Label>
                  <Input
                    id="cnpj"
                    value={settings.cnpj ?? ""}
                    onChange={(e) => updateField("cnpj", e.target.value)}
                    placeholder="00.000.000/0001-00"
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={settings.email ?? ""}
                    onChange={(e) => updateField("email", e.target.value)}
                    placeholder="contato@empresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefone
                  </Label>
                  <Input
                    id="phone"
                    value={settings.phone ?? ""}
                    onChange={(e) => updateField("phone", e.target.value)}
                    placeholder="(00) 0000-0000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <Input
                    id="whatsapp"
                    value={settings.whatsapp ?? ""}
                    onChange={(e) => updateField("whatsapp", e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="address" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Endereço
                </Label>
                <Input
                  id="address"
                  value={settings.address ?? ""}
                  onChange={(e) => updateField("address", e.target.value)}
                  placeholder="Rua, número, complemento"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    value={settings.city ?? ""}
                    onChange={(e) => updateField("city", e.target.value)}
                    placeholder="Cidade"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  <Input
                    id="state"
                    value={settings.state ?? ""}
                    onChange={(e) => updateField("state", e.target.value)}
                    maxLength={2}
                    placeholder="UF"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zipCode">CEP</Label>
                  <Input
                    id="zipCode"
                    value={settings.zipCode ?? ""}
                    onChange={(e) => updateField("zipCode", e.target.value)}
                    placeholder="00000-000"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* Tab: Logo                                                         */}
        {/* ================================================================ */}
        <TabsContent value="logo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Logo da Empresa
              </CardTitle>
              <CardDescription>
                Envie o logotipo da sua empresa. Formatos aceitos: PNG, JPG, SVG.
                Tamanho máximo: 2MB.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current logo preview */}
              <div className="flex flex-col items-center gap-4">
                {settings.logoUrl ? (
                  <div className="relative">
                    <div className="border rounded-lg p-4 bg-muted/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={settings.logoUrl}
                        alt="Logo da empresa"
                        className="max-h-40 max-w-xs object-contain"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-12 flex flex-col items-center gap-3 text-muted-foreground">
                    <Image className="h-12 w-12" />
                    <p className="text-sm">Nenhuma logo cadastrada</p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                  className="hidden"
                  onChange={handleUploadLogo}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {uploadingLogo ? "Enviando..." : "Enviar Logo"}
                </Button>

                {settings.logoUrl && (
                  <Button
                    variant="destructive"
                    onClick={handleDeleteLogo}
                    disabled={deletingLogo}
                  >
                    {deletingLogo ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    {deletingLogo ? "Removendo..." : "Remover Logo"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* Tab: Tema / Cor                                                   */}
        {/* ================================================================ */}
        <TabsContent value="tema" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Cor do Tema
              </CardTitle>
              <CardDescription>
                Escolha a cor principal do sistema. A cor será aplicada
                imediatamente e salva no navegador.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {THEME_COLORS.map((color) => {
                  const isSelected = themeColor === color.hex;
                  return (
                    <button
                      key={color.hex}
                      type="button"
                      onClick={() => handleSelectThemeColor(color.hex)}
                      className={`
                        relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all
                        hover:scale-105 cursor-pointer
                        ${
                          isSelected
                            ? "border-foreground shadow-lg ring-2 ring-offset-2 ring-foreground/20"
                            : "border-muted hover:border-muted-foreground/40"
                        }
                      `}
                    >
                      <div
                        className="h-12 w-12 rounded-full shadow-inner border"
                        style={{ backgroundColor: color.hex }}
                      />
                      <span className="text-sm font-medium">{color.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {color.hex}
                      </span>
                      {isSelected && (
                        <div
                          className="absolute top-2 right-2 h-3 w-3 rounded-full"
                          style={{ backgroundColor: color.hex }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 p-4 rounded-lg border bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  <Info className="inline h-4 w-4 mr-1 -mt-0.5" />
                  A cor selecionada é salva localmente no navegador e aplicada
                  automaticamente. Cada usuário pode ter sua própria preferência.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* Tab: Métodos de Pagamento                                         */}
        {/* ================================================================ */}
        <TabsContent value="pagamentos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Métodos de Pagamento
              </CardTitle>
              <CardDescription>
                Ative ou desative os métodos de pagamento disponíveis no sistema.
                Métodos desativados não aparecerão nas opções de venda.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {PAYMENT_METHODS.map((method) => {
                  const isEnabled = enabledPaymentMethods.includes(
                    method.value
                  );
                  return (
                    <div
                      key={method.value}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="space-y-0.5">
                        <Label className="text-base">{method.label}</Label>
                        <p className="text-xs text-muted-foreground">
                          {method.value}
                        </p>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() =>
                          handleTogglePaymentMethod(method.value)
                        }
                      />
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 p-4 rounded-lg border bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  <Info className="inline h-4 w-4 mr-1 -mt-0.5" />
                  As preferências de pagamento são salvas localmente no
                  navegador. Métodos desativados não serão exibidos no momento de
                  registrar vendas.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* Tab: Mensagens                                                    */}
        {/* ================================================================ */}
        <TabsContent value="mensagens" className="space-y-4">
          {/* Card de Ajuda */}
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-900">
                <Info className="h-5 w-5" />
                Variáveis Disponíveis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-900">
                <div>
                  <p className="font-semibold mb-2">Dados da Empresa:</p>
                  <ul className="space-y-1 ml-4">
                    <li>
                      <code className="bg-blue-100 px-1 rounded">
                        {"{ empresa }"}
                      </code>{" "}
                      - Nome da empresa
                    </li>
                    <li>
                      <code className="bg-blue-100 px-1 rounded">
                        {"{ telefone }"}
                      </code>{" "}
                      - Telefone da empresa
                    </li>
                    <li>
                      <code className="bg-blue-100 px-1 rounded">
                        {"{ whatsapp }"}
                      </code>{" "}
                      - WhatsApp da empresa
                    </li>
                    <li>
                      <code className="bg-blue-100 px-1 rounded">
                        {"{ endereco }"}
                      </code>{" "}
                      - Endereço completo
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold mb-2">Dados do Cliente/Venda:</p>
                  <ul className="space-y-1 ml-4">
                    <li>
                      <code className="bg-blue-100 px-1 rounded">
                        {"{ cliente }"}
                      </code>{" "}
                      - Nome do cliente
                    </li>
                    <li>
                      <code className="bg-blue-100 px-1 rounded">
                        {"{ produto }"}
                      </code>{" "}
                      - Nome do produto
                    </li>
                    <li>
                      <code className="bg-blue-100 px-1 rounded">
                        {"{ valor }"}
                      </code>{" "}
                      - Valor total
                    </li>
                    <li>
                      <code className="bg-blue-100 px-1 rounded">
                        {"{ data }"}
                      </code>{" "}
                      - Data
                    </li>
                    <li>
                      <code className="bg-blue-100 px-1 rounded">
                        {"{ horario }"}
                      </code>{" "}
                      - Horário
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mensagem de Agradecimento */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Mensagem de Agradecimento</CardTitle>
                  <CardDescription>
                    Enviada após a conclusão de uma venda
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestaurarMensagem("messageThankYou")}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restaurar Padrão
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={settings.messageThankYou ?? ""}
                onChange={(e) =>
                  updateField("messageThankYou", e.target.value)
                }
                rows={8}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>

          {/* Mensagem de Orçamento */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Mensagem de Orçamento</CardTitle>
                  <CardDescription>
                    Enviada ao compartilhar um orçamento com o cliente
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestaurarMensagem("messageQuote")}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restaurar Padrão
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={settings.messageQuote ?? ""}
                onChange={(e) => updateField("messageQuote", e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>

          {/* Mensagem de Lembrete */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Mensagem de Lembrete</CardTitle>
                  <CardDescription>
                    Enviada para lembrar compromissos agendados
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestaurarMensagem("messageReminder")}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restaurar Padrão
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={settings.messageReminder ?? ""}
                onChange={(e) =>
                  updateField("messageReminder", e.target.value)
                }
                rows={8}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>

          {/* Mensagem de Aniversário */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Mensagem de Aniversário</CardTitle>
                  <CardDescription>
                    Enviada automaticamente no aniversário do cliente
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestaurarMensagem("messageBirthday")}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restaurar Padrão
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={settings.messageBirthday ?? ""}
                onChange={(e) =>
                  updateField("messageBirthday", e.target.value)
                }
                rows={8}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================ */}
        {/* Tab: Configurações de PDF                                         */}
        {/* ================================================================ */}
        <TabsContent value="pdf" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Personalização de Documentos PDF
              </CardTitle>
              <CardDescription>
                Configure como os documentos PDF serão gerados
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pdfHeaderText">Texto do Cabeçalho</Label>
                <Input
                  id="pdfHeaderText"
                  value={settings.pdfHeaderText ?? ""}
                  onChange={(e) =>
                    updateField("pdfHeaderText", e.target.value)
                  }
                  placeholder="Texto exibido no topo dos documentos PDF"
                />
                <p className="text-xs text-muted-foreground">
                  Este texto aparecerá no cabeçalho de todos os documentos PDF
                  gerados
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="pdfFooterText">Mensagem de Rodapé</Label>
                <Input
                  id="pdfFooterText"
                  value={settings.pdfFooterText ?? ""}
                  onChange={(e) =>
                    updateField("pdfFooterText", e.target.value)
                  }
                  placeholder="Mensagem que aparece no final do documento"
                />
                <p className="text-xs text-muted-foreground">
                  Esta mensagem aparecerá ao final de todos os documentos PDF
                  gerados
                </p>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultQuoteValidDays">
                    Validade do Orçamento (dias)
                  </Label>
                  <Input
                    id="defaultQuoteValidDays"
                    type="number"
                    min={1}
                    value={settings.defaultQuoteValidDays}
                    onChange={(e) =>
                      updateField(
                        "defaultQuoteValidDays",
                        parseInt(e.target.value) || 15
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Número de dias padrão para validade de orçamentos
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultPaymentTerms">
                    Condições de Pagamento Padrão
                  </Label>
                  <Input
                    id="defaultPaymentTerms"
                    value={settings.defaultPaymentTerms ?? ""}
                    onChange={(e) =>
                      updateField("defaultPaymentTerms", e.target.value)
                    }
                    placeholder="Ex: 30/60/90 dias"
                  />
                  <p className="text-xs text-muted-foreground">
                    Condições de pagamento exibidas por padrão em orçamentos
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="settings.access">
      <ConfiguracoesPage />
    </ProtectedRoute>
  );
}
