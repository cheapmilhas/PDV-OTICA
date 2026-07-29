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
import { SITE_URL } from "@/lib/constants";

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
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-teal-100 px-3 py-1 text-sm font-medium text-teal-800">
            <Stethoscope className="h-4 w-4" aria-hidden="true" />
            Vis Medical
          </p>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            O sistema da sua clínica, sem a papelada da sua clínica
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Prontuário eletrônico, agenda, receituário e financeiro no mesmo
            lugar. Feito para consultório individual e para clínica com vários
            profissionais.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/registro-medical"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-teal-700 px-6 font-medium text-white transition-colors hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
            >
              Testar 14 dias grátis
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="#precos"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-border px-6 font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
            >
              Ver planos
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Sem cartão de crédito. Sem fidelidade.
          </p>
        </div>
      </section>

      {/* ── Recursos ─────────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20 bg-muted/30">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center text-2xl font-bold text-foreground sm:text-3xl">
            O que você deixa de fazer à mão
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {RECURSOS.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="rounded-xl border border-border bg-card p-6"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100">
                  <Icon className="h-5 w-5 text-teal-700" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Confiança ────────────────────────────────────────────────────
          Ocupa o lugar da prova social: não temos depoimentos REAIS de clínicas
          ainda, e inventar seria mentir para quem guarda dado de paciente. */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center text-2xl font-bold text-foreground sm:text-3xl">
            Dado de paciente é sério — e a gente trata assim
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {CONFIANCA.map(({ icon: Icon, title, description }) => (
              <div key={title} className="text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-teal-100">
                  <Icon className="h-5 w-5 text-teal-700" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Preços (client: busca o catálogo real) ───────────────────────── */}
      <section id="precos" className="py-16 sm:py-20 bg-muted/30 scroll-mt-24">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-center text-2xl font-bold text-foreground sm:text-3xl">
            Planos
          </h2>
          <p className="mt-2 text-center text-muted-foreground">
            Comece grátis por 14 dias. Cancele quando quiser.
          </p>
          <MedicalPricing />
        </div>
      </section>

      {/* ── CTA final ────────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
            Comece hoje, sem compromisso
          </h2>
          <p className="mt-3 text-muted-foreground">
            Você cria a conta, recebe o convite por e-mail e já entra na sua
            clínica. Leva alguns minutos.
          </p>
          <Link
            href="/registro-medical"
            className="mt-7 inline-flex h-12 items-center justify-center rounded-lg bg-teal-700 px-6 font-medium text-white transition-colors hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            Criar minha clínica
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Dados tratados conforme a LGPD.
          </p>
        </div>
      </section>
    </>
  );
}
