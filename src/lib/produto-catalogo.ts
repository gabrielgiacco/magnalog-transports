import { prisma } from "@/lib/prisma";
import { parseNFProducts } from "@/lib/nf-produtos";

// Normaliza texto para busca: lowercase, sem acentos, alfanumerico + espaco
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizar(query: string): string[] {
  return normalizar(query)
    .split(" ")
    .filter((t) => t.length >= 2);
}

type ProdutoDaNota = {
  fornecedorCnpj: string;
  fornecedorNome: string | null;
  codigo: string;
  descricao: string;
  ncm: string | null;
  unidade: string | null;
  dataEmissao: Date | null;
};

export async function indexarProdutosDoXml(
  xmlOriginal: string | null,
  fornecedorCnpj?: string | null,
  fornecedorNome?: string | null,
  dataEmissao?: Date | null,
): Promise<number> {
  if (!xmlOriginal) return 0;
  const parsed = parseNFProducts(xmlOriginal);
  const cnpj = (fornecedorCnpj || parsed.emitente?.cnpj || "").replace(/\D/g, "");
  const nome = fornecedorNome || parsed.emitente?.razaoSocial || null;
  if (!cnpj || parsed.produtos.length === 0) return 0;

  const data = dataEmissao || new Date();
  let contador = 0;

  for (const p of parsed.produtos) {
    const codigo = String(p.codigo || "").trim();
    const descricao = String(p.descricao || "").trim();
    if (!codigo || !descricao) continue;

    const descricaoNorm = normalizar(descricao);
    if (!descricaoNorm) continue;

    try {
      const registro = await prisma.produtoCatalogo.upsert({
        where: { fornecedorCnpj_codigo: { fornecedorCnpj: cnpj, codigo } },
        create: {
          fornecedorCnpj: cnpj,
          fornecedorNome: nome,
          codigo,
          descricao,
          descricaoNorm,
          ncm: p.ncm || null,
          unidade: p.unidade || null,
          contagemUso: 1,
          primeiraOcorrencia: data,
          ultimaOcorrencia: data,
          valorUnitario: p.valorUnitario || null,
          valorUnitarioEm: data,
        },
        update: {
          descricao,
          descricaoNorm,
          ncm: p.ncm || null,
          unidade: p.unidade || null,
          fornecedorNome: nome,
          contagemUso: { increment: 1 },
          ultimaOcorrencia: data,
          // preço fica de fora daqui: só vale se esta nota for a mais recente
        },
      });

      // O backfill percorre as notas por id, não por data de emissão, então a
      // última processada não é necessariamente a mais recente. Só sobrescreve
      // o preço quando esta nota for mais nova que a que originou o valor atual.
      if (!registro.valorUnitarioEm || registro.valorUnitarioEm < data) {
        await prisma.produtoCatalogo.update({
          where: { id: registro.id },
          data: { valorUnitario: p.valorUnitario || null, valorUnitarioEm: data },
        });
      }
      contador++;
    } catch {
      // ignora produto individual com erro
    }
  }
  return contador;
}

export type BuscaResultado = {
  id: string;
  codigo: string;
  descricao: string;
  fornecedorCnpj: string;
  fornecedorNome: string | null;
  ncm: string | null;
  unidade: string | null;
  contagemUso: number;
  ultimaOcorrencia: Date;
  valorUnitario: number | null;
  valorUnitarioEm: Date | null;
  score: number;
  tokensMatch: string[];
};

export async function buscarProdutos(query: string, limite = 30): Promise<BuscaResultado[]> {
  const tokens = tokenizar(query);
  if (tokens.length === 0) return [];

  // WHERE descricaoNorm LIKE '%tok1%' OR codigo LIKE 'tok1%'  (para qualquer token)
  const orClauses: any[] = [];
  for (const t of tokens) {
    orClauses.push({ descricaoNorm: { contains: t } });
    orClauses.push({ codigo: { startsWith: t } });
  }

  const candidatos = await prisma.produtoCatalogo.findMany({
    where: { OR: orClauses },
    take: 500,
  });

  const resultados: BuscaResultado[] = candidatos.map((p) => {
    const matched: string[] = [];
    for (const t of tokens) {
      if (p.descricaoNorm.includes(t) || p.codigo.toLowerCase().startsWith(t)) {
        matched.push(t);
      }
    }
    // score: tokens em comum * peso + bonus por match exato do codigo + bonus por uso frequente
    let score = matched.length * 10;
    if (tokens.length > 0 && matched.length === tokens.length) score += 15;
    if (p.codigo.toLowerCase() === tokens.join("")) score += 20;
    score += Math.log(p.contagemUso + 1);

    return {
      id: p.id,
      codigo: p.codigo,
      descricao: p.descricao,
      fornecedorCnpj: p.fornecedorCnpj,
      fornecedorNome: p.fornecedorNome,
      ncm: p.ncm,
      unidade: p.unidade,
      contagemUso: p.contagemUso,
      ultimaOcorrencia: p.ultimaOcorrencia,
      valorUnitario: p.valorUnitario,
      valorUnitarioEm: p.valorUnitarioEm,
      score,
      tokensMatch: matched,
    };
  });

  resultados.sort((a, b) => b.score - a.score);
  return resultados.slice(0, limite);
}
