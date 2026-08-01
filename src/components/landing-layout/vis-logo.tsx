import Image from "next/image";

/**
 * Logo oficial da marca Vis (símbolo de duas lentes/olho em gradiente azul→ciano
 * + wordmark "Vis" em navy). Usa o PNG oficial em /public/vis-logo.png.
 *
 * Usa /public/vis-logo-alpha.png: a mesma arte COM canal alfa, gerada a partir
 * do PNG oficial (que é RGB puro — um retângulo sólido #FFFEFE que desenhava
 * uma moldura branca sobre o fundo do site). Como agora há transparência de
 * verdade, o `background: #FFFEFE` que existia aqui como paliativo saiu: ele só
 * funcionava sobre fundo branco e falhava em qualquer outra cor.
 *
 * Ganho colateral: 766 KB → 7 KB, para uma marca que aparece a 30-44 px.
 *
 * DÍVIDA que permanece: um SVG seria melhor que qualquer PNG aqui.
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
      src="/vis-logo-alpha.png"
      alt="Vis"
      width={width}
      height={height}
      priority={priority}
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}
