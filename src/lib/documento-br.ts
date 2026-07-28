/**
 * Validação de CPF/CNPJ por DÍGITO VERIFICADOR.
 *
 * 🔥 Por que isto existe: o sistema validava só o COMPRIMENTO (11 ou 14
 * dígitos). Um CNPJ inventado com 14 dígitos passava no cadastro, e o problema
 * só aparecia semanas depois, na hora de cobrar — o gateway recusa com "O
 * CPF/CNPJ informado é inválido" e a cobrança não sai. O cliente já estava
 * dentro, em trial, e consertar exigia contato com ele.
 *
 * Validar aqui move a falha para o único momento barato: o cadastro.
 */

export type TipoDocumento = "CPF" | "CNPJ";

/** Só os dígitos. */
export function limparDocumento(valor: string): string {
  return (valor ?? "").replace(/\D/g, "");
}

function digitoPorPesos(base: string, pesos: number[]): number {
  let soma = 0;
  for (let i = 0; i < pesos.length; i++) soma += Number(base[i]) * pesos[i];
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function isCpfValido(valor: string): boolean {
  const c = limparDocumento(valor);
  if (c.length !== 11) return false;
  // Sequências repetidas (111.111.111-11) satisfazem a fórmula mas não existem.
  if (/^(\d)\1+$/.test(c)) return false;

  const d1 = digitoPorPesos(c, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoPorPesos(c, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(c[9]) && d2 === Number(c[10]);
}

export function isCnpjValido(valor: string): boolean {
  const c = limparDocumento(valor);
  if (c.length !== 14) return false;
  if (/^(\d)\1+$/.test(c)) return false;

  const d1 = digitoPorPesos(c, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoPorPesos(c, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(c[12]) && d2 === Number(c[13]);
}

/**
 * Aceita CPF **ou** CNPJ — o produto atende consultório individual (pessoa
 * física) e clínica (pessoa jurídica), então exigir CNPJ excluiria metade do
 * público-alvo.
 */
export function isDocumentoValido(valor: string): boolean {
  const c = limparDocumento(valor);
  if (c.length === 11) return isCpfValido(c);
  if (c.length === 14) return isCnpjValido(c);
  return false;
}

export function tipoDocumento(valor: string): TipoDocumento | null {
  const c = limparDocumento(valor);
  if (c.length === 11) return "CPF";
  if (c.length === 14) return "CNPJ";
  return null;
}

/** Mensagem de erro específica — genérica não diz o que corrigir. */
export function erroDocumento(valor: string): string | null {
  const c = limparDocumento(valor);
  if (!c) return "Informe o CPF ou o CNPJ.";
  if (c.length !== 11 && c.length !== 14) {
    return `CPF tem 11 dígitos e CNPJ tem 14 — você digitou ${c.length}.`;
  }
  if (!isDocumentoValido(c)) {
    return `${tipoDocumento(c)} inválido (dígito verificador não confere).`;
  }
  return null;
}

/** Aplica máscara conforme o tamanho, para exibição. */
export function formatarDocumento(valor: string): string {
  const c = limparDocumento(valor).slice(0, 14);
  if (c.length <= 11) {
    return c
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return c
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}
