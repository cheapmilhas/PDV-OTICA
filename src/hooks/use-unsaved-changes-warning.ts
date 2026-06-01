import { useEffect } from "react";

/**
 * M17: avisa o usuário antes de sair da página (fechar aba, recarregar,
 * navegar pelo browser) quando há trabalho não salvo — carrinho do PDV, OS ou
 * orçamento em edição. Sem isso, um F5 ou fechar a aba descartava tudo sem aviso.
 *
 * Usa o evento beforeunload (cobre reload/fechar/back do browser). Navegação
 * via <Link> do Next não dispara beforeunload — para esses casos o ideal é um
 * guard de rota, mas o beforeunload já cobre o caso mais comum de perda.
 */
export function useUnsavedChangesWarning(hasUnsavedChanges: boolean): void {
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Browsers modernos ignoram a string e mostram mensagem genérica, mas
      // returnValue precisa ser setado para o prompt aparecer.
      e.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);
}
