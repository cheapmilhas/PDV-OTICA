"use client";

import { useState } from "react";
import { Eye, Stethoscope } from "lucide-react";
import { PricingSection } from "@/components/home/pricing-section";
import { MedicalPricing } from "@/components/medical/medical-pricing";

/**
 * Seletor de produto da /precos.
 *
 * A página vende ÓTICA e continua abrindo nela — o padrão nunca muda, e o
 * parâmetro de URL só é lido para permitir link direto (/precos?produto=clinica),
 * nunca persistido: guardar a escolha em localStorage faria a página abrir no
 * produto errado numa visita seguinte ou em outra aba.
 *
 * Os preços dos dois produtos NÃO aparecem lado a lado de propósito. O plano de
 * clínica é mais barato que o de ótica (R$ 89,90 contra R$ 149,90) e são coisas
 * incomparáveis — exibi-los juntos convida à pergunta "por que o meu é mais
 * caro?". Um de cada vez, o visitante compara dentro do próprio produto.
 *
 * O bloco de cada produto é o MESMO componente usado na sua página de origem
 * (PricingSection na home, MedicalPricing na /medical): sem duplicar regra de
 * preço, que é onde erro de catálogo costuma nascer.
 */

type Produto = "otica" | "clinica";

export function PricingProdutoSwitch({ inicial = "otica" }: { inicial?: Produto }) {
  const [produto, setProduto] = useState<Produto>(inicial);

  const opcoes = [
    { id: "otica" as const, label: "Para óticas", Icon: Eye },
    { id: "clinica" as const, label: "Para clínicas", Icon: Stethoscope },
  ];

  return (
    <>
      <div className="container-custom">
        {/* Uma linha curta antes das abas: coladas no topo e sem rótulo, elas
            passavam despercebidas — o visitante não via que havia escolha.
            Não repete "Preços" porque cada bloco abaixo já traz o próprio
            título; aqui a função é só orientar a escolha. */}
        <p
          className="pt-6 text-center text-xs font-bold uppercase sm:pt-10"
          style={{ color: "var(--brand-primary)", letterSpacing: "0.15em" }}
        >
          Você é de qual segmento?
        </p>

        {/* h1 da /precos. A página ia ao ar SEM nenhum h1: os dois blocos de
            preço trazem só títulos de seção, e as abas são controles. Um h1
            aqui nomeia a página inteira, acima da escolha de produto. */}
        <h1
          className="font-heading mt-3 text-center font-extrabold tracking-tight"
          style={{
            fontSize: "var(--text-h2)",
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            color: "var(--lp-foreground)",
          }}
        >
          Planos e preços
        </h1>

        <div
          className="mx-auto mt-5 flex w-fit gap-1 rounded-xl p-1"
          role="tablist"
          aria-label="Escolha o produto"
          style={{ background: "var(--lp-background)", border: "1px solid var(--lp-border)" }}
        >
          {opcoes.map(({ id, label, Icon }) => {
            const ativo = produto === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={ativo}
                aria-controls={`planos-${id}`}
                onClick={() => setProduto(id)}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                style={
                  ativo
                    ? {
                        background: "var(--lp-surface)",
                        color: "var(--lp-foreground)",
                        border: "1px solid var(--lp-border-hover)",
                        boxShadow: "0 1px 2px rgba(10,31,68,0.06)",
                      }
                    : {
                        background: "transparent",
                        color: "var(--lp-muted)",
                        border: "1px solid transparent",
                      }
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {produto === "otica" ? (
        <div id="planos-otica" role="tabpanel">
          <PricingSection />
        </div>
      ) : (
        <div id="planos-clinica" role="tabpanel" className="container-custom">
          {/* Mesmo respiro do lado ótico (PricingSection traz section-padding),
              para a página não "encolher" ao trocar de aba. */}
          <div className="mx-auto max-w-4xl py-16 sm:py-20">
            <p
              className="text-center text-sm"
              style={{ color: "var(--lp-muted)" }}
            >
              Planos do Vis Medical, para clínicas e consultórios. Comece grátis
              por 14 dias.
            </p>
            <MedicalPricing />
          </div>
        </div>
      )}
    </>
  );
}
