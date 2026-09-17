/**
 * Escape de HTML para os builders de impressao.
 *
 * Modulo PURO: sem React, sem prisma, sem DOM — a tela de relatorio e a ficha
 * de conferencia montam HTML por template string e jogam em document.write,
 * entao precisam disto no browser.
 *
 * Por que importa: razao social, endereco e emitente vem do XML da NF, que e
 * dado de terceiro. Um emitente chamado `<img src=x onerror=...>` executa
 * script na origem do app quando alguem imprime, porque a janela aberta por
 * window.open("", "_blank") e same-origin.
 *
 * Cobre tambem a aspa simples, que fecha atributo escrito com aspa simples —
 * `esc` de ticket-html.ts nao cobre porque la todo atributo usa aspa dupla.
 */
export function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
