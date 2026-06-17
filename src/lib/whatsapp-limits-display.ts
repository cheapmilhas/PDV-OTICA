/**
 * Helpers de APRESENTAÇÃO das travas de WhatsApp (somente UI — sem lógica de
 * envio). Geram a frase de preview ao vivo usada nas telas do super admin
 * (limites global + override por ótica). Mantém o texto consistente nas duas.
 */

/** Formata uma hora inteira (0-24) como "8h" / "18h". */
export function fmtHour(h: number): string {
  return `${h}h`;
}

/**
 * Frase legível do efeito das travas. Ex.: "Envios das 8h às 18h, seg–sáb · teto 50/dia".
 * skipSaturday=true → "seg–sex". Domingo e feriados fixos são sempre pulados (implícito).
 * Retorna null se algum valor for inválido (a UI mostra um aviso em vez do preview).
 */
export function formatLimitsPreview(args: {
  openHour: number;
  closeHour: number;
  dailyCap: number;
  skipSaturday: boolean;
}): string | null {
  const { openHour, closeHour, dailyCap, skipSaturday } = args;
  if (
    !Number.isFinite(openHour) || !Number.isFinite(closeHour) || !Number.isFinite(dailyCap) ||
    closeHour <= openHour || dailyCap < 1
  ) {
    return null;
  }
  const dias = skipSaturday ? "seg–sex" : "seg–sáb";
  return `Envios das ${fmtHour(openHour)} às ${fmtHour(closeHour)}, ${dias} · teto ${dailyCap}/dia`;
}
