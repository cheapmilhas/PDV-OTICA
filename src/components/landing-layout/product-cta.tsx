"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Eye, Stethoscope } from "lucide-react";
import { LOGIN_URL, MEDICAL_LOGIN_URL, REGISTER_URL } from "@/lib/constants";

/**
 * CTA que conhece o produto da rota.
 *
 * A home virou institucional (dois segmentos), mas os botões do header
 * continuaram de produto único: "Entrar" apontava para /login em TODA página, e
 * o /login do Vis não tem ponte com o Domus — um médico caía num login incapaz
 * de autenticá-lo. Pior que link errado: beco sem saída.
 *
 * REGRA: se a rota já declara o segmento (/oticas, /medical), navega direto —
 * não se pergunta o que já se sabe. Se não declara (home, /precos, blog,
 * contato), oferece as duas opções.
 *
 * O mobile NÃO usa menu: os CTAs já vivem dentro do acordeão aberto do header,
 * onde há espaço vertical, e popover dentro de acordeão é desconfortável. Lá as
 * duas opções aparecem empilhadas, sem clique intermediário.
 */

type Role = "entrar" | "cadastrar";
type Variant = "desktop" | "mobile";

interface Opcao {
  href: string;
  label: string;
  Icon: typeof Eye;
  externo: boolean;
}

/** O login da clínica é o único destino em outro domínio. */
const OPCOES: Record<Role, { otica: Opcao; clinica: Opcao; rotulo: string }> = {
  entrar: {
    rotulo: "Entrar",
    otica: { href: LOGIN_URL, label: "Sou ótica", Icon: Eye, externo: false },
    clinica: {
      href: MEDICAL_LOGIN_URL,
      label: "Sou clínica",
      Icon: Stethoscope,
      externo: true,
    },
  },
  cadastrar: {
    rotulo: "Começar grátis",
    otica: { href: REGISTER_URL, label: "Tenho uma ótica", Icon: Eye, externo: false },
    clinica: {
      href: "/registro-medical",
      label: "Tenho uma clínica",
      Icon: Stethoscope,
      externo: false,
    },
  },
};

function segmentoDaRota(pathname: string | null): "otica" | "clinica" | null {
  if (pathname === "/oticas" || pathname?.startsWith("/oticas/")) return "otica";
  if (pathname === "/medical" || pathname?.startsWith("/medical/")) return "clinica";
  return null;
}

/** Props de link externo, aplicadas só quando o destino é outro domínio. */
function propsExternas(externo: boolean) {
  return externo ? { target: "_blank", rel: "noopener noreferrer" } : {};
}

export function ProductCta({ role, variant }: { role: Role; variant: Variant }) {
  const conjunto = OPCOES[role];
  const segmento = segmentoDaRota(usePathname());
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const itensRef = useRef<Array<HTMLAnchorElement | null>>([]);

  /** Move o foco entre os itens do menu (roving focus). */
  function focarItem(indice: number) {
    const itens = itensRef.current.filter(Boolean) as HTMLAnchorElement[];
    if (itens.length === 0) return;
    const alvo = (indice + itens.length) % itens.length; // circular
    itens[alvo]?.focus();
  }

  // Escape fecha E devolve o foco ao botão — sem isso o foco fica preso num
  // elemento invisível. Clique fora também fecha. Este é o caminho de entrada de
  // quem já é cliente: se o menu prender, o cliente não entra.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        botaoRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [aberto]);

  /** Setas, Home e End dentro do menu. Chamado no onKeyDown de cada item. */
  function onKeyDownItem(e: React.KeyboardEvent, indice: number) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focarItem(indice + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focarItem(indice - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focarItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focarItem(itensRef.current.length - 1);
    }
  }

  /** Abre o menu e põe o foco no 1º item — o que o teclado espera de um menu. */
  function abrirEFocar() {
    setAberto(true);
    // O item só existe/está visível após o render, daí o timeout de 1 tick.
    setTimeout(() => focarItem(0), 0);
  }

  const ehPrimario = role === "cadastrar";

  const classePrimario =
    variant === "desktop"
      ? "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white group transition-all"
      : "flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-bold text-white";
  const estiloPrimario = {
    background: "var(--gradient-brand-vivid)",
    boxShadow: "0 2px 12px var(--brand-glow)",
  };
  const classeSecundario =
    variant === "desktop"
      ? "text-sm font-medium transition-colors"
      : "px-4 py-3 rounded-xl text-sm font-medium transition-colors";
  const estiloSecundario = { color: "var(--lp-muted)" };

  const classeBotao = ehPrimario ? classePrimario : classeSecundario;
  const estiloBotao = ehPrimario ? estiloPrimario : estiloSecundario;

  // ── Rota declara o segmento: vai direto ──
  if (segmento) {
    const opcao = conjunto[segmento];
    return (
      <Link href={opcao.href} className={classeBotao} style={estiloBotao} {...propsExternas(opcao.externo)}>
        {conjunto.rotulo}
        {ehPrimario && (
          <ArrowRight
            className={
              variant === "desktop"
                ? "h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                : "h-4 w-4"
            }
          />
        )}
      </Link>
    );
  }

  // ── Mobile sem segmento: as duas opções empilhadas, sem menu ──
  if (variant === "mobile") {
    return (
      <div className="flex flex-col gap-2">
        {(["otica", "clinica"] as const).map((k) => {
          const o = conjunto[k];
          return (
            <Link
              key={k}
              href={o.href}
              className={classeBotao}
              style={estiloBotao}
              {...propsExternas(o.externo)}
            >
              <o.Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {conjunto.rotulo}: {o.label.replace(/^(Sou|Tenho uma) /, "")}
            </Link>
          );
        })}
      </div>
    );
  }

  // ── Desktop sem segmento: menu ──
  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={botaoRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => (aberto ? setAberto(false) : abrirEFocar())}
        onKeyDown={(e) => {
          // Seta para baixo abre o menu já com o foco no 1º item.
          if (e.key === "ArrowDown" && !aberto) {
            e.preventDefault();
            abrirEFocar();
          }
        }}
        className={classeBotao}
        style={estiloBotao}
      >
        {conjunto.rotulo}
        {ehPrimario && (
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        )}
      </button>

      {/* O nó fica montado mesmo fechado para o teste poder ler os destinos.
          NÃO é por acessibilidade: com a classe `hidden` o navegador aplica
          display:none e o nó sai da árvore de acessibilidade de qualquer forma.
          Por isso o estado fechado é afirmado TAMBÉM no markup (`aria-hidden` e
          `tabIndex={-1}`), em vez de depender só do CSS — se algum dia um
          `display` sobrescrever o `hidden`, dois links focáveis não vazam para a
          ordem de tabulação atrás de um botão que diz `aria-expanded="false"`. */}
      <div
        role="menu"
        aria-label={conjunto.rotulo}
        aria-hidden={!aberto}
        className={`absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl ${aberto ? "" : "hidden"}`}
        style={{
          background: "var(--lp-surface)",
          border: "1px solid var(--lp-border-hover)",
          boxShadow: "0 8px 32px rgba(10,31,68,0.12)",
        }}
      >
        {(["otica", "clinica"] as const).map((k, i) => {
          const o = conjunto[k];
          return (
            <Link
              key={k}
              ref={(el) => {
                itensRef.current[i] = el;
              }}
              role="menuitem"
              href={o.href}
              tabIndex={aberto ? 0 : -1}
              onClick={() => setAberto(false)}
              onKeyDown={(e) => onKeyDownItem(e, i)}
              className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium transition-colors hover:bg-[var(--lp-surface-hover)] focus-visible:bg-[var(--lp-surface-hover)] focus-visible:outline-none"
              style={{ color: "var(--lp-foreground)" }}
              {...propsExternas(o.externo)}
            >
              <o.Icon
                className="h-4 w-4 shrink-0"
                style={{ color: "var(--brand-primary)" }}
                aria-hidden="true"
              />
              {o.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
