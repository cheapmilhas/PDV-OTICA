"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Glasses, Loader2, ArrowLeft, ArrowRight, Check, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  maxUsers: number;
  maxProducts: number;
  maxBranches: number;
  trialDays: number;
  isFeatured: boolean;
  features: { key: string; value: string }[];
}

const STEPS = [
  { title: "Seus Dados", description: "Informações pessoais" },
  { title: "Empresa", description: "Dados da empresa" },
  { title: "Plano", description: "Escolha seu plano" },
];

export default function RegistroPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    companyName: "",
    document: "",
    planId: "",
  });

  useEffect(() => {
    fetch("/api/public/plans")
      .then((r) => r.json())
      .then((data) => {
        if (data.plans) {
          setPlans(data.plans);
          const featured = data.plans.find((p: Plan) => p.isFeatured);
          if (featured) {
            setFormData((prev) => ({ ...prev, planId: featured.id }));
          } else if (data.plans.length > 0) {
            setFormData((prev) => ({ ...prev, planId: data.plans[0].id }));
          }
        }
      })
      .catch(() => {});
  }, []);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const formatDocument = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9)
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    if (digits.length <= 11)
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    if (digits.length <= 12)
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  };

  const validateStep = () => {
    if (step === 0) {
      if (!formData.name.trim()) {
        toast({ variant: "destructive", title: "Nome é obrigatório" });
        return false;
      }
      if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        toast({ variant: "destructive", title: "Email inválido" });
        return false;
      }
      if (formData.password.length < 8) {
        toast({
          variant: "destructive",
          title: "Senha deve ter no mínimo 8 caracteres",
        });
        return false;
      }
    }
    if (step === 1) {
      if (!formData.companyName.trim()) {
        toast({ variant: "destructive", title: "Nome da empresa é obrigatório" });
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, 2));
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/public/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Erro ao criar conta",
          description: data.error || "Tente novamente",
        });
        return;
      }

      toast({
        title: "Conta criada com sucesso!",
        description: "Redirecionando para o login...",
      });

      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Erro de conexão. Tente novamente.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedPlan = plans.find((p) => p.id === formData.planId);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
              <Glasses className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">PDV Ótica</span>
          </Link>
        </div>

        {/* Stepper */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  i < step
                    ? "bg-green-500 text-white"
                    : i === step
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={`hidden text-sm sm:inline ${
                  i === step ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {s.title}
              </span>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-px w-8 ${i < step ? "bg-green-500" : "bg-muted"}`}
                />
              )}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{STEPS[step].title}</CardTitle>
            <CardDescription>{STEPS[step].description}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Step 1: Dados pessoais */}
            {step === 0 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome completo *</Label>
                  <Input
                    id="name"
                    placeholder="Seu nome"
                    value={formData.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    placeholder="(11) 99999-9999"
                    value={formData.phone}
                    onChange={(e) => updateField("phone", formatPhone(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha *</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Mínimo 8 caracteres"
                      value={formData.password}
                      onChange={(e) => updateField("password", e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Dados da empresa */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nome da empresa *</Label>
                  <Input
                    id="companyName"
                    placeholder="Ótica Exemplo"
                    value={formData.companyName}
                    onChange={(e) => updateField("companyName", e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="document">CNPJ ou CPF (opcional)</Label>
                  <Input
                    id="document"
                    placeholder="00.000.000/0000-00"
                    value={formData.document}
                    onChange={(e) =>
                      updateField("document", formatDocument(e.target.value))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Você pode informar depois nas configurações
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Plano */}
            {step === 2 && (
              <div className="space-y-4">
                {plans.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Todos os planos incluem{" "}
                      <strong>{selectedPlan?.trialDays || 14} dias grátis</strong>.
                      Nenhum cartão de crédito é necessário.
                    </p>
                    <div className="space-y-3">
                      {plans.map((plan) => (
                        <div
                          key={plan.id}
                          className={`cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                            formData.planId === plan.id
                              ? "border-primary bg-primary/5"
                              : "border-muted hover:border-primary/50"
                          }`}
                          onClick={() => updateField("planId", plan.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold">{plan.name}</h3>
                                {plan.isFeatured && (
                                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                    Popular
                                  </span>
                                )}
                              </div>
                              {plan.description && (
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {plan.description}
                                </p>
                              )}
                              <p className="mt-2 text-xs text-muted-foreground">
                                {plan.maxUsers === -1 ? "Ilimitado" : `${plan.maxUsers}`} usuários
                                {" · "}
                                {plan.maxProducts === -1
                                  ? "Ilimitado"
                                  : `${plan.maxProducts}`}{" "}
                                produtos
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold">
                                R$ {(plan.priceMonthly / 100).toFixed(2).replace(".", ",")}
                              </p>
                              <p className="text-xs text-muted-foreground">/mês</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Navigation buttons */}
            <div className="mt-6 flex items-center justify-between">
              {step > 0 ? (
                <Button variant="outline" onClick={handleBack} disabled={isLoading}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
              ) : (
                <Link href="/login">
                  <Button variant="ghost" size="sm">
                    Já tenho conta
                  </Button>
                </Link>
              )}

              {step < 2 ? (
                <Button onClick={handleNext}>
                  Próximo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar Conta Grátis
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Ao criar sua conta, você concorda com nossos{" "}
          <Link href="#" className="underline hover:text-foreground">
            Termos de Uso
          </Link>{" "}
          e{" "}
          <Link href="#" className="underline hover:text-foreground">
            Política de Privacidade
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
