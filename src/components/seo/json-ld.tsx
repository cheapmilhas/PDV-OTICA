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

interface BlogPostingInput {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
}

export function buildBlogPostingJsonLd(
  post: BlogPostingInput
): Record<string, unknown> {
  const publisher = {
    "@type": "Organization",
    name: "Vis",
    logo: {
      "@type": "ImageObject",
      url: `${SITE_URL}/logo.png`,
    },
  };

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    image: `${SITE_URL}/opengraph-image`,
    datePublished: post.date,
    dateModified: post.date,
    author: {
      "@type": "Organization",
      name: "Vis",
      url: SITE_URL,
    },
    publisher,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/blog/${post.slug}`,
    },
  };
}

interface ProductOfferInput {
  name: string;
  price: number;
}

export function buildProductJsonLd(
  offers: ProductOfferInput[]
): Record<string, unknown> {
  const prices = offers.map((o) => o.price);
  const lowPrice = Math.min(...prices);
  const highPrice = Math.max(...prices);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Vis — Sistema de Gestão para Óticas",
    description:
      "Sistema de gestão para óticas com PDV, ordem de serviço de lentes, controle de estoque, financeiro e CRM. Planos para óticas de todos os tamanhos.",
    brand: {
      "@type": "Brand",
      name: "Vis",
    },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "BRL",
      lowPrice: lowPrice.toFixed(2),
      highPrice: highPrice.toFixed(2),
      offerCount: offers.length,
      url: `${SITE_URL}/precos`,
      offers: offers.map((o) => ({
        "@type": "Offer",
        name: o.name,
        price: o.price.toFixed(2),
        priceCurrency: "BRL",
        url: `${SITE_URL}/precos`,
        availability: "https://schema.org/InStock",
      })),
    },
  };
}
