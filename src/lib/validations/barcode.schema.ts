import { z } from "zod";
import { BarcodeType } from "@prisma/client";

/**
 * Schema para criação de código de barras
 */
export const createBarcodeSchema = z.object({
  productId: z.string().cuid("ID do produto inválido"),

  type: z.nativeEnum(BarcodeType, {
    message: "Tipo de código inválido",
  }),

  code: z
    .string()
    .min(1, "Código não pode estar vazio")
    .max(100, "Código deve ter no máximo 100 caracteres")
    .optional(), // Opcional porque pode ser gerado automaticamente

  isPrimary: z.boolean().default(false),
});

/**
 * Schema para query params de listagem
 */
export const barcodeQuerySchema = z.object({
  productId: z.string().cuid().optional(),
  type: z.nativeEnum(BarcodeType).optional(),
  code: z.string().optional(), // Para buscar por código específico
});

/**
 * Type inference
 */
export type CreateBarcodeDTO = z.infer<typeof createBarcodeSchema>;
export type BarcodeQuery = z.infer<typeof barcodeQuerySchema>;

/**
 * Helper para obter label em português do tipo de código
 */
export function getBarcodeTypeLabel(type: BarcodeType): string {
  const labels: Record<BarcodeType, string> = {
    EAN13: "Código de Barras (EAN-13)",
    CODE128: "Código de Barras (Code-128)",
    QRCODE: "QR Code",
  };

  return labels[type] || type;
}

/**
 * Helper para obter opções de tipos de código
 */
export function getBarcodeTypeOptions() {
  return [
    {
      value: BarcodeType.EAN13,
      label: "Código de Barras (EAN-13)",
      description: "Padrão internacional de 13 dígitos",
    },
    {
      value: BarcodeType.CODE128,
      label: "Código de Barras (Code-128)",
      description: "Aceita letras e números",
    },
    {
      value: BarcodeType.QRCODE,
      label: "QR Code",
      description: "Código 2D, pode armazenar mais dados",
    },
  ];
}

/**
 * Gera um código EAN-13 válido baseado no SKU do produto
 */
export function generateEAN13(sku: string): string {
  // Remove caracteres não numéricos do SKU
  const numericSku = sku.replace(/\D/g, "");

  // Adiciona timestamp para garantir unicidade
  const timestamp = Date.now().toString().slice(-6); // Últimos 6 dígitos do timestamp

  // Combina SKU com timestamp, pega os primeiros 12 dígitos ou preenche com zeros
  let code = (numericSku + timestamp).padStart(12, "0").substring(0, 12);

  // Calcula o dígito verificador
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  code += checkDigit;

  return code;
}

/**
 * Gera um código Code-128 baseado no SKU do produto
 */
export function generateCode128(sku: string): string {
  // Code-128 aceita alfanuméricos, então podemos usar o SKU diretamente
  // Adiciona timestamp para garantir unicidade
  const timestamp = Date.now().toString().slice(-6);
  return `INT-${sku.toUpperCase()}-${timestamp}`;
}

/**
 * Gera dados para QR Code
 */
export function generateQRCodeData(product: {
  id: string;
  sku: string;
  name: string;
  salePrice: number;
}): string {
  // Retorna JSON com dados do produto
  return JSON.stringify({
    id: product.id,
    sku: product.sku,
    name: product.name,
    price: product.salePrice,
    type: "product",
    timestamp: new Date().toISOString(),
  });
}

/**
 * Valida formato de código EAN-13
 */
export function validateEAN13(code: string): boolean {
  // Deve ter exatamente 13 dígitos
  if (!/^\d{13}$/.test(code)) {
    return false;
  }

  // Valida dígito verificador
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(code[12]);
}

/**
 * Valida formato de código Code-128
 */
export function validateCode128(code: string): boolean {
  // Code-128 aceita ASCII 0-127
  // Vamos aceitar qualquer string alfanumérica com alguns símbolos
  return /^[A-Za-z0-9\-_\.]+$/.test(code);
}

/**
 * Detecta automaticamente o tipo de código baseado no formato
 */
export function detectBarcodeType(code: string): BarcodeType | null {
  if (validateEAN13(code)) {
    return BarcodeType.EAN13;
  }

  if (code.startsWith("{") || code.startsWith("[")) {
    // Parece JSON, provável QR Code
    return BarcodeType.QRCODE;
  }

  if (validateCode128(code)) {
    return BarcodeType.CODE128;
  }

  return null;
}

/**
 * Formata código para exibição
 */
export function formatBarcode(code: string, type: BarcodeType): string {
  if (type === BarcodeType.EAN13) {
    // Formata EAN-13: 123-4567890123
    return `${code.substring(0, 3)}-${code.substring(3)}`;
  }

  if (type === BarcodeType.QRCODE) {
    // Para QR Code, se for JSON mostra resumido
    try {
      const data = JSON.parse(code);
      return `QR: ${data.sku || data.id || "..."}`;
    } catch {
      return code.length > 20 ? `${code.substring(0, 20)}...` : code;
    }
  }

  return code;
}

/**
 * Helper para sanitizar dados do DTO
 */
export function sanitizeBarcodeDTO(data: CreateBarcodeDTO): CreateBarcodeDTO {
  return {
    ...data,
    code: data.code?.trim().toUpperCase(),
  };
}
