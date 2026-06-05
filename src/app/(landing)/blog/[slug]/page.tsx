import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { blogSlugs, getPost } from "@/content/blog";
import { REGISTER_URL } from "@/lib/constants";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatDate(iso: string): string {
  // Meio-dia UTC evita deslize de fuso (D-1).
  return dateFmt.format(new Date(`${iso}T12:00:00`));
}

export function generateStaticParams() {
  return blogSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};

  const url = `/blog/${slug}`;

  return {
    title: `${post.title} | Blog do Vis`,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: "article",
      publishedTime: post.date,
      authors: [post.author],
    },
  };
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

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const related = post.related
    .map((s) => getPost(s))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <article className="section-padding pt-32">
      <div className="container-custom">
        {/* Coluna de leitura */}
        <div className="mx-auto max-w-[680px]">
          {/* Cabeçalho */}
          <header className="mb-10">
            <div className="mb-4">
              <CategoryPill category={post.category} />
            </div>
            <h1
              className="font-heading font-extrabold tracking-tight"
              style={{
                fontSize: "var(--text-h1)",
                lineHeight: 1.1,
                letterSpacing: "-0.025em",
                color: "var(--lp-foreground)",
              }}
            >
              {post.title}
            </h1>
            <div
              className="mt-4 flex flex-wrap items-center gap-2 text-sm"
              style={{ color: "var(--lp-subtle)" }}
            >
              <span>{post.author}</span>
              <span aria-hidden>·</span>
              <span>{formatDate(post.date)}</span>
              <span aria-hidden>·</span>
              <span>{post.readingMinutes} min de leitura</span>
            </div>
          </header>

          {/* Corpo */}
          <div className="prose-vis">{post.body}</div>

          {/* CTA */}
          <div
            className="mt-14 rounded-2xl p-8 text-center"
            style={{ background: "var(--gradient-brand-wash)", border: "1px solid var(--lp-border)" }}
          >
            <h2
              className="font-heading font-bold mb-3"
              style={{ fontSize: "var(--text-h2)", color: "var(--lp-foreground)" }}
            >
              Gerencie sua ótica com o Vis
            </h2>
            <p className="mb-6 mx-auto max-w-md" style={{ color: "var(--lp-muted)", lineHeight: 1.6 }}>
              PDV, OS de lentes, estoque e financeiro num só lugar. Comece grátis e veja na prática.
            </p>
            <Link
              href={REGISTER_URL}
              className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold text-white"
              style={{
                background: "var(--gradient-brand-vivid)",
                boxShadow: "0 6px 24px var(--brand-glow)",
                minHeight: "52px",
              }}
            >
              Começar grátis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Artigos relacionados */}
        {related.length > 0 && (
          <div className="mx-auto mt-16 max-w-5xl">
            <h2
              className="font-heading font-bold mb-6 text-center"
              style={{ fontSize: "var(--text-h2)", color: "var(--lp-foreground)" }}
            >
              Artigos relacionados
            </h2>
            <div className="grid gap-5 md:grid-cols-3">
              {related.map((rel) => (
                <Link
                  key={rel.slug}
                  href={`/blog/${rel.slug}`}
                  className="vis-card group flex flex-col"
                >
                  <div className="mb-3">
                    <CategoryPill category={rel.category} />
                  </div>
                  <h3
                    className="font-heading font-bold text-base mb-2 line-clamp-2"
                    style={{ color: "var(--lp-foreground)" }}
                  >
                    {rel.title}
                  </h3>
                  <p
                    className="flex-1 line-clamp-2 text-sm"
                    style={{ color: "var(--lp-muted)", lineHeight: 1.6 }}
                  >
                    {rel.excerpt}
                  </p>
                  <span
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold"
                    style={{ color: "var(--brand-primary)" }}
                  >
                    Ler artigo
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
