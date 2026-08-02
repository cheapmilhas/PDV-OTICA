"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * As duas frases do rodapé que mudam conforme o produto da página.
 *
 * O rodapé é compartilhado por TODAS as páginas do site, inclusive a /medical.
 * Assinar "Feito para óticas brasileiras" embaixo de uma landing que vende
 * prontuário eletrônico dizia ao médico que ele estava no lugar errado.
 *
 * Client component minúsculo de propósito: mantém o resto do rodapé
 * server-rendered. Ler `headers()` no servidor tornaria dinâmica cada página do
 * site — custo alto demais para duas frases.
 *
 * Sem risco de hydration mismatch: Client Components também são pré-renderizados
 * no servidor, e `usePathname()` conhece o pathname da rota sendo gerada — o HTML
 * da /medical já sai com o texto de clínica. O mismatch só apareceria sob
 * rewrite/proxy, em que o pathname da geração difere do que o cliente vê; não há
 * rewrites no next.config.ts. Se algum dia houver, a correção é passar o produto
 * explicitamente por prop, não `suppressHydrationWarning` (que só esconderia).
 */

function ehMedical(pathname: string | null): boolean {
  return pathname === "/medical" || pathname?.startsWith("/medical/") === true;
}

export function FooterBrandLine() {
  const medical = ehMedical(usePathname());
  return (
    <p className="text-sm text-muted leading-relaxed mb-1">
      {medical ? "O sistema claro da sua clínica." : "A gestão clara da sua ótica."}
    </p>
  );
}

export function FooterMadeFor() {
  const medical = ehMedical(usePathname());
  return <p>{medical ? "Feito para clínicas brasileiras 🇧🇷" : "Feito para óticas brasileiras 🇧🇷"}</p>;
}

/**
 * O bloco "Outro produto" do rodapé — que também precisa inverter.
 *
 * Fixo em "Vis Medical", ele virava um SELF-LINK dentro da própria /medical:
 * o rodapé oferecia ao visitante a página em que ele já estava, e o Vis para
 * óticas — o outro produto de verdade naquele contexto — não aparecia.
 */
export function FooterOtherProduct() {
  const medical = ehMedical(usePathname());
  // Na /medical aponta para a landing de ÓTICAS (/oticas), não para a home:
  // com a home institucional, "/" não é mais o produto ótico.
  const item = medical
    ? { href: "/oticas", label: "Vis — para óticas" }
    : { href: "/medical", label: "Vis Medical — para clínicas" };

  return (
    <li className="pt-4 mt-4 border-t border-border/60">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-subtle mb-2">
        Outro produto
      </span>
      <Link
        href={item.href}
        className="text-sm font-medium text-muted hover:text-foreground transition-colors"
      >
        {item.label}
      </Link>
    </li>
  );
}
