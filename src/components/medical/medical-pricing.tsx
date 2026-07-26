"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";

/**
 * Bloco de preços do Vis Medical.
 *
 * Consome `?product=medical`, que serve SÓ os planos vendáveis (ACTIVE +
 * selfServiceSelectable) — o mesmo filtro que o cadastro aceita. Sem esse
 * casamento, a pessoa escolheria aqui um plano que o cadastro recusa depois.
 *
 * Client component porque o catálogo é dinâmico (o dono edita preço no admin e
 * a mudança precisa aparecer sem redeploy).
 */

interface Plan {
  id: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  trialDays: number;
  maxUsers: number;
  isFeatured: boolean;
  highlightFeatures: string[] | null;
}

export function MedicalPricing() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    fetch("/api/public/plans?product=medical")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("falha"))))
      .then((d) => setPlans(d.plans ?? []))
      .catch(() => setErro(true));
  }, []);

  const money = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (erro) {
    return (
      <p role="alert" className="mt-8 text-center text-sm text-muted-foreground">
        Não foi possível carregar os planos agora.{" "}
        <Link href="/registro-medical" className="font-medium text-teal-700 hover:underline">
          Começar o teste grátis
        </Link>
        .
      </p>
    );
  }

  // Esqueleto com a MESMA altura dos cards reais: sem isso a página "pula"
  // quando o catálogo chega (layout shift).
  if (plans === null) {
    return (
      <div className="mt-10 grid gap-6 sm:grid-cols-2" aria-busy="true">
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Nenhum plano disponível no momento.
      </p>
    );
  }

  return (
    <div className="mt-10 grid gap-6 sm:grid-cols-2">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className={`flex flex-col rounded-xl border bg-card p-6 ${
            plan.isFeatured ? "border-teal-600 ring-1 ring-teal-600" : "border-border"
          }`}
        >
          {plan.isFeatured && (
            <span className="mb-3 self-start rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-800">
              Mais escolhido
            </span>
          )}
          <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
          {plan.description && (
            <p className="mt-1.5 text-sm text-muted-foreground">{plan.description}</p>
          )}

          <p className="mt-5">
            <span className="text-3xl font-bold text-foreground">
              {money(plan.priceMonthly)}
            </span>
            <span className="text-sm text-muted-foreground">/mês</span>
          </p>
          {plan.trialDays > 0 && (
            <p className="mt-1 text-sm font-medium text-teal-700">
              {plan.trialDays} dias grátis
            </p>
          )}

          <ul className="mt-5 space-y-2 text-sm">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
              <span className="text-muted-foreground">
                Até {plan.maxUsers} {plan.maxUsers === 1 ? "usuário" : "usuários"}
              </span>
            </li>
            {/* `highlightFeatures` é Json no banco: um valor malformado (objeto,
                string solta) quebraria o .map e derrubaria a página de preços
                inteira. Só renderiza se for mesmo uma lista de textos. */}
            {(Array.isArray(plan.highlightFeatures) ? plan.highlightFeatures : [])
              .filter((f): f is string => typeof f === "string" && f.trim() !== "")
              .map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
          </ul>

          <Link
            href={`/registro-medical?plano=${plan.id}`}
            className={`mt-6 inline-flex h-11 items-center justify-center rounded-lg px-5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${
              plan.isFeatured
                ? "bg-teal-700 text-white hover:bg-teal-800"
                : "border border-border text-foreground hover:bg-muted"
            }`}
          >
            Começar com {plan.name}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ))}
    </div>
  );
}
