"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Check,
  ShieldCheck,
  Mail,
  Stethoscope,
} from "lucide-react";
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
import { track } from "@/lib/analytics";

/**
 * Funil público de trial do VIS MEDICAL.
 *
 * Página PRÓPRIA (não parametriza `/registro`): o funil ótico é o que vende
 * hoje, tem 3 consumidores e acabou de sair de um P0 de isolamento de produto —
 * parametrizá-lo para caber o medical aumentaria o raio de regressão sem ganho.
 *
 * Diferenças reais em relação ao fluxo ótico (as demais são iguais de propósito):
 *  - NÃO coleta senha: no medical a senha nasce no aceite do convite, e pedir
 *    senha aqui criaria uma credencial órfã que o fluxo de convite ignoraria;
 *  - termina em "enviamos um convite", não em login automático;
 *  - erro fica ANCORADO no campo (role="alert"), não em toast: um toast some e
 *    quem usa leitor de tela pode nem receber — a diretriz de acessibilidade é
 *    explícita quanto a isso.
 */

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  maxUsers: number;
  trialDays: number;
  status: string;
  isFeatured: boolean;
  features: { key: string; value: string }[];
}

const STEPS = [
  { title: "Seus dados", description: "Quem vai administrar a clínica" },
  { title: "Clínica", description: "Dados do seu consultório ou clínica" },
  { title: "Plano", description: "Escolha como quer começar" },
];

type Errors = Partial<
  Record<"name" | "email" | "companyName" | "document" | "planId" | "form", string>
>;

export default function RegistroMedicalPage() {
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansError, setPlansError] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<{ email: string } | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    companyName: "",
    document: "",
    planId: "",
  });

  useEffect(() => {
    // `?plano=` vem dos cards de preço da landing: quem clicou em "Começar com
    // Clínica" tem que chegar aqui JÁ nesse plano. Sem honrar o parâmetro, a
    // pessoa escolheria um plano na landing e veria outro selecionado aqui.
    const pedido = new URLSearchParams(window.location.search).get("plano");

    fetch("/api/public/plans?product=medical")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("falha"))))
      .then((d) => {
        const list: Plan[] = d.plans ?? [];
        setPlans(list);
        // Só aceita o plano da URL se ele estiver na lista VENDÁVEL — um id
        // antigo/inválido colado no link não pode virar seleção fantasma.
        const daUrl = pedido ? list.find((p) => p.id === pedido) : undefined;
        // Sem escolha explícita, pré-seleciona o destacado (ou o 1º): sem
        // seleção o cadastro cairia no fallback do servidor e a pessoa não
        // veria o que está contratando.
        const preferido = daUrl ?? list.find((p) => p.isFeatured) ?? list[0];
        if (preferido) setFormData((f) => ({ ...f, planId: preferido.id }));
      })
      .catch(() => setPlansError(true));
  }, []);

  const updateField = (field: string, value: string) => {
    setFormData((f) => ({ ...f, [field]: value }));
    // Limpa o erro do campo assim que a pessoa corrige — manter a mensagem
    // depois de resolvida é ruído que faz o formulário parecer quebrado.
    setErrors((e) => ({ ...e, [field]: undefined, form: undefined }));
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
    const next: Errors = {};
    if (step === 0) {
      if (!formData.name.trim()) next.name = "Informe seu nome.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim()))
        next.email = "Informe um e-mail válido — é nele que chega o convite.";
    }
    if (step === 1) {
      if (!formData.companyName.trim()) {
        next.companyName = "Informe o nome da clínica.";
      }
      // Documento é obrigatório porque sem ele NÃO existe cobrança possível:
      // o gateway exige CPF/CNPJ para criar o pagador. Validar aqui evita o
      // 400 só no fim do wizard, depois de a pessoa preencher tudo.
      const doc = formData.document.replace(/\D/g, "");
      if (!doc) {
        next.document = "Informe o CPF ou o CNPJ.";
      } else if (doc.length !== 11 && doc.length !== 14) {
        next.document = "CPF tem 11 dígitos e CNPJ tem 14.";
      }
    }
    if (step === 2 && !formData.planId) {
      next.planId = "Escolha um plano para continuar.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, 2));
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setIsLoading(true);
    setErrors({});
    try {
      const res = await fetch("/api/public/register-medical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors({ form: data.error ?? "Não foi possível criar a conta. Tente de novo." });
        return;
      }
      track("signup", { plan: formData.planId, product: "medical" });
      track("trial_started", { plan: formData.planId, product: "medical" });
      setDone({ email: formData.email.trim() });
    } catch {
      setErrors({ form: "Falha de conexão. Verifique sua internet e tente de novo." });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedPlan = plans.find((p) => p.id === formData.planId);
  const money = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // ── Estado final: o convite foi enviado ────────────────────────────────────
  // Não redireciona para login: no medical não existe senha ainda. Mandar a
  // pessoa para uma tela de login que ela não consegue usar seria um beco.
  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <Mail className="h-7 w-7 text-success" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Clínica criada. Agora confira seu e-mail.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enviamos um convite para{" "}
              <strong className="text-foreground">{done.email}</strong>. É por ele
              que você define sua senha e entra na sua clínica.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              Não chegou em alguns minutos? Confira o spam ou fale com a gente —
              o convite pode ser reenviado.
            </p>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link href="/">Voltar ao site</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          {/* `flex` (não inline-flex) porque o <p> seguinte precisa cair na
              LINHA DE BAIXO. Com inline-flex os dois disputavam a mesma linha e
              no mobile o subtítulo era espremido ao lado da marca. */}
          <Link href="/" className="flex items-center justify-center">
            {/* vis-logo-alpha.png, não vis-logo.png: o oficial não tem canal
                alfa — é um retângulo sólido #FFFEFE que desenhava uma moldura
                branca sobre o fundo #F5F7FA da página. O `VisLogo` contorna isso
                pintando #FFFEFE atrás da arte, mas só funciona em fundo branco
                (aqui a diferença de 6 níveis ainda aparecia). Este arquivo tem
                transparência de verdade — e 7 KB em vez de 766 KB. */}
            <Image
              src="/vis-logo-alpha.png"
              alt="Vis Medical — página inicial"
              width={120}
              height={40}
              priority
              style={{ height: 40, width: "auto" }}
            />
          </Link>
          {/* secondary-foreground, não muted-foreground: este último dá 4,39:1
              contra o fundo — abaixo de AA para texto normal. */}
          {/* Ícone no azul da marca (o mesmo do símbolo da logo, logo acima) —
              é o detalhe que amarra o cabeçalho. O ciano `--brand-accent` daria
              2,01:1 contra o fundo, abaixo do piso de 3:1 até para ícone. */}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-secondary-foreground">
            <Stethoscope className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            Gestão para clínicas e consultórios
          </p>
          {/* h1 real: antes o papel de título era do CardTitle, que é text-base
              font-semibold — praticamente o tamanho do corpo. Sem um degrau de
              topo a tela inteira ficava num só nível visual. */}
          {/* Sem promessa de gratuidade no título: o trial é por plano
              (`trialDays > 0`) e a API pode servir plano sem trial — quem
              anuncia "grátis" é o card do plano que de fato tem. */}
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Crie a conta da sua clínica
          </h1>
          <p className="mt-2 text-sm text-secondary-foreground">
            Três passos rápidos e você recebe o convite de acesso.
          </p>
        </div>

        {/* Stepper. aria-current marca o passo atual para leitor de tela — sem
            isso a sequência é só decoração visual. */}
        <ol className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-center gap-2">
              <span
                aria-current={i === step ? "step" : undefined}
                // Três estados VISUALMENTE distintos: preenchido (atual),
                // contornado (concluído) e neutro (pendente). Dois tons da
                // mesma cor não bastam — e um tint claro no concluído o
                // deixaria indistinguível do pendente (contraste 1,00:1).
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  i < step
                    ? "border-2 border-primary bg-background text-primary"
                    : i === step
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">concluído</span>
                  </>
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={`hidden text-sm sm:inline ${
                  i === step ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {s.title}
              </span>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`h-px w-8 ${i < step ? "bg-primary" : "bg-muted"}`}
                />
              )}
            </li>
          ))}
        </ol>

        <Card>
          <CardHeader>
            <CardTitle>{STEPS[step].title}</CardTitle>
            <CardDescription>{STEPS[step].description}</CardDescription>
          </CardHeader>
          <CardContent>
            {step === 0 && (
              <div className="space-y-4">
                <Field
                  id="name"
                  label="Nome completo"
                  required
                  error={errors.name}
                  value={formData.name}
                  onChange={(v) => updateField("name", v)}
                  placeholder="Como você quer ser chamado"
                  autoFocus
                />
                <Field
                  id="email"
                  label="E-mail"
                  type="email"
                  required
                  error={errors.email}
                  value={formData.email}
                  onChange={(v) => updateField("email", v)}
                  placeholder="voce@suaclinica.com.br"
                  hint="É para cá que enviamos o convite de acesso."
                />
                <Field
                  id="phone"
                  label="Telefone"
                  value={formData.phone}
                  onChange={(v) => updateField("phone", formatPhone(v))}
                  placeholder="(85) 99999-9999"
                />
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <Field
                  id="companyName"
                  label="Nome da clínica"
                  required
                  error={errors.companyName}
                  value={formData.companyName}
                  onChange={(v) => updateField("companyName", v)}
                  placeholder="Clínica Vida, Consultório Dr. Silva…"
                  autoFocus
                />
                <Field
                  id="document"
                  label="CPF ou CNPJ"
                  value={formData.document}
                  onChange={(v) => updateField("document", formatDocument(v))}
                  placeholder="000.000.000-00"
                  required
                  error={errors.document}
                  hint="Atende tanto consultório individual (CPF) quanto clínica (CNPJ)."
                />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                {plansError && (
                  <p role="alert" className="text-sm text-destructive">
                    Não foi possível carregar os planos. Recarregue a página.
                  </p>
                )}
                {!plansError && plans.length === 0 && (
                  <div className="space-y-2" aria-busy="true">
                    <div className="h-20 animate-pulse rounded-lg bg-muted" />
                    <div className="h-20 animate-pulse rounded-lg bg-muted" />
                  </div>
                )}
                {plans.map((plan) => {
                  const ativo = formData.planId === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => updateField("planId", plan.id)}
                      aria-pressed={ativo}
                      // Hover usa border-primary/50, não sólido: a borda sólida
                      // é a pista de SELEÇÃO — dar a mesma ao card sob o mouse
                      // apagaria a diferença entre "escolhido" e "sob o cursor".
                      // `border-2` sempre (não só no ativo) para a largura da
                      // borda não mudar entre estados — trocar 1px por 2px
                      // deslocaria o conteúdo em 1px a cada seleção.
                      className={`w-full cursor-pointer rounded-lg border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                        ativo
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          {/* Check visível na seleção: no CELULAR não existe
                              hover, então a borda sozinha não diz qual card
                              está escolhido — a pista precisa ser própria do
                              estado, não do cursor. */}
                          <span className="flex items-center gap-1.5 font-medium text-foreground">
                            {ativo && (
                              <Check
                                className="h-4 w-4 shrink-0 text-primary"
                                aria-hidden="true"
                              />
                            )}
                            {plan.name}
                          </span>
                          {plan.description && (
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {plan.description}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="font-semibold text-foreground">
                            {money(plan.priceMonthly)}
                          </span>
                          <span className="block text-xs text-muted-foreground">/mês</span>
                        </div>
                      </div>
                      {plan.trialDays > 0 && (
                        <p className="mt-2 text-xs font-medium text-accent-foreground">
                          {plan.trialDays} dias grátis — sem cartão de crédito
                        </p>
                      )}
                    </button>
                  );
                })}
                {errors.planId && (
                  <p role="alert" className="text-sm text-destructive">
                    {errors.planId}
                  </p>
                )}
              </div>
            )}

            {errors.form && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {errors.form}
              </p>
            )}

            <div className="mt-6 flex gap-3">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((s) => Math.max(s - 1, 0))}
                  disabled={isLoading}
                  className="flex-1"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                  Voltar
                </Button>
              )}
              {step < 2 ? (
                <Button type="button" onClick={handleNext} className="flex-1">
                  Continuar
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  {isLoading ? "Criando sua clínica…" : "Começar teste grátis"}
                </Button>
              )}
            </div>

            {step === 2 && selectedPlan && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Você começa no <strong>{selectedPlan.name}</strong>
                {selectedPlan.trialDays > 0
                  ? ` com ${selectedPlan.trialDays} dias grátis.`
                  : "."}{" "}
                Sem cobrança agora.
              </p>
            )}
          </CardContent>
        </Card>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Dados de pacientes tratados conforme a LGPD.
        </p>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}

/**
 * Campo com rótulo, dica e erro ANCORADO (role="alert" + aria-describedby).
 * O funil ótico mostra erro em toast; aqui o erro fica junto do campo porque
 * toast some sozinho e nem sempre chega a quem usa leitor de tela.
 */
function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  type = "text",
  required = false,
  autoFocus = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && (
          <>
            {" "}
            <span aria-hidden="true">*</span>
            <span className="sr-only">(obrigatório)</span>
          </>
        )}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
