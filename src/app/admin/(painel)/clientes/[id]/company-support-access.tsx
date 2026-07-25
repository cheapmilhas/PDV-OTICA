"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, LifeBuoy, Loader2 } from "lucide-react";

interface CompanySupportAccessProps {
  companyId: string;
  /** Sem clínica provisionada não há o que acessar. */
  hasClinic: boolean;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "granted"; magicUrl: string; grantId: string }
  | { kind: "error"; message: string };

/**
 * F3.6 — resgate do código de acesso de suporte (lado Vis).
 *
 * O CLIENTE gera um código no Domus e passa ao atendente; o operador cola aqui e
 * recebe um link de acesso somente-leitura, válido por poucos minutos. Substitui
 * a impersonação cega: sem código do cliente, não há acesso.
 *
 * O link NÃO é aberto automaticamente nem copiado sem ação: ele é um bearer de
 * uso único (o token vive no fragmento da URL), então quem decide usá-lo é a
 * pessoa. Abrir sozinho num prefetch queimaria o token.
 */
export function CompanySupportAccess({ companyId, hasClinic }: CompanySupportAccessProps) {
  const [code, setCode] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  async function redeem() {
    const trimmed = code.trim();
    if (!trimmed || state.kind === "loading") return;

    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/support-redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        data?: { magicUrl?: string; supportGrantId: string };
      };
      if (!res.ok || !json.data?.magicUrl) {
        setState({
          kind: "error",
          message: json.error ?? "Não foi possível resgatar o código.",
        });
        return;
      }
      // Código consumido (uso único): limpar o campo evita reenvio inútil.
      setCode("");
      setState({
        kind: "granted",
        magicUrl: json.data.magicUrl,
        grantId: json.data.supportGrantId,
      });
    } catch {
      setState({ kind: "error", message: "Falha de rede ao resgatar o código." });
    }
  }

  async function copyUrl() {
    if (state.kind !== "granted" || !state.magicUrl) return;
    try {
      await navigator.clipboard.writeText(state.magicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponível — o link continua visível para cópia manual.
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
        <LifeBuoy className="h-4 w-4 text-muted-foreground" />
        Acesso de suporte
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Peça ao cliente o código gerado em Configurações → Acesso de suporte. O
        acesso é somente leitura, dura 60 minutos e fica registrado na trilha que
        o cliente enxerga.
      </p>

      {!hasClinic ? (
        <p className="text-xs text-muted-foreground">
          Disponível quando a clínica estiver provisionada no Medical.
        </p>
      ) : state.kind === "granted" ? (
        <div className="space-y-2">
          <p className="text-xs text-foreground">
            Acesso autorizado. Abra o link para entrar na clínica:
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={state.magicUrl}
              className="flex-1 px-3 py-2 bg-muted border border-input rounded-lg text-foreground text-xs font-mono focus:outline-none"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={copyUrl}
              className="flex items-center gap-1.5 px-3 py-2 bg-muted text-foreground text-xs rounded-lg hover:bg-muted/70 transition-colors whitespace-nowrap"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
            <a
              href={state.magicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-xs rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            O link vale por poucos minutos e serve uma única vez.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") redeem();
              }}
              placeholder="XXXXX-XXXXX"
              disabled={state.kind === "loading"}
              className="flex-1 px-3 py-2 bg-muted border border-input rounded-lg text-foreground text-sm font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
            <button
              type="button"
              onClick={redeem}
              disabled={!code.trim() || state.kind === "loading"}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {state.kind === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Resgatar
            </button>
          </div>
          {state.kind === "error" && (
            <p className="text-xs text-destructive">{state.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
