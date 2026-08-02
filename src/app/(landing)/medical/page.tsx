import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  FileHeart,
  Lock,
  ShieldCheck,
  Stethoscope,
  Wallet,
  Cloud,
  FileCheck,
} from "lucide-react";

import { MedicalPricing } from "@/components/medical/medical-pricing";
import { JsonLd, buildMedicalSoftwareApplicationJsonLd } from "@/components/seo/json-ld";
import { SITE_URL, OG_IMAGE } from "@/lib/constants";

/**
 * Landing do VIS MEDICAL.
 *
 * NÃO reaproveita as seções da landing ótica: elas vendem para ótica (integração
 * com laboratório, calculadora de ROI de lentes, livro de receitas da Vigilância).
 * Para médico, isso é ruído — e pior, sinaliza "sistema de outra coisa adaptado".
 *
 * Server component: o conteúdo é estático e precisa estar no HTML para SEO. Só o
 * bloco de preços é client (busca o catálogo real da API).
 */

export const metadata: Metadata = {
  title: "Vis Medical — sistema para clínicas e consultórios",
  description:
    "Prontuário eletrônico, agenda, receituário e financeiro num sistema só. Teste 14 dias grátis, sem cartão de crédito.",
  // Canonical PRÓPRIO. O RootLayout define `canonical: "/"` como padrão e todas as
  // páginas óticas o sobrescrevem; esta era a única que não sobrescrevia, então
  // apontava para a home de ótica e pedia ao Google para não a indexar — o funil de
  // clínicas ficava invisível na busca. Aponta para vis.app.br/medical (aquisição),
  // não para medical.vis.app.br (aplicação).
  alternates: { canonical: "/medical" },
  // OG/Twitter próprios: sem isto, compartilhar esta página no WhatsApp ou LinkedIn
  // exibia "Vis — Sistema de Gestão para Óticas", herdado do RootLayout.
  openGraph: {
    title: "Vis Medical — sistema para clínicas e consultórios",
    description:
      "Prontuário eletrônico, agenda, receituário e financeiro num sistema só. Teste 14 dias grátis, sem cartão de crédito.",
    url: `${SITE_URL}/medical`,
    siteName: "Vis Medical",
    type: "website",
    images: [OG_IMAGE],
    locale: "pt_BR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vis Medical — sistema para clínicas e consultórios",
    description:
      "Prontuário eletrônico, agenda, receituário e financeiro. Teste 14 dias grátis.",
  },
};

const RECURSOS = [
  {
    icon: FileHeart,
    title: "Prontuário eletrônico",
    description:
      "Histórico completo do paciente, com anexos e evolução por consulta. Assinado por quem atendeu.",
  },
  {
    icon: CalendarCheck,
    title: "Agenda e fila de espera",
    description:
      "Agendamento por profissional, confirmação e encaixe. A recepção para de trabalhar no papel.",
  },
  {
    icon: ClipboardList,
    title: "Receitas, atestados e laudos",
    description:
      "Documentos gerados a partir do atendimento, com os dados do paciente já preenchidos.",
  },
  {
    icon: Wallet,
    title: "Financeiro da clínica",
    description:
      "Caixa, repasse de profissionais e relatórios — sem planilha paralela.",
  },
];

const CONFIANCA = [
  {
    icon: Lock,
    title: "Acesso só com autorização",
    description:
      "Nem nosso suporte entra no prontuário sem você gerar um código. Todo acesso fica registrado numa trilha que você lê.",
  },
  {
    icon: FileCheck,
    title: "LGPD desde o desenho",
    description:
      "Dado de paciente é dado sensível. Controle de quem vê o quê, e registro de quem acessou.",
  },
  {
    icon: Cloud,
    title: "Backup diário automático",
    description: "Seus dados copiados todo dia, sem você precisar lembrar.",
  },
];

export default function MedicalLandingPage() {
  return (
    <>
      {/* SoftwareApplication PRÓPRIO. O RootLayout injeta o schema ÓTICO em toda
          página; sem este, a /medical declarava ao Google ser "Sistema de Gestão
          para Óticas" com oferta apontando para /precos. */}
      <JsonLd data={buildMedicalSoftwareApplicationJsonLd()} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28" style={{ background: "var(--lp-background)" }}>
        <div className="mx-auto max-w-4xl px-4 text-center">
          <p
            className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide"
            style={{
              borderColor: "var(--lp-border)",
              background: "var(--brand-tint)",
              color: "var(--brand-primary)",
            }}
          >
            <Stethoscope className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Vis Medical
          </p>
          <h1
            className="font-heading mt-6 font-extrabold"
            style={{
              fontSize: "var(--text-h1)",
              lineHeight: 1.08,
              letterSpacing: "-0.025em",
              color: "var(--lp-foreground)",
            }}
          >
            O sistema da sua clínica,
            <br />
            <span style={{ color: "var(--lp-muted)", fontWeight: 400, fontStyle: "italic" }}>
              sem a papelada da sua clínica.
            </span>
          </h1>
          <p
            className="mx-auto mt-6 max-w-xl text-base"
            style={{ color: "var(--lp-muted)", lineHeight: 1.65 }}
          >
            Prontuário eletrônico, agenda, receituário e financeiro no mesmo
            lugar. Feito para consultório individual e para clínica com vários
            profissionais.
          </p>
          {/* Assume o nicho sem fechar a porta: a origem da casa é a saúde
              ocular (é a prova social que existe de verdade), mas prontuário,
              agenda e documentos não têm especialidade. Sem esta frase, o
              oftalmologista não vê por que confiar, e o pediatra não vê que
              cabe. */}
          <p
            className="mx-auto mt-4 max-w-xl text-sm"
            style={{ color: "var(--lp-subtle)", lineHeight: 1.6 }}
          >
            Nascemos ao lado de quem cuida dos olhos. O prontuário, a agenda e
            os documentos servem qualquer especialidade.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/registro-medical"
              className="group inline-flex items-center justify-center gap-2 rounded-xl px-7 text-sm font-bold text-white"
              style={{
                minHeight: "52px",
                background: "var(--gradient-brand-vivid)",
                boxShadow: "0 6px 24px var(--brand-glow)",
              }}
            >
              Testar 14 dias grátis
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
            <Link
              href="#precos"
              className="inline-flex items-center justify-center rounded-xl px-7 text-sm font-semibold transition-colors"
              style={{
                minHeight: "52px",
                background: "var(--lp-surface)",
                border: "1px solid var(--lp-border-hover)",
                color: "var(--lp-foreground)",
              }}
            >
              Ver planos
            </Link>
          </div>
          <p className="mt-6 text-xs" style={{ color: "var(--lp-subtle)" }}>
            Sem cartão de crédito. Sem fidelidade.
          </p>
        </div>
      </section>

      {/* ── Recursos ─────────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-24" style={{ background: "var(--lp-surface)" }}>
        <div className="mx-auto max-w-5xl px-4">
          <h2
            className="font-heading text-center font-extrabold"
            style={{
              fontSize: "var(--text-h2)",
              letterSpacing: "-0.02em",
              color: "var(--lp-foreground)",
            }}
          >
            O que você deixa de fazer à mão
          </h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {RECURSOS.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="rounded-2xl p-7"
                style={{
                  background: "var(--lp-background)",
                  border: "1px solid var(--lp-border)",
                }}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: "var(--brand-tint)" }}
                >
                  <Icon
                    className="h-5 w-5"
                    style={{ color: "var(--brand-primary)" }}
                    aria-hidden="true"
                  />
                </div>
                <h3
                  className="mt-5 font-semibold"
                  style={{ color: "var(--lp-foreground)" }}
                >
                  {title}
                </h3>
                <p
                  className="mt-2 text-sm"
                  style={{ color: "var(--lp-muted)", lineHeight: 1.6 }}
                >
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Confiança ────────────────────────────────────────────────────
          Ocupa o lugar da prova social: não temos depoimentos REAIS de clínicas
          ainda, e inventar seria mentir para quem guarda dado de paciente. */}
      <section className="py-20 sm:py-24" style={{ background: "var(--lp-background)" }}>
        <div className="mx-auto max-w-5xl px-4">
          <h2
            className="font-heading text-center font-extrabold"
            style={{
              fontSize: "var(--text-h2)",
              letterSpacing: "-0.02em",
              color: "var(--lp-foreground)",
            }}
          >
            Dado de paciente é sério, e a gente trata assim
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {CONFIANCA.map(({ icon: Icon, title, description }) => (
              <div key={title} className="text-center">
                <div
                  className="mx-auto flex h-11 w-11 items-center justify-center rounded-full"
                  style={{ background: "var(--brand-tint)" }}
                >
                  <Icon
                    className="h-5 w-5"
                    style={{ color: "var(--brand-primary)" }}
                    aria-hidden="true"
                  />
                </div>
                <h3
                  className="mt-5 font-semibold"
                  style={{ color: "var(--lp-foreground)" }}
                >
                  {title}
                </h3>
                <p
                  className="mt-2 text-sm"
                  style={{ color: "var(--lp-muted)", lineHeight: 1.6 }}
                >
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Preços (client: busca o catálogo real) ───────────────────────── */}
      <section
        id="precos"
        className="scroll-mt-24 py-20 sm:py-24"
        style={{ background: "var(--lp-surface)" }}
      >
        <div className="mx-auto max-w-4xl px-4">
          <h2
            className="font-heading text-center font-extrabold"
            style={{
              fontSize: "var(--text-h2)",
              letterSpacing: "-0.02em",
              color: "var(--lp-foreground)",
            }}
          >
            Planos
          </h2>
          <p className="mt-3 text-center text-sm" style={{ color: "var(--lp-muted)" }}>
            Comece grátis por 14 dias. Cancele quando quiser.
          </p>
          <MedicalPricing />
        </div>
      </section>

      {/* ── CTA final ────────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-24" style={{ background: "var(--lp-background)" }}>
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2
            className="font-heading font-extrabold"
            style={{
              fontSize: "var(--text-h2)",
              letterSpacing: "-0.02em",
              color: "var(--lp-foreground)",
            }}
          >
            Comece hoje, sem compromisso
          </h2>
          <p
            className="mx-auto mt-4 max-w-md text-sm"
            style={{ color: "var(--lp-muted)", lineHeight: 1.65 }}
          >
            Você cria a conta, recebe o convite por e-mail e já entra na sua
            clínica. Leva alguns minutos.
          </p>
          <Link
            href="/registro-medical"
            className="group mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-7 text-sm font-bold text-white"
            style={{
              minHeight: "52px",
              background: "var(--gradient-brand-vivid)",
              boxShadow: "0 6px 24px var(--brand-glow)",
            }}
          >
            Criar minha clínica
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
          <p
            className="mt-7 flex items-center justify-center gap-1.5 text-xs"
            style={{ color: "var(--lp-subtle)" }}
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Dados tratados conforme a LGPD.
          </p>
        </div>
      </section>
    </>
  );
}
