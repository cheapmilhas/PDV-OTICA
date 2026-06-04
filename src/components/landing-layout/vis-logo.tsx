/**
 * Logo da marca Vis — símbolo (olho/óculos estilizado) em gradiente azul→ciano
 * + wordmark "Vis" em navy. Inline SVG para escalar sem perda e herdar cor.
 */
interface VisLogoProps {
  /** Tamanho do símbolo em px (a wordmark escala junto). */
  size?: number;
  /** Mostrar a wordmark "Vis" ao lado do símbolo. */
  showWordmark?: boolean;
  /** Cor da wordmark (default navy da marca). */
  wordmarkColor?: string;
  className?: string;
}

export function VisLogo({
  size = 32,
  showWordmark = true,
  wordmarkColor = "var(--brand-navy, #0A1F44)",
  className,
}: VisLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="vis-grad" x1="4" y1="8" x2="44" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0E2A47" />
            <stop offset="0.55" stopColor="#2E6BFF" />
            <stop offset="1" stopColor="#22C3E6" />
          </linearGradient>
        </defs>
        {/* fundo arredondado com gradiente da marca */}
        <rect width="48" height="48" rx="12" fill="url(#vis-grad)" />
        {/* símbolo de olho/óculos — duas lentes ligadas */}
        <path
          d="M24 17c-6.6 0-12 4.4-12 7s5.4 7 12 7 12-4.4 12-7-5.4-7-12-7Z"
          fill="#FFFFFF"
          fillOpacity="0.16"
        />
        <circle cx="24" cy="24" r="5.2" fill="#FFFFFF" />
        <circle cx="24" cy="24" r="2.4" fill="#2E6BFF" />
      </svg>
      {showWordmark && (
        <span
          className="font-heading font-extrabold tracking-tight"
          style={{ color: wordmarkColor, fontSize: size * 0.62, lineHeight: 1 }}
        >
          Vis
        </span>
      )}
    </span>
  );
}
