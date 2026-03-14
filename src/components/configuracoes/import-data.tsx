"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Users,
  Package,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  FileSpreadsheet,
  AlertTriangle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

// ─── Types ──────────────────────────────────────────────────────

interface Branch {
  id: string;
  name: string;
}

interface StoreMapping {
  storeName: string;
  count: number;
  branchId: string;
}

interface CustomerRow {
  name: string;
  phone: string | null;
  cpf: string | null;
  rg: string | null;
  email: string | null;
  birthDate: string | null;
  gender: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  notes: string | null;
  externalId: string | null;
  branchId: string;
  createdAt: string | null;
  extraPhones: { value: string; label: string }[];
}

interface ProductRow {
  name: string;
  sku: string;
  type: string;
  brandName: string | null;
  supplierName: string | null;
  costPrice: number;
  salePrice: number;
  ncm: string | null;
  stockControlled: boolean;
  stockQty: number;
  stockMin: number;
  active: boolean;
  createdAt: string | null;
  branchId: string;
}

interface CategoryMapping {
  category: string;
  count: number;
  productType: string;
}

interface ImportResult {
  imported: number;
  duplicates: number;
  errors: number;
  errorDetails: string[];
}

// ─── Constants ──────────────────────────────────────────────────

const CATEGORY_TYPE_MAP: Record<string, string> = {
  "Lentes Oftálmicas": "OPHTHALMIC_LENS",
  "Armações Receituário": "FRAME",
  "Armações Acetato": "FRAME",
  "Armações Nylon/metal": "FRAME",
  "Óculos Solar": "SUNGLASSES",
  "Lentes de Contato": "CONTACT_LENS",
  "Acessórios": "ACCESSORY",
  "Produtos para Lentes": "LENS_SOLUTION",
  "Serviços": "SERVICE",
};

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  FRAME: "Armação",
  CONTACT_LENS: "Lente de Contato",
  ACCESSORY: "Acessório",
  SUNGLASSES: "Óculos Solar",
  LENS_SERVICE: "Serviço de Lente",
  SERVICE: "Serviço",
  OPHTHALMIC_LENS: "Lente Oftálmica",
  OPTICAL_ACCESSORY: "Acessório Óptico",
  LENS_SOLUTION: "Solução para Lentes",
  CASE: "Estojo",
  CLEANING_KIT: "Kit de Limpeza",
  OTHER: "Outro",
};

const BATCH_SIZE = 100;

// ─── Helpers ────────────────────────────────────────────────────

function formatPhone(raw: string | number | null): string | null {
  if (!raw) return null;
  let s = String(raw).replace(/[^0-9]/g, "");
  // Remove country code 55
  if (s.startsWith("55") && s.length >= 12) s = s.slice(2);
  if (s.length < 10 || s.length > 11) return s; // can't format, return as-is
  const ddd = s.slice(0, 2);
  const num = s.slice(2);
  if (num.length === 9) {
    return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  }
  return `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
}

function formatCpf(raw: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).replace(/[^0-9]/g, "");
  if (s.length === 11) return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
  if (s.length === 14) return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
  return raw;
}

function excelDateToISO(serial: number | string | null): string | null {
  if (!serial) return null;
  if (typeof serial === "string") {
    const d = new Date(serial);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  // Excel serial date
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400000);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function strOrNull(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === "" ? null : s;
}

// ─── Component ──────────────────────────────────────────────────

export function ImportData() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.json())
      .then((data) => setBranches(data.data || data.branches || data || []))
      .catch(() => {});
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Importação de Dados
        </CardTitle>
        <CardDescription>
          Importe dados do sistema anterior através de planilhas Excel (.xlsx)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ImportCard
            icon={Users}
            title="Importar Clientes"
            description="Planilha .xlsx exportada do sistema anterior"
            accept=".xlsx"
            branches={branches}
            type="customers"
          />
          <ImportCard
            icon={Package}
            title="Importar Produtos"
            description="Planilha .xlsx ou múltiplas planilhas por loja"
            accept=".xlsx"
            branches={branches}
            type="products"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Import Card ────────────────────────────────────────────────

function ImportCard({
  icon: Icon,
  title,
  description,
  accept,
  branches,
  type,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  accept: string;
  branches: Branch[];
  type: "customers" | "products";
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Shared state
  const [storeMappings, setStoreMappings] = useState<StoreMapping[]>([]);
  const [keepOriginalDate, setKeepOriginalDate] = useState(true);
  const [onlyActive, setOnlyActive] = useState(true);

  // Customer-specific
  const [customerRows, setCustomerRows] = useState<CustomerRow[]>([]);
  const [customerStats, setCustomerStats] = useState<Record<string, number>>({});

  // Product-specific
  const [productRows, setProductRows] = useState<ProductRow[]>([]);
  const [productStats, setProductStats] = useState<Record<string, number>>({});
  const [categoryMappings, setCategoryMappings] = useState<CategoryMapping[]>([]);
  const [productFiles, setProductFiles] = useState<File[]>([]);

  // Progress
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  const resetState = () => {
    setStep(1);
    setStoreMappings([]);
    setCustomerRows([]);
    setCustomerStats({});
    setProductRows([]);
    setProductStats({});
    setCategoryMappings([]);
    setProductFiles([]);
    setProgress(0);
    setProgressText("");
    setResult(null);
    setImporting(false);
    setKeepOriginalDate(true);
    setOnlyActive(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      if (type === "customers") {
        await parseCustomerFile(files[0]);
      } else {
        await parseProductFiles(Array.from(files));
      }
      setDialogOpen(true);
    } catch (err) {
      toast({
        title: "Erro ao ler arquivo",
        description: err instanceof Error ? err.message : "Formato inválido.",
        variant: "destructive",
      });
    }

    // Reset file input
    if (fileRef.current) fileRef.current.value = "";
  };

  // ─── Parse Customers ───────────────────────────────────────

  const parseCustomerFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

    // Detect stores
    const storeMap = new Map<string, number>();
    raw.forEach((r) => {
      const store = strOrNull(r["Cadastrado Em"]) || "Desconhecida";
      storeMap.set(store, (storeMap.get(store) || 0) + 1);
    });

    setStoreMappings(
      Array.from(storeMap.entries()).map(([storeName, count]) => ({
        storeName,
        count,
        branchId: "",
      }))
    );

    // Stats
    const stats: Record<string, number> = { total: raw.length };
    const fieldsToCount = ["celular", "telefone", "Documento", "email", "Endereço", "Cidade", "Data de Nascimento"];
    fieldsToCount.forEach((f) => {
      stats[f] = raw.filter((r) => r[f] !== null && r[f] !== undefined && String(r[f]).trim() !== "").length;
    });
    setCustomerStats(stats);

    // Pre-parse rows (without branchId - will be set at import time)
    const rows: CustomerRow[] = raw.map((r) => {
      const extraPhones: { value: string; label: string }[] = [];
      const telefoneFixo = formatPhone(r["telefone"] as string);
      if (telefoneFixo) extraPhones.push({ value: telefoneFixo, label: "Telefone fixo" });
      for (let i = 1; i <= 5; i++) {
        const cel = formatPhone(r[`celular${i}`] as string);
        if (cel) extraPhones.push({ value: cel, label: `Celular ${i + 1}` });
      }

      return {
        name: strOrNull(r["Nome / Razão Social"]) || "Sem nome",
        phone: formatPhone(r["celular"] as string),
        cpf: formatCpf(strOrNull(r["Documento"] as string)),
        rg: strOrNull(r["RG / IE"] as string),
        email: strOrNull(r["email"] as string),
        birthDate: excelDateToISO(r["Data de Nascimento"] as number),
        gender: strOrNull(r["Sexo"] as string),
        address: strOrNull(r["Endereço"] as string),
        number: strOrNull(r["Número"] as string),
        complement: strOrNull(r["Complemento"] as string),
        neighborhood: strOrNull(r["Bairro"] as string),
        city: strOrNull(r["Cidade"] as string),
        state: strOrNull(r["Estado"] as string),
        zipCode: strOrNull(r["CEP"] as string),
        notes: strOrNull(r["Observação"] as string),
        externalId: r["Cliente ID"] ? String(r["Cliente ID"]) : null,
        branchId: "", // Filled based on store mapping
        createdAt: keepOriginalDate ? excelDateToISO(r["Data do Cadastro"] as number) : null,
        extraPhones,
        _storeName: strOrNull(r["Cadastrado Em"]) || "Desconhecida",
        _active: strOrNull(r["Ativo"] as string),
      } as CustomerRow & { _storeName: string; _active: string | null };
    });

    setCustomerRows(rows as CustomerRow[]);
  };

  // ─── Parse Products ────────────────────────────────────────

  const parseProductFiles = async (files: File[]) => {
    setProductFiles(files);
    const allRows: (ProductRow & { _storeName: string })[] = [];
    const storeMap = new Map<string, number>();
    const catMap = new Map<string, number>();

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

      storeMap.set(sheetName, raw.length);

      raw.forEach((r) => {
        const cat = strOrNull(r["Grupo"] as string) || "Outros";
        catMap.set(cat, (catMap.get(cat) || 0) + 1);

        allRows.push({
          name: strOrNull(r["Descrição"] as string) || "Sem nome",
          sku: String(r["Referência"] || "").trim(),
          type: CATEGORY_TYPE_MAP[cat] || "OTHER",
          brandName: strOrNull(r["Grife"] as string),
          supplierName: strOrNull(r["Fornecedor"] as string),
          costPrice: Number(r["Preço de custo"]) || 0,
          salePrice: Number(r["Preço de Venda"]) || 0,
          ncm: r["Ncm"] ? String(r["Ncm"]) : null,
          stockControlled: strOrNull(r["Controlar Estoque"] as string) === "SIM",
          stockQty: Number(r["Estoque Atual"]) || 0,
          stockMin: Number(r["Estoque Minimo"]) || 0,
          active: strOrNull(r["Ativo"] as string) === "SIM",
          createdAt: excelDateToISO(r["Data Cadastro"] as number),
          branchId: "",
          _storeName: sheetName,
        });
      });
    }

    setStoreMappings(
      Array.from(storeMap.entries()).map(([storeName, count]) => ({
        storeName,
        count,
        branchId: "",
      }))
    );

    setCategoryMappings(
      Array.from(catMap.entries()).map(([category, count]) => ({
        category,
        count,
        productType: CATEGORY_TYPE_MAP[category] || "OTHER",
      }))
    );

    // Stats
    const stats: Record<string, number> = {
      total: allRows.length,
      withStock: allRows.filter((r) => r.stockQty > 0).length,
      withSupplier: allRows.filter((r) => r.supplierName).length,
      withNCM: allRows.filter((r) => r.ncm).length,
      uniqueSKUs: new Set(allRows.map((r) => r.sku)).size,
    };
    setProductStats(stats);
    setProductRows(allRows as ProductRow[]);
  };

  // ─── Import ────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    // Validate mappings
    const unmapped = storeMappings.filter((m) => !m.branchId);
    if (unmapped.length > 0) {
      toast({
        title: "Mapeamento incompleto",
        description: "Selecione uma filial para cada loja.",
        variant: "destructive",
      });
      return;
    }

    setStep(3);
    setImporting(true);
    setProgress(0);

    const storeToId = Object.fromEntries(storeMappings.map((m) => [m.storeName, m.branchId]));

    if (type === "customers") {
      // Assign branchIds and filter
      let rows = (customerRows as (CustomerRow & { _storeName?: string; _active?: string | null })[]).map((r) => ({
        ...r,
        branchId: storeToId[r._storeName || ""] || storeMappings[0]?.branchId || "",
      }));

      if (onlyActive) {
        rows = rows.filter((r) => r._active !== "Não");
      }

      const total = rows.length;
      const aggregatedResult: ImportResult = { imported: 0, duplicates: 0, errors: 0, errorDetails: [] };

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        setProgressText(`Processando ${Math.min(i + BATCH_SIZE, total)} / ${total}`);
        setProgress(Math.round(((i + batch.length) / total) * 100));

        try {
          const res = await fetch("/api/data-management/import/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customers: batch }),
          });
          const data = await res.json();
          if (data.imported !== undefined) {
            aggregatedResult.imported += data.imported;
            aggregatedResult.duplicates += data.duplicates;
            aggregatedResult.errors += data.errors;
            if (data.errorDetails) {
              aggregatedResult.errorDetails.push(...data.errorDetails);
            }
          }
        } catch {
          aggregatedResult.errors += batch.length;
        }
      }

      setProgress(100);
      setResult(aggregatedResult);
    } else {
      // Products - deduplicate by SKU (keep first occurrence, assign to each store separately)
      // Since products are company-wide, we create each unique SKU once
      const seenSKUs = new Set<string>();
      const uniqueProducts: ProductRow[] = [];

      const allRows = productRows as (ProductRow & { _storeName?: string })[];
      for (const row of allRows) {
        if (!seenSKUs.has(row.sku)) {
          seenSKUs.add(row.sku);
          uniqueProducts.push({
            ...row,
            branchId: storeToId[row._storeName || ""] || storeMappings[0]?.branchId || "",
            type: categoryMappings.find((m) => {
              // Re-derive category from type
              const originalCat = Object.entries(CATEGORY_TYPE_MAP).find(
                ([, v]) => v === row.type
              )?.[0];
              return originalCat ? m.category === originalCat : false;
            })?.productType || row.type,
          });
        }
      }

      const total = uniqueProducts.length;
      const aggregatedResult: ImportResult = { imported: 0, duplicates: 0, errors: 0, errorDetails: [] };

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = uniqueProducts.slice(i, i + BATCH_SIZE);
        setProgressText(`Processando ${Math.min(i + BATCH_SIZE, total)} / ${total}`);
        setProgress(Math.round(((i + batch.length) / total) * 100));

        try {
          const res = await fetch("/api/data-management/import/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ products: batch }),
          });
          const data = await res.json();
          if (data.imported !== undefined) {
            aggregatedResult.imported += data.imported;
            aggregatedResult.duplicates += data.duplicates;
            aggregatedResult.errors += data.errors;
            if (data.errorDetails) {
              aggregatedResult.errorDetails.push(...data.errorDetails);
            }
          }
        } catch {
          aggregatedResult.errors += batch.length;
        }
      }

      setProgress(100);
      setResult(aggregatedResult);
    }

    setImporting(false);
  }, [type, storeMappings, customerRows, productRows, categoryMappings, onlyActive, toast]);

  const allMapped = storeMappings.every((m) => m.branchId);

  return (
    <>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-muted-foreground/30 p-6 hover:border-primary/40 transition-colors">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <div className="text-center">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="mr-2 h-4 w-4" />
          Selecionar Arquivo
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          multiple={type === "products"}
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Import Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!importing) {
            setDialogOpen(open);
            if (!open) resetState();
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon className="h-5 w-5" />
              {title}
            </DialogTitle>
            <DialogDescription>
              Etapa {step} de 3:{" "}
              {step === 1 ? "Mapeamento" : step === 2 ? "Pré-visualização" : "Importação"}
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: Mapping */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold mb-3">Mapeamento de Lojas</h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Associe cada loja do sistema anterior a uma filial do PDV Ótica.
                </p>
                <div className="space-y-3">
                  {storeMappings.map((mapping, idx) => (
                    <div key={mapping.storeName} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block">{mapping.storeName}</span>
                        <span className="text-xs text-muted-foreground">
                          {mapping.count.toLocaleString("pt-BR")} {type === "customers" ? "clientes" : "produtos"}
                        </span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <Select
                        value={mapping.branchId}
                        onValueChange={(val) => {
                          const updated = [...storeMappings];
                          updated[idx] = { ...updated[idx], branchId: val };
                          setStoreMappings(updated);
                        }}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Selecione a filial" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category mapping for products */}
              {type === "products" && categoryMappings.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3">Mapeamento de Categorias</h4>
                  <div className="space-y-3">
                    {categoryMappings.map((mapping, idx) => (
                      <div key={mapping.category} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">{mapping.category}</span>
                          <span className="text-xs text-muted-foreground">
                            {mapping.count} produto{mapping.count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <Select
                          value={mapping.productType}
                          onValueChange={(val) => {
                            const updated = [...categoryMappings];
                            updated[idx] = { ...updated[idx], productType: val };
                            setCategoryMappings(updated);
                          }}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(PRODUCT_TYPE_LABELS).map(([val, label]) => (
                              <SelectItem key={val} value={val}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Options */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Opções</h4>
                {type === "customers" && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={onlyActive}
                      onChange={(e) => setOnlyActive(e.target.checked)}
                      className="h-4 w-4 rounded"
                    />
                    Importar apenas clientes ativos
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={keepOriginalDate}
                    onChange={(e) => setKeepOriginalDate(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  Manter data de cadastro original
                </label>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 2 && (
            <div className="space-y-4">
              {type === "customers" ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCard label="Total" value={customerStats.total} />
                    <StatCard label="Com telefone" value={customerStats.celular} pct={customerStats.total} />
                    <StatCard label="Com CPF/CNPJ" value={customerStats.Documento} pct={customerStats.total} />
                    <StatCard label="Com endereço" value={customerStats["Endereço"]} pct={customerStats.total} />
                    <StatCard label="Com cidade" value={customerStats.Cidade} pct={customerStats.total} />
                    <StatCard label="Com nascimento" value={customerStats["Data de Nascimento"]} pct={customerStats.total} />
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-2">Amostra (primeiros 5)</h4>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Nome</th>
                            <th className="px-3 py-2 text-left font-medium">Telefone</th>
                            <th className="px-3 py-2 text-left font-medium">CPF</th>
                            <th className="px-3 py-2 text-left font-medium">Cidade</th>
                            <th className="px-3 py-2 text-left font-medium">Loja</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(customerRows as (CustomerRow & { _storeName?: string })[]).slice(0, 5).map((r, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-3 py-2">{r.name}</td>
                              <td className="px-3 py-2">{r.phone || "—"}</td>
                              <td className="px-3 py-2">{r.cpf || "—"}</td>
                              <td className="px-3 py-2">{r.city || "—"}</td>
                              <td className="px-3 py-2">
                                <Badge variant="secondary" className="text-[10px]">
                                  {r._storeName}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCard label="Total" value={productStats.total} />
                    <StatCard label="SKUs únicos" value={productStats.uniqueSKUs} />
                    <StatCard label="Com estoque" value={productStats.withStock} />
                    <StatCard label="Com fornecedor" value={productStats.withSupplier} pct={productStats.total} />
                    <StatCard label="Com NCM" value={productStats.withNCM} pct={productStats.total} />
                  </div>

                  {productStats.uniqueSKUs < productStats.total && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-700">
                        Foram detectados <strong>{productStats.total - productStats.uniqueSKUs}</strong> produtos duplicados
                        entre lojas (mesmo SKU). Cada produto será importado apenas uma vez.
                      </p>
                    </div>
                  )}

                  <div>
                    <h4 className="text-sm font-semibold mb-2">Amostra (primeiros 5)</h4>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Nome</th>
                            <th className="px-3 py-2 text-left font-medium">SKU</th>
                            <th className="px-3 py-2 text-left font-medium">Categoria</th>
                            <th className="px-3 py-2 text-right font-medium">Preço</th>
                            <th className="px-3 py-2 text-right font-medium">Estoque</th>
                          </tr>
                        </thead>
                        <tbody>
                          {productRows.slice(0, 5).map((r, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-3 py-2">{r.name}</td>
                              <td className="px-3 py-2 font-mono">{r.sku}</td>
                              <td className="px-3 py-2">{PRODUCT_TYPE_LABELS[r.type] || r.type}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                R$ {r.salePrice.toFixed(2)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{r.stockQty}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Progress / Result */}
          {step === 3 && (
            <div className="space-y-4">
              {result ? (
                <div className="space-y-4">
                  <div className="text-center py-4">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold">Importação Concluída</h3>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 rounded-lg bg-green-50 border border-green-200">
                      <p className="text-2xl font-bold text-green-700 tabular-nums">
                        {result.imported.toLocaleString("pt-BR")}
                      </p>
                      <p className="text-xs text-green-600">Importados</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-2xl font-bold text-amber-700 tabular-nums">
                        {result.duplicates.toLocaleString("pt-BR")}
                      </p>
                      <p className="text-xs text-amber-600">Duplicados</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-2xl font-bold text-red-700 tabular-nums">
                        {result.errors.toLocaleString("pt-BR")}
                      </p>
                      <p className="text-xs text-red-600">Erros</p>
                    </div>
                  </div>

                  {result.errorDetails.length > 0 && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                      <h4 className="text-xs font-semibold text-red-800 mb-2 flex items-center gap-1">
                        <XCircle className="h-3 w-3" />
                        Detalhes dos erros (primeiros 20):
                      </h4>
                      <ul className="text-xs text-red-700 space-y-1">
                        {result.errorDetails.slice(0, 20).map((e, i) => (
                          <li key={i} className="truncate">• {e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4 py-4">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
                    <p className="text-sm font-medium">{progressText}</p>
                  </div>
                  <Progress value={progress} className="w-full" />
                  <p className="text-xs text-muted-foreground text-center">{progress}%</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {step === 1 && (
              <>
                <Button variant="outline" onClick={() => { setDialogOpen(false); resetState(); }}>
                  Cancelar
                </Button>
                <Button onClick={() => setStep(2)} disabled={!allMapped}>
                  Próximo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            )}
            {step === 2 && (
              <>
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                <Button onClick={handleImport}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Iniciar Importação
                </Button>
              </>
            )}
            {step === 3 && result && (
              <Button onClick={() => { setDialogOpen(false); resetState(); }}>
                Concluir
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatCard({ label, value, pct }: { label: string; value: number; pct?: number }) {
  return (
    <div className="bg-muted/30 rounded-lg px-3 py-2 border">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">
        {(value || 0).toLocaleString("pt-BR")}
        {pct && pct > 0 && (
          <span className="text-xs text-muted-foreground font-normal ml-1">
            ({((value / pct) * 100).toFixed(1)}%)
          </span>
        )}
      </p>
    </div>
  );
}
