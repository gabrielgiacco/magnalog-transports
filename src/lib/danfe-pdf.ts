// Baixa o DANFE/DACTE oficial em PDF, gerado pelo Meu Danfe.
//
// Antes isto rasterizava o HTML do DanfeViewer com html2canvas/jsPDF: o texto
// não era selecionável e o layout dependia de escala. Agora vem o PDF oficial
// vetorial da API, que é gratuito para documento já na Área do Cliente.
//
// O visual (papel, margens, fonte, quais campos aparecem) é configurado no menu
// Layout PDF da Área do Cliente do Meu Danfe, não aqui.

export type FormatoDanfe = "completo" | "simplificado" | "etiqueta" | "cupom";

export const ROTULO_FORMATO: Record<FormatoDanfe, string> = {
  completo: "DANFE completo",
  simplificado: "DANFE simplificado",
  etiqueta: "Etiqueta",
  cupom: "Cupom de varejo",
};

interface Opcoes {
  /** Nome do arquivo salvo. Sem isso, usa o nome devolvido pela API. */
  filename?: string;
  /** XML da nota, usado se ela ainda não estiver na Área do Cliente. */
  xml?: string;
  /** true abre em nova aba em vez de baixar. */
  abrir?: boolean;
}

export async function baixarDanfeOficial(
  chave: string,
  formato: FormatoDanfe = "completo",
  opcoes: Opcoes = {}
): Promise<void> {
  const res = await fetch("/api/danfe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chave, formato, xml: opcoes.xml }),
  });

  if (!res.ok) {
    let msg = "Erro ao gerar o DANFE.";
    try { msg = (await res.json()).error || msg; } catch { /* resposta não-JSON */ }
    throw new Error(msg);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  if (opcoes.abrir) {
    window.open(url, "_blank");
    // Não revoga na hora: a aba nova ainda precisa da URL.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const nome = (opcoes.filename || `DANFE_${chave}`).replace(/[^a-z0-9._-]+/gi, "_");
  const a = document.createElement("a");
  a.href = url;
  a.download = nome.endsWith(".pdf") ? nome : `${nome}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
