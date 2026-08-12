import { prisma } from "@/lib/prisma";
import { parseNFProducts } from "@/lib/nf-produtos";

export type FonteCarga = "paletes" | "m3" | "sem_dados";

export type CargaEntrega = {
  paletes: number;
  m3: number | null;
  fonte: FonteCarga;
  ncmsPrincipais: string[];
};

const M3_REGEX = /M\s*[3³]\s*:?\s*(\d+(?:[.,]\d+)?)/i;

type EntregaLike = {
  quantidadePaletes: number | null;
  notas: { xmlOriginal: string | null }[];
};

export function extrairCargaEntrega(entrega: EntregaLike): CargaEntrega {
  const ncmCounter = new Map<string, number>();
  let m3Soma = 0;
  let achouM3 = false;

  for (const nf of entrega.notas || []) {
    if (!nf.xmlOriginal) continue;
    const parsed = parseNFProducts(nf.xmlOriginal);
    for (const p of parsed.produtos) {
      if (p.ncm) ncmCounter.set(p.ncm, (ncmCounter.get(p.ncm) || 0) + 1);
    }
    const infAdic = parsed.infAdicionais || "";
    const match = infAdic.match(M3_REGEX);
    if (match) {
      const num = parseFloat(match[1].replace(",", "."));
      if (!isNaN(num) && num > 0) {
        m3Soma += num;
        achouM3 = true;
      }
    }
  }

  const ncmsPrincipais = Array.from(ncmCounter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([ncm]) => ncm);

  const paletes = entrega.quantidadePaletes || 0;
  if (paletes > 0) {
    return { paletes, m3: null, fonte: "paletes", ncmsPrincipais };
  }
  if (achouM3) {
    return { paletes: 0, m3: m3Soma, fonte: "m3", ncmsPrincipais };
  }
  return { paletes: 0, m3: null, fonte: "sem_dados", ncmsPrincipais };
}

export type HistoricoSugestao = {
  veiculoId: string;
  usos: number;
  totalEntregas: number;
  confianca: number;
  filtradoPorNcm: boolean;
};

export async function sugerirPorHistorico(
  cnpjDestinatario: string,
  ncmsPrincipais: string[]
): Promise<HistoricoSugestao[]> {
  if (!cnpjDestinatario) return [];
  const cnpjLimpo = cnpjDestinatario.replace(/\D/g, "");
  if (!cnpjLimpo) return [];

  const entregasDoCliente = await prisma.entrega.findMany({
    where: {
      cnpj: cnpjLimpo,
      status: { in: ["FINALIZADO", "ENTREGUE"] },
      veiculoId: { not: null },
    },
    include: { notas: { select: { xmlOriginal: true } } },
    orderBy: { dataEntrega: "desc" },
    take: 10,
  });

  if (entregasDoCliente.length < 3) return [];

  let base = entregasDoCliente;
  let filtradoPorNcm = false;

  if (ncmsPrincipais.length > 0) {
    const setNcm = new Set(ncmsPrincipais);
    const comMatch = entregasDoCliente.filter((e) => {
      for (const nf of e.notas) {
        if (!nf.xmlOriginal) continue;
        const parsed = parseNFProducts(nf.xmlOriginal);
        if (parsed.produtos.some((p) => p.ncm && setNcm.has(p.ncm))) return true;
      }
      return false;
    });
    if (comMatch.length >= 3) {
      base = comMatch;
      filtradoPorNcm = true;
    }
  }

  const contagem = new Map<string, number>();
  for (const e of base) {
    if (e.veiculoId) contagem.set(e.veiculoId, (contagem.get(e.veiculoId) || 0) + 1);
  }

  const total = base.length;
  return Array.from(contagem.entries())
    .map(([veiculoId, usos]) => ({
      veiculoId,
      usos,
      totalEntregas: total,
      confianca: usos / total,
      filtradoPorNcm,
    }))
    .sort((a, b) => b.usos - a.usos);
}
