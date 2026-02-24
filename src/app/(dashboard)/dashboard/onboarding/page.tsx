"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
  Building2,
  Package,
  CreditCard,
  PartyPopper,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STEPS = [
  {
    title: "Dados da Empresa",
    description: "Complete as informações da sua ótica",
    icon: Building2,
  },
  {
    title: "Produtos",
    description: "Configure seus primeiros produtos",
    icon: Package,
  },
  {
    title: "Pagamentos",
    description: "Defina as formas de pagamento aceitas",
    icon: CreditCard,
  },
  {
    title: "Tudo Pronto!",
    description: "Sua ótica está configurada",
    icon: PartyPopper,
  },
];

const PAYMENT_OPTIONS = [
  { id: "dinheiro", label: "Dinheiro" },
  { id: "pix", label: "PIX" },
  { id: "credito", label: "Cartão de Crédito" },
  { id: "debito", label: "Cartão de Débito" },
  { id: "boleto", label: "Boleto Bancário" },
  { id: "transferencia", label: "Transferência Bancária" },
  { id: "cheque", label: "Cheque" },
  { id: "crediario", label: "Crediário Próprio" },
];

const BRAZILIAN_STATES = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
  "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

interface OnboardingData {
  onboardingStep: number;
  name: string;
  tradeName: string | null;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Step 1: Company data
  const [companyData, setCompanyData] = useState({
    tradeName: "",
    cnpj: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
  });

  // Step 2: Products
  const [addSampleProducts, setAddSampleProducts] = useState(true);

  // Step 3: Payment methods
  const [paymentMethods, setPaymentMethods] = useState<string[]>([
    "dinheiro",
    "pix",
    "credito",
    "debito",
  ]);

  useEffect(() => {
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((data) => {
        if (data.onboarding) {
          const ob = data.onboarding as OnboardingData;

          // Se já completou onboarding, redirecionar
          if (ob.onboardingStep >= 4) {
            router.push("/dashboard");
            return;
          }

          // Pre-fill com dados existentes
          setCompanyData({
            tradeName: ob.tradeName || ob.name || "",
            cnpj: ob.cnpj || "",
            phone: ob.phone || "",
            address: ob.address || "",
            city: ob.city || "",
            state: ob.state || "",
            zipCode: ob.zipCode || "",
          });

          // Restaurar step atual
          setStep(ob.onboardingStep || 0);
        }
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [router]);

  const formatCNPJ = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8)
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12)
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const formatCEP = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  };

  const saveStep = async (stepNum: number, data: Record<string, unknown>) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: stepNum, data }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao salvar");
      }

      return true;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Tente novamente",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleNext = async () => {
    const currentStep = step + 1; // API uses 1-indexed steps

    if (currentStep === 1) {
      const ok = await saveStep(1, companyData);
      if (!ok) return;
    } else if (currentStep === 2) {
      const ok = await saveStep(2, { addSampleProducts });
      if (!ok) return;
    } else if (currentStep === 3) {
      const ok = await saveStep(3, { paymentMethods });
      if (!ok) return;
    }

    setStep((s) => s + 1);
  };

  const handleComplete = async () => {
    const ok = await saveStep(4, {});
    if (!ok) return;

    toast({
      title: "Onboarding concluído!",
      description: "Sua ótica está pronta para usar.",
    });

    router.push("/dashboard");
    router.refresh();
  };

  const handleSkip = () => {
    setStep((s) => s + 1);
  };

  const togglePayment = (id: string) => {
    setPaymentMethods((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold">Configure sua Ótica</h1>
        <p className="mt-1 text-muted-foreground">
          Vamos configurar tudo em poucos minutos
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                  i < step
                    ? "bg-green-500 text-white"
                    : i === step
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`hidden h-px w-12 sm:block ${
                    i < step ? "bg-green-500" : "bg-muted"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step].title}</CardTitle>
          <CardDescription>{STEPS[step].description}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Step 0: Company Data */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tradeName">Nome Fantasia</Label>
                  <Input
                    id="tradeName"
                    placeholder="Ótica Exemplo"
                    value={companyData.tradeName}
                    onChange={(e) =>
                      setCompanyData({ ...companyData, tradeName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cnpj">CNPJ</Label>
                  <Input
                    id="cnpj"
                    placeholder="00.000.000/0000-00"
                    value={companyData.cnpj}
                    onChange={(e) =>
                      setCompanyData({ ...companyData, cnpj: formatCNPJ(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  placeholder="(11) 99999-9999"
                  value={companyData.phone}
                  onChange={(e) =>
                    setCompanyData({ ...companyData, phone: formatPhone(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Endereço</Label>
                <Input
                  id="address"
                  placeholder="Rua Exemplo, 123"
                  value={companyData.address}
                  onChange={(e) =>
                    setCompanyData({ ...companyData, address: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    placeholder="São Paulo"
                    value={companyData.city}
                    onChange={(e) =>
                      setCompanyData({ ...companyData, city: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  <select
                    id="state"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={companyData.state}
                    onChange={(e) =>
                      setCompanyData({ ...companyData, state: e.target.value })
                    }
                  >
                    <option value="">UF</option>
                    {BRAZILIAN_STATES.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zipCode">CEP</Label>
                  <Input
                    id="zipCode"
                    placeholder="00000-000"
                    value={companyData.zipCode}
                    onChange={(e) =>
                      setCompanyData({
                        ...companyData,
                        zipCode: formatCEP(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Products */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="sampleProducts"
                    checked={addSampleProducts}
                    onCheckedChange={(checked) => setAddSampleProducts(!!checked)}
                  />
                  <div>
                    <label
                      htmlFor="sampleProducts"
                      className="font-medium leading-none cursor-pointer"
                    >
                      Adicionar produtos de exemplo
                    </label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Cria 5 produtos de exemplo (armações e lentes) para você testar
                      o sistema. Você pode editá-los ou removê-los depois.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">
                  Você poderá cadastrar seus produtos reais a qualquer momento
                  pelo menu <strong>Produtos</strong> no painel.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Payment Methods */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Selecione as formas de pagamento que sua ótica aceita:
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {PAYMENT_OPTIONS.map((option) => (
                  <div
                    key={option.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                      paymentMethods.includes(option.id)
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/50"
                    }`}
                    onClick={() => togglePayment(option.id)}
                  >
                    <Checkbox
                      checked={paymentMethods.includes(option.id)}
                      onCheckedChange={() => togglePayment(option.id)}
                    />
                    <span className="text-sm font-medium">{option.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Complete */}
          {step === 3 && (
            <div className="space-y-6 text-center py-4">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                <PartyPopper className="h-10 w-10 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">
                  Sua ótica está pronta para usar!
                </h3>
                <p className="mt-2 text-muted-foreground">
                  Você já pode começar a cadastrar clientes, criar vendas e
                  ordens de serviço. Explore o painel para descobrir todas as
                  funcionalidades.
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 p-4 text-left">
                <p className="text-sm font-medium text-blue-900">
                  Próximos passos sugeridos:
                </p>
                <ul className="mt-2 space-y-1 text-sm text-blue-800">
                  <li>1. Cadastre seus primeiros clientes</li>
                  <li>2. Adicione seus produtos reais ao estoque</li>
                  <li>3. Configure sua primeira venda</li>
                  <li>4. Convide sua equipe pelo menu Usuários</li>
                </ul>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between">
            {step > 0 && step < 3 ? (
              <Button
                variant="outline"
                onClick={() => setStep((s) => s - 1)}
                disabled={isSaving}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              {step < 3 && (
                <>
                  {step > 0 && (
                    <Button variant="ghost" onClick={handleSkip} disabled={isSaving}>
                      Pular
                    </Button>
                  )}
                  <Button onClick={handleNext} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Próximo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              )}
              {step === 3 && (
                <Button onClick={handleComplete} disabled={isSaving} size="lg">
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Ir para o Painel
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
