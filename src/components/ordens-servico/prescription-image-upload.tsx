"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Loader2, X, Eye, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { track } from "@/lib/analytics";

interface OcrEyeData {
  esf: string | number | null;
  cil: string | number | null;
  eixo: string | number | null;
  dnp: string | number | null;
  altura: string | number | null;
  add: string | number | null;
  prisma: string | number | null;
  base: string | null;
}

export interface OcrPrescriptionData {
  od: OcrEyeData;
  oe: OcrEyeData;
  piLonge: string | number | null;
  piPerto: string | number | null;
  doctorName: string | null;
  doctorCrm: string | null;
  observations: string | null;
}

interface PrescriptionImageUploadProps {
  onOcrResult: (data: OcrPrescriptionData) => void;
  onImageUploaded: (url: string) => void;
  existingImageUrl?: string | null;
}

export function PrescriptionImageUpload({
  onOcrResult,
  onImageUploaded,
  existingImageUrl,
}: PrescriptionImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingImageUrl || null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const toBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove o prefixo data:image/xxx;base64,
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      if (!file) return;

      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
      if (!allowedTypes.includes(file.type)) {
        toast.error("Use imagens JPEG, PNG, WebP ou HEIC");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast.error("Imagem muito grande. Máximo 10MB.");
        return;
      }

      // Mostrar preview local imediato
      const localPreview = URL.createObjectURL(file);
      setPreviewUrl(localPreview);

      // Upload e OCR em paralelo
      setUploading(true);
      setOcrProcessing(true);

      try {
        const [base64, _uploadResult] = await Promise.all([
          toBase64(file),
          uploadImage(file),
        ]);

        // Rodar OCR com base64
        await runOcr(base64, file.type);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro ao processar imagem";
        toast.error(message);
      } finally {
        setUploading(false);
      }
    },
    [toBase64]
  );

  const uploadImage = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload/prescription-image", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "Erro ao fazer upload");
    }

    const result = await res.json();
    onImageUploaded(result.data.url);
    setPreviewUrl(result.data.url);
    return result.data;
  };

  const runOcr = async (base64: string, mimeType: string) => {
    try {
      const res = await fetch("/api/ocr/prescription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error?.message || "Erro ao ler receita");
        return;
      }

      const result = await res.json();
      track("ocr_prescription_used");
      onOcrResult(result.data);
      toast.success("Receita lida com sucesso! Confira os campos preenchidos.");
    } catch {
      toast.error("Erro ao processar OCR da receita");
    } finally {
      setOcrProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // Resetar o input para permitir selecionar o mesmo arquivo novamente
    e.target.value = "";
  };

  const removeImage = () => {
    setPreviewUrl(null);
    onImageUploaded("");
  };

  const isProcessing = uploading || ocrProcessing;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Input escondido para arquivo */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={handleFileChange}
        />
        {/* Input escondido para câmera */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isProcessing}
        >
          <Camera className="h-4 w-4 mr-2" />
          Tirar Foto
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
        >
          <Upload className="h-4 w-4 mr-2" />
          Escolher Arquivo
        </Button>

        {previewUrl && !isProcessing && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
            >
              <Eye className="h-4 w-4 mr-2" />
              {showPreview ? "Ocultar" : "Ver Imagem"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={removeImage}
              className="text-red-500 hover:text-red-700"
            >
              <X className="h-4 w-4 mr-2" />
              Remover
            </Button>
          </>
        )}
      </div>

      {/* Status de processamento */}
      {isProcessing && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <span className="text-sm text-blue-700">
            {uploading && !ocrProcessing && "Enviando imagem..."}
            {ocrProcessing && (
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Lendo receita com IA... Os campos serão preenchidos automaticamente.
              </span>
            )}
          </span>
        </div>
      )}

      {/* Preview da imagem */}
      {showPreview && previewUrl && !isProcessing && (
        <div className="relative border rounded-lg overflow-hidden bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Receita médica"
            className="max-w-full max-h-96 mx-auto object-contain"
          />
        </div>
      )}
    </div>
  );
}
