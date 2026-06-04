import Image from "next/image";

/**
 * Logo oficial da marca Vis (símbolo de duas lentes/olho em gradiente azul→ciano
 * + wordmark "Vis" em navy). Usa o PNG oficial em /public/vis-logo.png.
 */
interface VisLogoProps {
  /** Altura da logo em px (largura escala mantendo a proporção ~3:1). */
  height?: number;
  /** Prioridade de carregamento (use true no header acima da dobra). */
  priority?: boolean;
  className?: string;
}

// Proporção da arte oficial: 2172 x 724 ≈ 3:1
const RATIO = 2172 / 724;

export function VisLogo({ height = 32, priority = false, className }: VisLogoProps) {
  const width = Math.round(height * RATIO);
  return (
    <Image
      src="/vis-logo.png"
      alt="Vis — A gestão clara da sua ótica"
      width={width}
      height={height}
      priority={priority}
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}
