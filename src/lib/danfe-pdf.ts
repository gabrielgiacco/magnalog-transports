// Utilitário para converter o DANFE renderizado (HTML) em PDF baixável.
// Usa html2pdf.js (client-only) — carrega via dynamic import pra não quebrar SSR.

export async function baixarDanfePDF(element: HTMLElement, filename: string) {
  if (typeof window === "undefined") return;
  const html2pdf = (await import("html2pdf.js")).default;
  const nome = filename.replace(/[^a-z0-9._-]+/gi, "_");
  await html2pdf()
    .set({
      margin: [5, 5, 5, 5],
      filename: nome.endsWith(".pdf") ? nome : `${nome}.pdf`,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    })
    .from(element)
    .save();
}
