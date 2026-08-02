interface SectionHeadingProps {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  align?: "left" | "center";
  className?: string;
  /**
   * Nível do heading. Default `h2` — é o papel usual (título de SEÇÃO dentro de
   * uma página que já tem h1). Passe `h1` quando este for o título DA PÁGINA:
   * /precos, /funcionalidades, /blog e /vis-vs-planilha usavam este componente
   * como título principal e por isso iam ao ar sem nenhum h1.
   */
  as?: "h1" | "h2";
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  className,
  as: Heading = "h2",
}: SectionHeadingProps) {
  const isCenter = align === "center";
  return (
    <div className={`${isCenter ? "text-center mx-auto" : ""} mb-12 md:mb-16 ${className ?? ""}`}>
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-[0.15em] mb-3" style={{ color: "var(--brand-primary)" }}>
          {eyebrow}
        </p>
      )}
      <Heading className="font-heading font-extrabold tracking-tight" style={{ fontSize: "var(--text-h1)", lineHeight: 1.1, letterSpacing: "-0.025em", color: "var(--lp-foreground)" }}>
        {title}
      </Heading>
      {subtitle && (
        <p className={`mt-4 ${isCenter ? "max-w-xl mx-auto" : "max-w-xl"}`} style={{ color: "var(--lp-muted)", fontSize: "1rem", lineHeight: 1.65 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
