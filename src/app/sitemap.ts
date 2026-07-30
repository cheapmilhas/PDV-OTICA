import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import { featureSlugs } from "@/content/features";
import { blogSlugs } from "@/content/blog";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_URL;
  const now = new Date();

  const featurePages: MetadataRoute.Sitemap = featureSlugs.map((slug) => ({
    url: `${baseUrl}/funcionalidades/${slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const blogPages: MetadataRoute.Sitemap = blogSlugs.map((slug) => ({
    url: `${baseUrl}/blog/${slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    // As duas landings de produto. A /oticas nasceu de um desmembramento: a home
    // virou institucional e as 13 seções óticas mudaram para lá, então ela herda
    // a prioridade alta que aquele conteúdo tinha.
    {
      url: `${baseUrl}/oticas`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/funcionalidades`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...featurePages,
    {
      url: `${baseUrl}/vis-vs-planilha`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/precos`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/registro`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/contato`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    // Vis Medical. Estava fora do sitemap e sem canonical próprio: o Google não
    // conhecia a página e ela ainda apontava para a home, então o funil de clínicas
    // era invisível na busca. Mesma prioridade da /oticas — com a home institucional,
    // os dois produtos têm peso igual (decisão do dono, 2026-07-29).
    //
    // `/registro-medical` NÃO entra aqui: o layout dela não define canonical, então
    // herda `/` do RootLayout. Listá-la pediria indexação enquanto o canonical aponta
    // para a home — sinais contraditórios. (O `/registro` ótico acima tem o mesmo
    // defeito; é dívida pré-existente, anotada na spec, não corrigida junto para não
    // misturar escopo.)
    {
      url: `${baseUrl}/medical`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    ...blogPages,
    {
      url: `${baseUrl}/termos`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacidade`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
