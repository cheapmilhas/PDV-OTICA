interface BrowserFrameProps {
  url?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Moldura de browser reutilizável da landing Vis: chrome cinza-claro com 3 dots
 * (vermelho/amarelo/verde), barra de URL central e {children} como conteúdo.
 * Extraída do Hero — visual idêntico (fundo branco, borda --lp-border,
 * sombra suave, rounded-2xl).
 */
export function BrowserFrame({
  url = "vis.app.br/dashboard",
  children,
  className,
}: BrowserFrameProps) {
  return (
    <div
      className={`relative rounded-2xl overflow-hidden ${className ?? ""}`}
      style={{
        border: "1px solid var(--lp-border)",
        background: "var(--lp-surface)",
        boxShadow:
          "0 32px 80px rgba(10,31,68,0.18), 0 8px 24px rgba(10,31,68,0.10)",
      }}
    >
      {/* Browser chrome */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{
          background: "var(--lp-surface-hover)",
          borderColor: "var(--lp-border)",
        }}
      >
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full" style={{ background: "#FF5F57" }} />
          <div className="h-3 w-3 rounded-full" style={{ background: "#FEBC2E" }} />
          <div className="h-3 w-3 rounded-full" style={{ background: "#28C840" }} />
        </div>
        <div className="flex-1 mx-4">
          <div
            className="rounded-md px-3 py-1 text-xs text-center"
            style={{ background: "var(--lp-background)", color: "var(--lp-subtle)" }}
          >
            {url}
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      {children}
    </div>
  );
}
