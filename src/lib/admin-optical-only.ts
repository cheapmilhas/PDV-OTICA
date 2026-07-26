import type { PlatformProduct } from "@prisma/client";

/**
 * Gate de produto das ações do super admin que só fazem sentido no Vis App
 * (ótica) — dívida B4 da Entrega 2.
 *
 * Duas ações do painel são estruturalmente ÓTICAS:
 *
 *  - **Impersonar** monta um JWT do PDV a partir de um `User` do banco do Vis.
 *    Cliente medical não tem usuário aqui: a equipe da clínica vive no Domus,
 *    banco separado. Além de não funcionar, o caminho contorna a Entrega 3 —
 *    acesso a dado clínico deve passar por código de autorização gerado pelo
 *    CLIENTE, com escopo de leitura e trilha imutável. Impersonação é acesso
 *    sem consentimento e sem trilha do lado do Domus.
 *
 *  - **Re-sincronizar setup** reaplica plano de contas, contas financeiras e
 *    templates de conciliação: a configuração do PDV. Uma clínica não tem
 *    nenhuma dessas estruturas.
 *
 * A UI já esconde os dois botões para medical, mas esconder não é gatear: uma
 * chamada direta à API passava. Este gate é a defesa de verdade — o servidor
 * decide pelo produto gravado no cadastro, nunca pelo que o cliente envia.
 */
export function isOpticalOnlyActionAllowed(product: PlatformProduct): boolean {
  return product === "VIS_APP";
}

/** Mensagem única para as duas rotas, em linguagem de quem opera o painel. */
export const OPTICAL_ONLY_ACTION_MESSAGE =
  "Ação disponível apenas para clientes Vis App (ótica). Para acessar uma clínica Vis Medical, peça ao cliente um código de autorização de suporte.";
