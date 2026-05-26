"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CreditCard, QrCode, FileText, Check } from "lucide-react";
import toast from "react-hot-toast";
import { track } from "@/lib/analytics";

interface Plan {
  id: string;
  name: string;
  slug: string;
  priceMonthly: number;
  priceYearly: number;
  isFeatured: boolean;
  trialDays: number;
  description?: string | null;
  maxUsers: number;
  maxBranches: number;
  maxProducts: number;
}

type BillingType = "PIX" | "BOLETO" | "CREDIT_CARD";

function UpgradePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [cycle, setCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [billingType, setBillingType] = useState<BillingType>("PIX");
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [holder, setHolder] = useState({
    name: "",
    email: session?.user?.email ?? "",
    cpfCnpj: "",
    postalCode: "",
    addressNumber: "",
    phone: "",
  });
  const [card, setCard] = useState({
    holderName: "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    ccv: "",
  });

  useEffect(() => {
    fetch("/api/public/plans")
      .then((res) => res.json())
      .then((data) => {
        const list: Plan[] = data.data ?? data.plans ?? [];
        setPlans(list);
        const featured = list.find((p) => p.isFeatured) ?? list[0];
        if (featured) setSelectedPlanId(featured.id);
      })
      .catch(() => toast.error("Erro ao carregar planos"))
      .finally(() => setLoading(false));

    track("checkout_view");
  }, []);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const price = selectedPlan
    ? cycle === "YEARLY"
      ? selectedPlan.priceYearly / 100
      : selectedPlan.priceMonthly / 100
    : 0;

  async function handleSubmit() {
    if (!selectedPlanId) {
      toast.error("Escolha um plano");
      return;
    }

    track("upgrade_clicked", { planId: selectedPlanId, cycle, billingType });

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        planId: selectedPlanId,
        billingCycle: cycle,
        billingType,
        holderInfo: holder,
      };
      if (billingType === "CREDIT_CARD") {
        payload.creditCard = card;
      }

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error?.message ?? "Erro ao processar pagamento");
        return;
      }

      toast.success("Assinatura criada com sucesso!");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err) {
      console.error(err);
      toast.error("Erro de conexão");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Escolha seu plano</h1>
        <p className="text-gray-600 mt-2">
          Cancele quando quiser. Sem fidelidade.
        </p>
      </div>

      {/* Toggle ciclo */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setCycle("MONTHLY")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              cycle === "MONTHLY" ? "bg-white shadow text-gray-900" : "text-gray-600"
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setCycle("YEARLY")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              cycle === "YEARLY" ? "bg-white shadow text-gray-900" : "text-gray-600"
            }`}
          >
            Anual{" "}
            <Badge variant="secondary" className="ml-1 bg-green-100 text-green-700">
              -17%
            </Badge>
          </button>
        </div>
      </div>

      {/* Grid de planos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {plans.map((plan) => {
          const planPrice = cycle === "YEARLY" ? plan.priceYearly / 100 : plan.priceMonthly / 100;
          const isSelected = selectedPlanId === plan.id;
          return (
            <Card
              key={plan.id}
              className={`cursor-pointer transition-all ${
                isSelected
                  ? "border-indigo-600 ring-2 ring-indigo-200 shadow-lg"
                  : "border-gray-200 hover:border-gray-300"
              } ${plan.isFeatured ? "relative" : ""}`}
              onClick={() => setSelectedPlanId(plan.id)}
            >
              {plan.isFeatured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-indigo-600 hover:bg-indigo-600">Mais popular</Badge>
                </div>
              )}
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                {plan.description && <CardDescription>{plan.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <span className="text-3xl font-bold">
                    R$ {planPrice.toFixed(2).replace(".", ",")}
                  </span>
                  <span className="text-gray-500 text-sm">
                    /{cycle === "YEARLY" ? "ano" : "mês"}
                  </span>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    {plan.maxUsers} usuários
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    {plan.maxBranches} filial(is)
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    {plan.maxProducts.toLocaleString("pt-BR")} produtos
                  </li>
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Formulário de cobrança */}
      {selectedPlan && (
        <Card>
          <CardHeader>
            <CardTitle>Dados de cobrança</CardTitle>
            <CardDescription>
              Total: <strong>R$ {price.toFixed(2).replace(".", ",")}</strong> /{" "}
              {cycle === "YEARLY" ? "ano" : "mês"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={billingType} onValueChange={(v) => setBillingType(v as BillingType)}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="PIX">
                  <QrCode className="w-4 h-4 mr-2" /> PIX
                </TabsTrigger>
                <TabsTrigger value="CREDIT_CARD">
                  <CreditCard className="w-4 h-4 mr-2" /> Cartão
                </TabsTrigger>
                <TabsTrigger value="BOLETO">
                  <FileText className="w-4 h-4 mr-2" /> Boleto
                </TabsTrigger>
              </TabsList>

              <TabsContent value="CREDIT_CARD" className="space-y-3 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nome no cartão</Label>
                    <Input
                      value={card.holderName}
                      onChange={(e) => setCard({ ...card, holderName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Número do cartão</Label>
                    <Input
                      value={card.number}
                      maxLength={19}
                      onChange={(e) =>
                        setCard({ ...card, number: e.target.value.replace(/\D/g, "") })
                      }
                    />
                  </div>
                  <div>
                    <Label>Mês (MM)</Label>
                    <Input
                      value={card.expiryMonth}
                      maxLength={2}
                      onChange={(e) =>
                        setCard({ ...card, expiryMonth: e.target.value.replace(/\D/g, "") })
                      }
                    />
                  </div>
                  <div>
                    <Label>Ano (AAAA)</Label>
                    <Input
                      value={card.expiryYear}
                      maxLength={4}
                      onChange={(e) =>
                        setCard({ ...card, expiryYear: e.target.value.replace(/\D/g, "") })
                      }
                    />
                  </div>
                  <div>
                    <Label>CCV</Label>
                    <Input
                      value={card.ccv}
                      maxLength={4}
                      onChange={(e) => setCard({ ...card, ccv: e.target.value.replace(/\D/g, "") })}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t">
              <div>
                <Label>Nome completo / Razão social</Label>
                <Input
                  value={holder.name}
                  onChange={(e) => setHolder({ ...holder, name: e.target.value })}
                />
              </div>
              <div>
                <Label>CPF / CNPJ</Label>
                <Input
                  value={holder.cpfCnpj}
                  onChange={(e) =>
                    setHolder({ ...holder, cpfCnpj: e.target.value.replace(/\D/g, "") })
                  }
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={holder.email}
                  onChange={(e) => setHolder({ ...holder, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={holder.phone}
                  onChange={(e) =>
                    setHolder({ ...holder, phone: e.target.value.replace(/\D/g, "") })
                  }
                />
              </div>
              <div>
                <Label>CEP</Label>
                <Input
                  value={holder.postalCode}
                  maxLength={9}
                  onChange={(e) =>
                    setHolder({ ...holder, postalCode: e.target.value.replace(/\D/g, "") })
                  }
                />
              </div>
              <div>
                <Label>Número do endereço</Label>
                <Input
                  value={holder.addressNumber}
                  onChange={(e) => setHolder({ ...holder, addressNumber: e.target.value })}
                />
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
              size="lg"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Confirmar assinatura
            </Button>

            <p className="text-xs text-gray-500 text-center">
              Ao confirmar, você concorda com nossos{" "}
              <a href="/termos" className="underline" target="_blank" rel="noopener noreferrer">
                Termos de Uso
              </a>{" "}
              e{" "}
              <a href="/privacidade" className="underline" target="_blank" rel="noopener noreferrer">
                Política de Privacidade
              </a>
              .
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Page() {
  // Qualquer usuário autenticado pode acessar upgrade
  return (
    <ProtectedRoute permission={[]}>
      <UpgradePage />
    </ProtectedRoute>
  );
}
