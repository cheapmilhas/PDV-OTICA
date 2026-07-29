import Image from "next/image";

/**
 * Logo oficial da marca Vis (símbolo de duas lentes/olho em gradiente azul→ciano
 * + wordmark "Vis" em navy). Usa o PNG oficial em /public/vis-logo.png.
 *
 * O PNG NÃO tem canal alfa (`hasAlpha: no`) — é um retângulo sólido de fundo
 * #FFFEFE. Sobre o fundo do site (#F5F7FA no claro) essa diferença mínima
 * desenha uma moldura branca visível em volta da marca.
 *
 * Enquanto não houver um PNG com transparência, o mix é pintar EXATAMENTE
 * #FFFEFE atrás da logo: a moldura deixa de existir porque o fundo e a arte
 * passam a ser a mesma cor. A correção de verdade é exportar a logo com fundo
 * transparente e remover o `background` daqui — ver DÍVIDA abaixo.
 *
 * DÍVIDA: gerar /public/vis-logo.png com canal alfa (e um SVG, de preferência —
 * o arquivo atual tem 766 KB para uma marca que aparece a 30 px de altura).
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

/** Cor de fundo embutida no PNG (pixel do canto). Ver comentário acima. */
export const LOGO_BG = "#FFFEFE";

export function VisLogo({ height = 32, priority = false, className }: VisLogoProps) {
  const width = Math.round(height * RATIO);
  return (
    <Image
      src="/vis-logo.png"
      alt="Vis"
      width={width}
      height={height}
      priority={priority}
      className={className}
      style={{ height, width: "auto", background: LOGO_BG }}
    />
  );
}
