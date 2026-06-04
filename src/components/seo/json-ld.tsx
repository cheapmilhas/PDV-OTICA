import { SITE_URL } from "@/lib/constants";

/**
 * Renderiza um bloco JSON-LD (structured data) de forma segura.
 * Use um por schema (Organization, SoftwareApplication, FAQPage, BreadcrumbList).
 */
interface JsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export const organizationJsonLd: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Vis",
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  description:
    "Sistema de gestão para óticas: vendas, ordens de serviço de lentes, estoque, financeiro e CRM.",
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    areaServed: "BR",
    availableLanguage: "Portuguese",
  },
};

export const softwareApplicationJsonLd: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Vis",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Sistema de Gestão para Óticas",
  operatingSystem: "Web",
  url: SITE_URL,
  description:
    "Sistema de gestão para óticas com PDV, controle de estoque, ordem de serviço de lentes, financeiro e CRM.",
  offers: {
    "@type": "Offer",
    price: "149.90",
    priceCurrency: "BRL",
    url: `${SITE_URL}/precos`,
    availability: "https://schema.org/InStock",
  },
};

interface FaqItem {
  question: string;
  answer: string;
}

export function buildFaqJsonLd(items: FaqItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

interface BreadcrumbItem {
  name: string;
  url: string;
}

export function buildBreadcrumbJsonLd(
  items: BreadcrumbItem[]
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
