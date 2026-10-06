import type { Prisma, TipoAvaria } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Relatorio de avarias/faltas por embarcador — fonte unica da planilha
 * (/api/avarias/export) e do PDF (/imprimir/relatorio-avarias).
 *
 * Uma linha = uma linha de produto. Uma Declaracao de Recebimento pode
 * misturar tipos e NFs de embarcadores diferentes, entao tipo e embarcador
 * sao decididos por linha, nao pelo registro. O embarcador e o emitente da NF
 * (ver CLAUDE.md, "Vocabulario do dominio"), comparado pela raiz do CNPJ para
 * pegar todas as filiais (a Softys emite por 3 CNPJs).
 */

export const TIPO_AVARIA_LABEL: Record<string, string> = {
  AVARIA: "Avaria",
  FALTA: "Falta",
  INVERSAO: "Inversão",
  SOBRA: "Sobra",
  DEVOLUCAO: "Devolução",
  SEM_PEDIDO: "Sem pedido",
};

export const FASE_AVARIA_LABEL: Record<string, string> = {
  CONFERENCIA: "Conferência",
  CARREGAMENTO: "Carregamento",
  EM_ROTA: "Em rota",
  ENTREGA: "Entrega",
  DEVOLUCAO: "Devolução",
};

export const STATUS_AVARIA_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  EM_ANALISE: "Em análise",
  RESOLVIDA: "Resolvida",
  DESCARTADA: "Descartada",
};

const TIPOS_PADRAO: TipoAvaria[] = ["AVARIA", "FALTA"];

export interface FiltrosRelatorio {
  embarcador: string | null; // raiz do CNPJ, 8 digitos
  de: string | null; // YYYY-MM-DD
  ate: string | null; // YYYY-MM-DD
  tipos: TipoAvaria[];
}

export interface LinhaRelatorio {
  avariaId: string;
  codigo: string;
  data: Date;
  tipo: string;
  fase: string;
  status: string;
  nf: string;
  embarcador: string;
  embarcadorCnpj: string;
  destinatario: string;
  codigoProduto: string;
  produto: string;
  unidade: string;
  qtdNF: number | null;
  qtdDivergencia: number | null;
  valor: number;
  transportadora: string;
  placa: string;
  local: string;
  descricao: string;
  resolucao: string;
}

const soDigitos = (s: string | null | undefined) => (s || "").replace(/\D/g, "");
const dataValida = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

/** Le embarcador, de, ate e tipos da query string. Sem tipos validos, usa
 *  Avaria + Falta (o recorte que os embarcadores pedem). */
export function lerFiltros(sp: URLSearchParams): FiltrosRelatorio {
  const raiz = soDigitos(sp.get("embarcador")).slice(0, 8);
  const tipos = (sp.get("tipos") || "")
    .split(",")
    .filter((t): t is TipoAvaria => t in TIPO_AVARIA_LABEL);
  return {
    embarcador: raiz.length === 8 ? raiz : null,
    de: dataValida(sp.get("de")),
    ate: dataValida(sp.get("ate")),
    tipos: tipos.length > 0 ? tipos : TIPOS_PADRAO,
  };
}

const NF_SELECT = { numero: true, emitenteRazao: true, emitenteCnpj: true, destinatarioRazao: true } as const;

/** Linhas do relatorio ja filtradas por periodo, tipo e embarcador, da
 *  ocorrencia mais recente para a mais antiga. */
export async function buscarLinhasRelatorio(f: FiltrosRelatorio): Promise<LinhaRelatorio[]> {
  // Pre-filtro no banco (largo); o corte exato por linha acontece abaixo.
  const and: Prisma.AvariaWhereInput[] = [
    { OR: [{ tipo: { in: f.tipos } }, { produtos: { some: { tipoDivergencia: { in: f.tipos } } } }] },
  ];
  if (f.embarcador) {
    const cnpj = { emitenteCnpj: { startsWith: f.embarcador } };
    and.push({
      OR: [
        { notaFiscal: cnpj },
        { produtos: { some: { notaFiscal: cnpj } } },
        { entrega: { notas: { some: cnpj } } },
      ],
    });
  }
  if (f.de || f.ate) {
    and.push({
      dataOcorrencia: {
        ...(f.de && { gte: new Date(`${f.de}T00:00:00.000Z`) }),
        ...(f.ate && { lte: new Date(`${f.ate}T23:59:59.999Z`) }),
      },
    });
  }

  const avarias = await prisma.avaria.findMany({
    where: { AND: and },
    orderBy: [{ dataOcorrencia: "desc" }, { codigo: "desc" }],
    select: {
      id: true, codigo: true, tipo: true, fase: true, status: true, dataOcorrencia: true,
      descricao: true, valorPrejuizo: true, localOcorrencia: true,
      transportadoraChegada: true, placaChegada: true, resolucao: true,
      notaFiscal: { select: NF_SELECT },
      entrega: { select: { veiculo: { select: { placa: true } }, notas: { select: NF_SELECT, take: 1 } } },
      produtos: {
        orderBy: { createdAt: "asc" },
        select: {
          codigoProduto: true, descricao: true, unidade: true, quantidadeNF: true,
          quantidadeAvaria: true, valorTotal: true, tipoDivergencia: true,
          notaFiscal: { select: NF_SELECT },
        },
      },
    },
  });

  const linhas: LinhaRelatorio[] = [];
  for (const a of avarias) {
    const nfDoRegistro = a.notaFiscal ?? a.entrega?.notas[0] ?? null;
    const comum = {
      avariaId: a.id,
      codigo: a.codigo,
      data: a.dataOcorrencia,
      fase: FASE_AVARIA_LABEL[a.fase] || a.fase,
      status: STATUS_AVARIA_LABEL[a.status] || a.status,
      transportadora: a.transportadoraChegada || "",
      placa: a.placaChegada || a.entrega?.veiculo?.placa || "",
      local: a.localOcorrencia || "",
      descricao: a.descricao || "",
      resolucao: a.resolucao || "",
    };
    // Registro sem produto vira uma linha so, com os campos de produto vazios.
    const itens = a.produtos.length > 0
      ? a.produtos.map((p) => ({ p, tipo: p.tipoDivergencia ?? a.tipo, nf: p.notaFiscal ?? nfDoRegistro }))
      : [{ p: null, tipo: a.tipo, nf: nfDoRegistro }];

    for (const { p, tipo, nf } of itens) {
      if (!f.tipos.includes(tipo)) continue;
      const cnpj = soDigitos(nf?.emitenteCnpj);
      if (f.embarcador && !cnpj.startsWith(f.embarcador)) continue;
      linhas.push({
        ...comum,
        tipo: TIPO_AVARIA_LABEL[tipo] || tipo,
        nf: nf?.numero || "",
        embarcador: nf?.emitenteRazao || "",
        embarcadorCnpj: cnpj,
        destinatario: nf?.destinatarioRazao || "",
        codigoProduto: p?.codigoProduto || "",
        produto: p?.descricao || "",
        unidade: p?.unidade || "",
        qtdNF: p ? p.quantidadeNF : null,
        qtdDivergencia: p ? p.quantidadeAvaria : null,
        valor: p ? p.valorTotal : a.valorPrejuizo,
      });
    }
  }
  return linhas;
}

export interface ResumoRelatorio {
  registros: number;
  porTipo: { tipo: string; linhas: number; quantidade: number; valor: number }[];
  valorTotal: number;
}

/** Totais para o cabecalho do PDF: registros distintos, quantidade e valor por tipo. */
export function resumirLinhas(linhas: LinhaRelatorio[]): ResumoRelatorio {
  const porTipo = new Map<string, { tipo: string; linhas: number; quantidade: number; valor: number }>();
  for (const l of linhas) {
    const t = porTipo.get(l.tipo) || { tipo: l.tipo, linhas: 0, quantidade: 0, valor: 0 };
    t.linhas += 1;
    t.quantidade += l.qtdDivergencia || 0;
    t.valor += l.valor;
    porTipo.set(l.tipo, t);
  }
  return {
    registros: new Set(linhas.map((l) => l.avariaId)).size,
    porTipo: Array.from(porTipo.values()),
    valorTotal: linhas.reduce((s, l) => s + l.valor, 0),
  };
}

/** Embarcadores que aparecem em algum registro, para o seletor do modal:
 *  raiz do CNPJ, nome mais recente e numero de registros. */
export async function listarEmbarcadoresDeAvarias(): Promise<{ raiz: string; nome: string; total: number }[]> {
  const linhas = await buscarLinhasRelatorio({
    embarcador: null, de: null, ate: null,
    tipos: Object.keys(TIPO_AVARIA_LABEL) as TipoAvaria[],
  });
  const porRaiz = new Map<string, { raiz: string; nome: string; avarias: Set<string> }>();
  for (const l of linhas) {
    const raiz = l.embarcadorCnpj.slice(0, 8);
    if (raiz.length !== 8) continue;
    // linhas vem da mais recente para a mais antiga: o primeiro nome visto e o atual
    const e = porRaiz.get(raiz) || { raiz, nome: l.embarcador, avarias: new Set<string>() };
    e.avarias.add(l.avariaId);
    porRaiz.set(raiz, e);
  }
  return Array.from(porRaiz.values())
    .map((e) => ({ raiz: e.raiz, nome: e.nome, total: e.avarias.size }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}
