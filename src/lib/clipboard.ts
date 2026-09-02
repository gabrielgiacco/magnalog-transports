// Cópia formatada para a área de transferência.
//
// Três camadas, porque a Clipboard API assíncrona só existe em contexto seguro
// (https ou localhost) e exige gesto do usuário. A camada 2 é o que faz o botão
// continuar funcionando em navegador antigo ou acesso por http na rede local.
//
// IMPORTANTE para quem chamar: monte `html` e `texto` ANTES de qualquer await,
// senão o Safari perde o contexto do clique e a camada 1 falha silenciosamente.

export type ResultadoCopia = "rico" | "rico-legado" | "texto";

export async function copiarRico(html: string, texto: string): Promise<ResultadoCopia> {
  // Camada 1 — Clipboard API assíncrona (o caminho normal em https)
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([texto], { type: "text/plain" }),
        }),
      ]);
      return "rico";
    } catch {
      // cai para a camada 2
    }
  }

  // Camada 2 — execCommand sobre um contentEditable fora da tela.
  // Usar opacity:0 + left:-9999px e NUNCA display:none: nó oculto por display
  // não entra em seleção, e a cópia sai vazia.
  try {
    const div = document.createElement("div");
    div.contentEditable = "true";
    div.innerHTML = html;
    div.style.position = "fixed";
    div.style.left = "-9999px";
    div.style.top = "0";
    div.style.opacity = "0";
    document.body.appendChild(div);

    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const ok = document.execCommand("copy");
    sel?.removeAllRanges();
    div.remove();
    if (ok) return "rico-legado";
  } catch {
    // cai para a camada 3
  }

  // Camada 3 — texto puro
  await navigator.clipboard.writeText(texto);
  return "texto";
}

// Abre a janela de composição do cliente de e-mail já com destinatários e
// assunto. O corpo vai VAZIO de propósito: a URL mailto tem limite prático de
// ~2000 caracteres e as tabelas nunca caberiam — elas vêm do Ctrl+V.
export function abrirMailto(o: { para: string; copia?: string; assunto: string }) {
  const limpa = (s?: string) =>
    (s || "")
      .split(/[;,]/)
      .map((e) => e.trim())
      .filter(Boolean)
      .join(",");

  const params: string[] = [];
  const cc = limpa(o.copia);
  if (cc) params.push(`cc=${encodeURIComponent(cc)}`);
  if (o.assunto) params.push(`subject=${encodeURIComponent(o.assunto)}`);

  const url = `mailto:${encodeURIComponent(limpa(o.para))}${params.length ? "?" + params.join("&") : ""}`;
  window.location.href = url;
}
