import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { blogPosts } from "@/content/blog";
import { SectionHeading } from "@/components/home/section-heading";

const TITLE = "Blog do Vis | Gestão de Óticas na Prática";
const DESCRIPTION =
  "Dicas de gestão para donos de ótica: vendas, controle de OS de lentes, estoque e finanças. Aprenda a gerir sua ótica melhor com o blog do Vis.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/blog" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/blog",
    type: "website",
  },
};

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatDate(iso: string): string {
  // Constrói a data ao meio-dia UTC para evitar deslize de fuso (D-1).
  return dateFmt.format(new Date(`${iso}T12:00:00`));
}

function CategoryPill({ category }: { category: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
      style={{ background: "var(--brand-tint)", color: "var(--brand-primary)" }}
    >
      {category}
    </span>
  );
}

export default function BlogIndexPage() {
  const [featured, ...rest] = blogPosts;

  return (
    <>
      {/* Hero curto */}
      <section className="pt-32 pb-12">
        <div className="container-custom">
          <SectionHeading
            eyebrow="Blog"
            title="Gestão de ótica, sem enrolação"
            subtitle="Conteúdo prático para quem toca uma ótica de verdade: vendas, OS de lentes, estoque e finanças."
            align="center"
          />
        </div>
      </section>

      <section className="section-padding pt-0">
        <div className="container-custom">
          {/* Post em destaque */}
          {featured && (
            <Link
              href={`/blog/${featured.slug}`}
              className="vis-card group block mb-10"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-8">
                <div className="flex-1">
                  <div className="mb-3 flex items-center gap-3">
                    <CategoryPill category={featured.category} />
                    <span className="text-xs" style={{ color: "var(--lp-subtle)" }}>
                      Em destaque
                    </span>
                  </div>
                  <h2
                    className="font-heading font-bold mb-3"
                    style={{
                      fontSize: "var(--text-h2)",
                      lineHeight: 1.15,
                      color: "var(--lp-foreground)",
                    }}
                  >
                    {featured.title}
                  </h2>
                  <p
                    className="mb-4 line-clamp-3"
                    style={{ color: "var(--lp-muted)", lineHeight: 1.65 }}
                  >
                    {featured.excerpt}
                  </p>
                  <div
                    className="flex items-center gap-3 text-xs"
                    style={{ color: "var(--lp-subtle)" }}
                  >
                    <span>{formatDate(featured.date)}</span>
                    <span aria-hidden>·</span>
                    <span>{featured.readingMinutes} min</span>
                  </div>
                  <span
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold"
                    style={{ color: "var(--brand-primary)" }}
                  >
                    Ler artigo
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                </div>
              </div>
            </Link>
          )}

          {/* Grid dos demais */}
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="vis-card group flex flex-col"
              >
                <div className="mb-3">
                  <CategoryPill category={post.category} />
                </div>
                <h3
                  className="font-heading font-bold text-lg mb-2 line-clamp-2"
                  style={{ color: "var(--lp-foreground)" }}
                >
                  {post.title}
                </h3>
                <p
                  className="flex-1 line-clamp-2"
                  style={{ color: "var(--lp-muted)", lineHeight: 1.6 }}
                >
                  {post.excerpt}
                </p>
                <div
                  className="mt-4 flex items-center gap-2 text-xs"
                  style={{ color: "var(--lp-subtle)" }}
                >
                  <span>{formatDate(post.date)}</span>
                  <span aria-hidden>·</span>
                  <span>{post.readingMinutes} min</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
