/**
 * Escapa caracteres especiais de HTML para prevenir XSS ao interpolar dados
 * controlados pelo usuário (nome de produto/cliente/empresa, etc.) em templates
 * HTML gerados no servidor — ex.: relatórios impressos via innerHTML/window.open.
 *
 * Sem isso, um nome como `<img src=x onerror=alert(1)>` executa script ao abrir
 * o relatório no navegador (XSS armazenado).
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
