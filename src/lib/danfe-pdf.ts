// Utilitário para converter o DANFE renderizado (HTML) em PDF baixável.
// Usa html2pdf.js (client-only) — carrega via dynamic import pra não quebrar SSR.

export async function baixarDanfePDF(element: HTMLElement, filename: string) {
  if (typeof window === "undefined") return;
  const html2pdf = (await import("html2pdf.js")).default;
  const nome = filename.replace(/[^a-z0-9._-]+/gi, "_");

  // Clona o elemento pra remover qualquer transform (zoom) aplicado no viewer.
  // Sem isso, se o usuário estiver com zoom != 100%, o PDF sai distorcido.
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.transform = "none";
  clone.style.transformOrigin = "top left";
  clone.style.width = "210mm";

  // Container temporário fora da tela pra renderização controlada
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.background = "#ffffff";
  container.style.width = "210mm";
  container.appendChild(clone);
  document.body.appendChild(container);

  try {
    await html2pdf()
      .set({
        margin: [4, 4, 4, 4],
        filename: nome.endsWith(".pdf") ? nome : `${nome}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 3,
          useCORS: true,
          letterRendering: true,
          backgroundColor: "#ffffff",
          windowWidth: 794, // 210mm em pixels a 96dpi
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait", compress: true },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      })
      .from(clone)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}
