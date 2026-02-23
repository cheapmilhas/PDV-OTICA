"use client";

import { useState, useEffect, useRef, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, Trash2, Save, ArrowLeft } from "lucide-react";
import Image from "next/image";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

interface CompanySettings {
  id?: string;
  displayName?: string | null;
  cnpj?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  logoUrl?: string | null;
  messageThankYou?: string | null;
  messageQuote?: string | null;
  messageReminder?: string | null;
  messageBirthday?: string | null;
  pdfHeaderText?: string | null;
  pdfFooterText?: string | null;
  defaultQuoteValidDays?: number;
  defaultPaymentTerms?: string | null;
}

function CompanySettingsPageContent() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<CompanySettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Carregar configurações
  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await fetch("/api/company/settings");
        const result = await response.json();

        if (result.success) {
          setSettings(result.data);
        }
      } catch (error) {
        console.error("Erro ao carregar configurações:", error);
        toast.error("Erro ao carregar configurações");
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  // Salvar configurações
  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch("/api/company/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      const result = await response.json();

      if (result.success) {
        toast.success("Configurações salvas com sucesso!");
        setSettings(result.data);
      } else {
        toast.error(result.message || "Erro ao salvar configurações");
      }
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  }

  // Upload de logo
  async function handleLogoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Tipo de arquivo inválido. Use PNG, JPG ou SVG.");
      return;
    }

    // Validar tamanho (2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo: 2MB");
      return;
    }

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);

      const response = await fetch("/api/company/logo", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        toast.success("Logo atualizada com sucesso!");
        setSettings((prev) => ({ ...prev, logoUrl: result.data.logoUrl }));
      } else {
        toast.error(result.message || "Erro ao fazer upload");
      }
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      toast.error("Erro ao fazer upload da logo");
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  // Deletar logo
  async function handleDeleteLogo() {
    if (!confirm("Deseja realmente remover a logo?")) return;

    try {
      const response = await fetch("/api/company/logo", {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        toast.success("Logo removida com sucesso!");
        setSettings((prev) => ({ ...prev, logoUrl: null }));
      } else {
        toast.error(result.message || "Erro ao remover logo");
      }
    } catch (error) {
      console.error("Erro ao deletar logo:", error);
      toast.error("Erro ao remover logo");
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="h-32 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/configuracoes")}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <h1 className="text-3xl font-bold">Configurações da Empresa</h1>
          <p className="text-gray-600 mt-1">
            Gerencie as informações e aparência da sua empresa
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <div className="space-y-6">
        {/* Logo */}
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">Logotipo</h2>
          <p className="text-sm text-gray-600 mb-4">
            Formatos aceitos: PNG, JPG, SVG • Tamanho máximo: 2MB
          </p>

          <div className="flex items-start gap-4">
            {/* Preview */}
            <div className="w-48 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 relative">
              {settings.logoUrl ? (
                <Image
                  src={settings.logoUrl}
                  alt="Logo"
                  fill
                  className="object-contain p-2"
                />
              ) : (
                <span className="text-gray-400 text-sm">Sem logo</span>
              )}
            </div>

            {/* Botões */}
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploadingLogo ? "Enviando..." : "Fazer Upload"}
              </Button>
              {settings.logoUrl && (
                <Button variant="outline" onClick={handleDeleteLogo}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remover Logo
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Dados da Empresa */}
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">Dados da Empresa</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="displayName">Nome de Exibição</Label>
              <Input
                id="displayName"
                value={settings.displayName || ""}
                onChange={(e) =>
                  setSettings({ ...settings, displayName: e.target.value })
                }
                placeholder="Ex: Ótica Visão Perfeita"
              />
            </div>
            <div>
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                value={settings.cnpj || ""}
                onChange={(e) =>
                  setSettings({ ...settings, cnpj: e.target.value })
                }
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div>
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={settings.phone || ""}
                onChange={(e) =>
                  setSettings({ ...settings, phone: e.target.value })
                }
                placeholder="(00) 0000-0000"
              />
            </div>
            <div>
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                value={settings.whatsapp || ""}
                onChange={(e) =>
                  setSettings({ ...settings, whatsapp: e.target.value })
                }
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={settings.email || ""}
                onChange={(e) =>
                  setSettings({ ...settings, email: e.target.value })
                }
                placeholder="contato@empresa.com"
              />
            </div>
          </div>
        </div>

        {/* Endereço */}
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">Endereço</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="address">Logradouro</Label>
              <Input
                id="address"
                value={settings.address || ""}
                onChange={(e) =>
                  setSettings({ ...settings, address: e.target.value })
                }
                placeholder="Rua, Avenida, etc."
              />
            </div>
            <div>
              <Label htmlFor="zipCode">CEP</Label>
              <Input
                id="zipCode"
                value={settings.zipCode || ""}
                onChange={(e) =>
                  setSettings({ ...settings, zipCode: e.target.value })
                }
                placeholder="00000-000"
              />
            </div>
            <div>
              <Label htmlFor="city">Cidade</Label>
              <Input
                id="city"
                value={settings.city || ""}
                onChange={(e) =>
                  setSettings({ ...settings, city: e.target.value })
                }
                placeholder="Cidade"
              />
            </div>
            <div>
              <Label htmlFor="state">Estado</Label>
              <Input
                id="state"
                value={settings.state || ""}
                onChange={(e) =>
                  setSettings({ ...settings, state: e.target.value })
                }
                placeholder="UF"
                maxLength={2}
              />
            </div>
          </div>
        </div>

        {/* Mensagens Personalizadas */}
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">Mensagens Personalizadas</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="pdfFooterText">Rodapé dos Impressos</Label>
              <Input
                id="pdfFooterText"
                value={settings.pdfFooterText || ""}
                onChange={(e) =>
                  setSettings({ ...settings, pdfFooterText: e.target.value })
                }
                placeholder="Ex: Obrigado pela preferência!"
              />
            </div>
            <div>
              <Label htmlFor="messageQuote">Mensagem para Orçamentos</Label>
              <Textarea
                id="messageQuote"
                value={settings.messageQuote || ""}
                onChange={(e) =>
                  setSettings({ ...settings, messageQuote: e.target.value })
                }
                placeholder="Mensagem que aparece em orçamentos enviados"
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Configurações de Orçamento */}
        <div className="bg-white p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">Orçamentos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="defaultQuoteValidDays">Validade Padrão (dias)</Label>
              <Input
                id="defaultQuoteValidDays"
                type="number"
                value={settings.defaultQuoteValidDays || 15}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultQuoteValidDays: parseInt(e.target.value) || 15,
                  })
                }
                min={1}
              />
            </div>
            <div>
              <Label htmlFor="defaultPaymentTerms">Condições de Pagamento</Label>
              <Input
                id="defaultPaymentTerms"
                value={settings.defaultPaymentTerms || ""}
                onChange={(e) =>
                  setSettings({ ...settings, defaultPaymentTerms: e.target.value })
                }
                placeholder="Ex: À vista, PIX, Cartão"
              />
            </div>
          </div>
        </div>

        {/* Botão Salvar */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="lg">
            <Save className="h-5 w-5 mr-2" />
            {saving ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CompanySettingsPage() {
  return (
    <ProtectedRoute permission="company.settings">
      <CompanySettingsPageContent />
    </ProtectedRoute>
  );
}
