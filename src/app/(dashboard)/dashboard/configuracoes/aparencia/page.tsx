"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { Upload, Image as ImageIcon, X, Check, Palette } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const COLOR_OPTIONS = [
  { name: "Azul", value: "#3b82f6" },
  { name: "Verde", value: "#22c55e" },
  { name: "Roxo", value: "#8b5cf6" },
  { name: "Vermelho", value: "#ef4444" },
  { name: "Laranja", value: "#f97316" },
  { name: "Rosa", value: "#ec4899" },
  { name: "Índigo", value: "#6366f1" },
  { name: "Ciano", value: "#06b6d4" },
];

function AparenciaPage() {
  const { toast } = useToast();
  const { logoUrl, primaryColor, refetch } = useCompanySettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>(primaryColor || "#3b82f6");
  const [savingColor, setSavingColor] = useState(false);

  // Atualizar cor selecionada quando carregar do servidor
  useEffect(() => {
    if (primaryColor) {
      setSelectedColor(primaryColor);
    }
  }, [primaryColor]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validação de tamanho
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 2MB",
        variant: "destructive",
      });
      return;
    }

    // Validação de tipo
    if (!["image/png", "image/jpeg", "image/jpg", "image/svg+xml"].includes(file.type)) {
      toast({
        title: "Tipo de arquivo inválido",
        description: "Use arquivos PNG, JPG ou SVG",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("logo", file);

      const response = await fetch("/api/company/logo", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Logo atualizada!",
          description: "A logo foi enviada com sucesso.",
        });
        refetch();
      } else {
        throw new Error(result.message || "Erro ao fazer upload");
      }
    } catch (error) {
      toast({
        title: "Erro ao fazer upload",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveLogo = async () => {
    try {
      const response = await fetch("/api/company/logo", {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Logo removida",
          description: "A logo foi removida com sucesso.",
        });
        refetch();
      } else {
        throw new Error(result.message || "Erro ao remover logo");
      }
    } catch (error) {
      toast({
        title: "Erro ao remover logo",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
    }
  };

  const handleSaveColor = async () => {
    setSavingColor(true);

    try {
      const response = await fetch("/api/company/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryColor: selectedColor }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Cor atualizada!",
          description: "A cor primária foi atualizada com sucesso.",
        });
        refetch();

        // Aplicar cor no CSS
        document.documentElement.style.setProperty("--primary", selectedColor);
      } else {
        throw new Error(result.message || "Erro ao salvar cor");
      }
    } catch (error) {
      toast({
        title: "Erro ao salvar cor",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setSavingColor(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Aparência</h1>
        <p className="text-muted-foreground">
          Personalize a identidade visual do sistema
        </p>
      </div>

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Logotipo da Empresa
          </CardTitle>
          <CardDescription>
            Faça upload do logotipo que aparecerá no sistema e nas impressões.
            Tamanho máximo: 2MB. Formatos aceitos: PNG, JPG, SVG.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Preview */}
          {logoUrl && (
            <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/50">
              <div className="relative h-20 w-20 flex-shrink-0 bg-white rounded border">
                <Image
                  src={logoUrl}
                  alt="Logo atual"
                  fill
                  className="object-contain p-2"
                />
              </div>
              <div className="flex-1">
                <p className="font-medium">Logo atual</p>
                <p className="text-sm text-muted-foreground">{logoUrl}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemoveLogo}
              >
                <X className="h-4 w-4 mr-2" />
                Remover
              </Button>
            </div>
          )}

          {/* Upload */}
          <div className="flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Enviando..." : logoUrl ? "Alterar Logo" : "Fazer Upload"}
            </Button>
            {logoUrl && (
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Recarregar Página
              </Button>
            )}
            <p className="text-sm text-muted-foreground">
              PNG, JPG ou SVG até 2MB (salva automaticamente)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cores */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Cor Primária do Sistema
          </CardTitle>
          <CardDescription>
            Escolha a cor principal que será aplicada em botões, links e destaques.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Grid de cores */}
          <div className="grid grid-cols-4 gap-3">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color.value}
                onClick={() => setSelectedColor(color.value)}
                className={cn(
                  "relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all hover:scale-105",
                  selectedColor === color.value
                    ? "border-primary shadow-md"
                    : "border-transparent hover:border-muted-foreground/20"
                )}
              >
                <div
                  className="h-12 w-12 rounded-full shadow-md"
                  style={{ backgroundColor: color.value }}
                />
                <span className="text-sm font-medium">{color.name}</span>
                {selectedColor === color.value && (
                  <div className="absolute top-2 right-2">
                    <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Preview */}
          <div className="p-6 rounded-lg border bg-muted/50 space-y-4">
            <Label>Preview da cor selecionada:</Label>
            <div className="flex gap-3 items-center">
              <Button
                style={{ backgroundColor: selectedColor }}
                className="text-white"
              >
                Botão Primário
              </Button>
              <Button
                variant="outline"
                style={{ borderColor: selectedColor, color: selectedColor }}
              >
                Botão Secundário
              </Button>
              <div
                className="px-3 py-1 rounded-full text-sm font-medium text-white"
                style={{ backgroundColor: selectedColor }}
              >
                Badge
              </div>
            </div>
          </div>

          {/* Salvar */}
          <div className="flex justify-end">
            <Button
              onClick={handleSaveColor}
              disabled={savingColor || selectedColor === primaryColor}
            >
              {savingColor ? "Salvando..." : "Salvar Cor"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="settings.access">
      <AparenciaPage />
    </ProtectedRoute>
  );
}
