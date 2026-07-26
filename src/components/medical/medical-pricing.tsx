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

/** Primeira frase da descrição — o resumo do plano. */
function resumoDe(plan: Plan): string {
  const d = (plan.description ?? "").trim();
  if (!d) return "";
  const corte = d.indexOf(". ");
  return corte === -1 ? d : d.slice(0, corte + 1);
}

/**
 * Itens do card. Usa `highlightFeatures` quando o dono cadastrou; senão, deriva
 * do RESTO da descrição (a parte depois da 1ª frase), quebrando por vírgula e
 * pelo "+". É melhor mostrar o que o plano entrega do que um card com preço e
 * nada mais — e não inventa nada: o texto é o que já está cadastrado.
 */
function bulletsDe(plan: Plan): string[] {
  const cadastrados = (Array.isArray(plan.highlightFeatures) ? plan.highlightFeatures : [])
    .filter((f): f is string => typeof f === "string" && f.trim() !== "");
  if (cadastrados.length) return cadastrados;

  const d = (plan.description ?? "").trim();
  const corte = d.indexOf(". ");
  const resto = corte === -1 ? "" : d.slice(corte + 1);
  return resto
    .replace(/^\s*Tudo do /i, "Tudo do ")
    .split(/,|\se\s|\+/)
    .map((s) => s.replace(/\.$/, "").trim())
    .filter((s) => s.length > 2)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .slice(0, 6);
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
        {/* Altura MEDIDA do card renderizado em prod (404px). Reservar demais deixa buraco
            quando o conteúdo chega; de menos, a página "pula" (layout shift). */}
        <div className="h-[404px] animate-pulse rounded-xl bg-muted" />
        <div className="h-[404px] animate-pulse rounded-xl bg-muted" />
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

  // Só vale exibir o teto de usuários se ele variar entre os planos.
  const mostrarLimite = new Set(plans.map((p) => p.maxUsers)).size > 1;

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
          {/* A 1ª frase da descrição é o resumo ("Plano para 1 profissional.");
              o resto vira bullets abaixo. Sem esse corte, o mesmo texto
              apareceria duas vezes no card. */}
          {resumoDe(plan) && (
            <p className="mt-1.5 text-sm text-muted-foreground">{resumoDe(plan)}</p>
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
            {/* O limite de usuários só entra quando DIFERENCIA os planos. Hoje
                ambos têm o mesmo teto no banco: repetir "Até 3 usuários" nos
                dois não ajuda a escolher e ainda contradiz a descrição do
                Profissional ("para 1 profissional"). */}
            {mostrarLimite && (
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                <span className="text-muted-foreground">
                  Até {plan.maxUsers} {plan.maxUsers === 1 ? "usuário" : "usuários"}
                </span>
              </li>
            )}
            {/* `highlightFeatures` é Json no banco: um valor malformado (objeto,
                string solta) quebraria o .map e derrubaria a página de preços
                inteira. Só renderiza se for mesmo uma lista de textos.
                Sem destaques cadastrados, os itens saem da própria descrição —
                o card fica com substância em vez de só preço e botão. */}
            {bulletsDe(plan).map((f) => (
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
