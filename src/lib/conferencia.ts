import type { Prisma, PrismaClient, TipoAvaria } from "@prisma/client";
import { parseNFProducts } from "@/lib/nf-produtos";
import { calcularPrejuizo } from "@/lib/avaria-prejuizo";

/**
 * Conferencia de carregamento por codigo de barras. A rota inteira e
 * conferida: cada NF de cada entrega vira itens (produto x NF) com a
 * quantidade esperada em unidade comercial (caixa, fardo). A conferencia e
 * cega — o esperado so aparece depois de finalizar.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** GTIN normalizado com 14 digitos: leitor que devolve EAN-13 com ou sem zero a esquerda casa igual. */
export function gtin14(codigo: string | null | undefined): string | null {
  const d = String(codigo || "").replace(/\D/g, "");
  if (d.length < 8 || d.length > 14) return null;
  return d.padStart(14, "0");
}

export interface ItemMontado {
  entregaId: string;
  notaFiscalId: string;
  nfNumero: string;
  codigoProduto: string;
  descricao: string;
  unidade: string;
  ean: string | null;
  eanUnidade: string | null;
  valorUnitario: number;
  qtdEsperada: number;
}

/** Itens a conferir de uma rota, a partir do XML das NFs das entregas dela. */
export async function montarItensDaRota(db: Db, rotaId: string): Promise<ItemMontado[]> {
  const entregas = await db.entrega.findMany({
    where: { rotaId },
    orderBy: { razaoSocial: "asc" },
    select: { id: true, notas: { orderBy: { numero: "asc" }, select: { id: true, numero: true, xmlOriginal: true } } },
  });
  const itens: ItemMontado[] = [];
  for (const e of entregas) {
    for (const nf of e.notas) {
      // Mesmo produto repetido na NF vira uma linha so
      const porCodigo = new Map<string, ItemMontado>();
      for (const p of parseNFProducts(nf.xmlOriginal).produtos) {
        const atual = porCodigo.get(p.codigo);
        if (atual) { atual.qtdEsperada += p.quantidade; continue; }
        porCodigo.set(p.codigo, {
          entregaId: e.id,
          notaFiscalId: nf.id,
          nfNumero: nf.numero,
          codigoProduto: p.codigo,
          descricao: p.descricao,
          unidade: p.unidade,
          ean: gtin14(p.ean),
          eanUnidade: gtin14(p.eanTrib),
          valorUnitario: p.valorUnitario,
          qtdEsperada: p.quantidade,
        });
      }
      itens.push(...Array.from(porCodigo.values()));
    }
  }
  return itens;
}

type ItemLeitura = { id: string; ean: string | null; eanUnidade: string | null; qtdEsperada: number; qtdConferida: number; foraDaCarga: boolean };

/**
 * Item que recebe uma leitura. O mesmo produto pode estar em varias NFs da
 * rota: a leitura vai para a primeira linha que ainda nao completou o
 * esperado (o servidor sabe o esperado; o conferente nao ve) e, se todas ja
 * completaram, para a primeira — virando sobra.
 */
export function acharItemDaLeitura<T extends ItemLeitura>(itens: T[], codigo: string): T | null {
  const g = gtin14(codigo);
  if (!g) return null;
  const candidatos = itens.filter((i) => !i.foraDaCarga && (i.ean === g || i.eanUnidade === g));
  if (candidatos.length === 0) return null;
  return candidatos.find((i) => i.qtdConferida < i.qtdEsperada) || candidatos[0];
}

export type SituacaoItem = "OK" | "FALTA" | "SOBRA" | "FORA_DA_CARGA";

export interface ResultadoItem {
  situacao: SituacaoItem;
  falta: number;
  sobra: number;
  avaria: number;
}

/** Compara um item. Avaria e quantas das contadas estao avariadas (independe de falta/sobra). */
export function compararItem(i: { qtdEsperada: number; qtdConferida: number; qtdAvaria: number; foraDaCarga: boolean }): ResultadoItem {
  const avaria = Math.max(0, i.qtdAvaria || 0);
  if (i.foraDaCarga) return { situacao: "FORA_DA_CARGA", falta: 0, sobra: i.qtdConferida, avaria };
  const diff = (i.qtdConferida || 0) - (i.qtdEsperada || 0);
  if (diff < 0) return { situacao: "FALTA", falta: -diff, sobra: 0, avaria };
  if (diff > 0) return { situacao: "SOBRA", falta: 0, sobra: diff, avaria };
  return { situacao: "OK", falta: 0, sobra: 0, avaria };
}

export const temDivergencia = (r: ResultadoItem) => r.situacao !== "OK" || r.avaria > 0;

type ItemConferido = ItemLeitura & {
  entregaId: string | null; notaFiscalId: string | null; codigoProduto: string; descricao: string;
  unidade: string | null; valorUnitario: number; qtdAvaria: number; observacao: string | null;
};

/**
 * Cria a avaria da conferencia: uma linha por divergencia (falta, sobra,
 * avaria; item fora da carga entra como sobra). Prejuizo pela regra comum
 * (so falta e avaria contam).
 */
export async function criarAvariaDaConferencia(
  db: Db,
  args: { rotaCodigo: string; registradoPorId: string; itens: ItemConferido[] },
): Promise<{ id: string; codigo: string } | null> {
  const linhas: Prisma.AvariaProdutoCreateWithoutAvariaInput[] = [];
  let primeiraEntrega: string | null = null;
  for (const i of args.itens) {
    const r = compararItem(i);
    const base = {
      codigoProduto: i.codigoProduto,
      descricao: i.descricao,
      unidade: i.unidade,
      quantidadeNF: i.qtdEsperada,
      valorUnitario: i.valorUnitario,
      notaFiscal: i.notaFiscalId ? { connect: { id: i.notaFiscalId } } : undefined,
      observacoes: i.foraDaCarga ? "Código lido fora da carga da rota" : i.observacao || null,
    };
    const add = (tipo: TipoAvaria, qtd: number) => {
      if (qtd <= 0) return;
      linhas.push({ ...base, tipoDivergencia: tipo, quantidadeAvaria: qtd, valorTotal: qtd * (i.valorUnitario || 0) });
      if (!primeiraEntrega && i.entregaId) primeiraEntrega = i.entregaId;
    };
    add("FALTA", r.falta);
    add("SOBRA", r.sobra);
    add("AVARIA", r.avaria);
  }
  if (linhas.length === 0) return null;

  const contagem = linhas.reduce((m: Record<string, number>, l) => ((m[l.tipoDivergencia!] = (m[l.tipoDivergencia!] || 0) + 1), m), {});
  const tipo = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0][0] as TipoAvaria;

  const ultima = await db.avaria.findFirst({ orderBy: { createdAt: "desc" }, select: { codigo: true } });
  const codigo = `AVR-${String((parseInt(ultima?.codigo.replace("AVR-", "") || "0", 10) || 0) + 1).padStart(5, "0")}`;

  const avaria = await db.avaria.create({
    data: {
      codigo,
      tipo,
      fase: "CARREGAMENTO",
      status: "PENDENTE",
      dataOcorrencia: new Date(),
      descricao: `Conferência de carregamento — rota ${args.rotaCodigo}`,
      valorPrejuizo: calcularPrejuizo(tipo, linhas.map((l) => ({ tipoDivergencia: l.tipoDivergencia, valorTotal: l.valorTotal }))),
      registradoPor: { connect: { id: args.registradoPorId } },
      ...(primeiraEntrega ? { entrega: { connect: { id: primeiraEntrega } } } : {}),
      produtos: { create: linhas },
    },
    select: { id: true, codigo: true },
  });
  return avaria;
}
