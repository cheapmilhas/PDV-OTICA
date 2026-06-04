interface SectionHeadingProps {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  align?: "left" | "center";
  className?: string;
}

export function SectionHeading({ eyebrow, title, subtitle, align = "center", className }: SectionHeadingProps) {
  const isCenter = align === "center";
  return (
    <div className={`${isCenter ? "text-center mx-auto" : ""} mb-12 md:mb-16 ${className ?? ""}`}>
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-[0.15em] mb-3" style={{ color: "var(--brand-primary)" }}>
          {eyebrow}
        </p>
      )}
      <h2 className="font-heading font-extrabold tracking-tight" style={{ fontSize: "var(--text-h1)", lineHeight: 1.1, letterSpacing: "-0.025em", color: "var(--lp-foreground)" }}>
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-4 ${isCenter ? "max-w-xl mx-auto" : "max-w-xl"}`} style={{ color: "var(--lp-muted)", fontSize: "1rem", lineHeight: 1.65 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
