import { PrismaClient, TipoEntradaDeposito } from "@prisma/client";
import { resolverEmbarcadores } from "@/lib/deposito-embarcador";

// Candidatos a entrada automática no Depósito: três origens mutuamente
// exclusivas por construção (cada query já exclui o que a outra cobre, então
// a mesma NF/avaria/NFD nunca aparece duas vezes). Módulo único porque
// candidatos/route.ts, resumo/route.ts (candidatosPendentes) e
// importar/route.ts (reconstrução do snapshot a partir do refId) têm de
// enxergar exatamente os mesmos critérios — repetir where aqui e ali é como
// eles saem de sincronia.
//
// Não existe candidato automático para ARMAZENAGEM: essa consulta seria todo
// o backlog de armazenagem, já coberto em outra tela. Armazenagem só entra
// manual.

export type OrigemCandidato = "NOTA_DEVOLUCAO" | "AVARIA" | "ENTREGA";

export interface CandidatoDeposito {
  origem: OrigemCandidato;
  refId: string;
  referencia: string;
  descricao: string;
  embarcadorCnpj: string;
  embarcadorRazao: string;
  // true quando resolverEmbarcadores não achou nenhum CNPJ candidato (ex.:
  // avaria sem NF linkada) — os campos acima ficam vazios e a tela tem de
  // exigir o preenchimento antes de liberar a importação.
  embarcadorIncerto: boolean;
  // Quem trouxe a mercadoria de volta ao deposito. So existe nas origens
  // ligadas a avaria (AVARIA e NOTA_DEVOLUCAO, via a avaria-pai); ENTREGA nao
  // tem esse dado.
  transportadora: string | null;
  notaNumero: string | null;
  notaSerie: string | null;
  notaChave: string | null;
  volumes: number;
  pesoKg: number;
  valorMercadoria: number;
  dataSugerida: Date;
  tipoEntradaSugerido: TipoEntradaDeposito;
  detalhe: string;
  avariaId: string | null;
  entregaId: string | null;
  notaFiscalId: string | null;
  ocorrenciaId: string | null;
}

const SELECT_NFD = {
  id: true, numero: true, serie: true, chaveAcesso: true, valorNota: true,
  emitenteCnpj: true, emitenteRazao: true, destinatarioCnpj: true, destinatarioRazao: true,
  dataEmissao: true, createdAt: true,
  avaria: { select: { id: true, codigo: true, tipo: true, dataChegada: true, transportadoraChegada: true } },
};

// Nota: INCLUDE_AVARIA usa "include", nao "select" — os escalares da propria
// Avaria (como transportadoraChegada) ja vem todos por padrao, sem precisar
// listar aqui.
const INCLUDE_AVARIA = {
  produtos: { select: { descricao: true, quantidadeAvaria: true, valorTotal: true } },
  notaFiscal: { select: { id: true, numero: true, serie: true, chaveAcesso: true, emitenteCnpj: true, emitenteRazao: true, destinatarioCnpj: true, destinatarioRazao: true, volumes: true, pesoBruto: true, valorNota: true } },
  entrega: { select: { id: true, codigo: true, razaoSocial: true, dataChegada: true, notas: { take: 1, select: { id: true, numero: true, emitenteCnpj: true, emitenteRazao: true, destinatarioCnpj: true } } } },
};

const SELECT_NF_OCORRENCIA = {
  id: true, numero: true, serie: true, chaveAcesso: true, emitenteCnpj: true, emitenteRazao: true,
  destinatarioCnpj: true, destinatarioRazao: true, volumes: true, pesoBruto: true, valorNota: true,
  entrega: {
    select: {
      id: true, codigo: true, razaoSocial: true, status: true, dataChegada: true,
      ocorrencias: { where: { resolvida: false }, orderBy: { createdAt: "desc" as const }, take: 1, select: { id: true, tipo: true, descricao: true } },
    },
  },
};

const WHERE_NFD_PENDENTE = { status: "PENDENTE" as const, depositoItem: { is: null } };

// Nota: notIn RESOLVIDA/DESCARTADA — /declaracoes-saida/selecionaveis usa
// "not: RESOLVIDA" e por isso ainda oferece avaria descartada. Não repetir
// esse bug aqui.
function whereAvariasAbertas(usados: string[]) {
  return { status: { notIn: ["RESOLVIDA", "DESCARTADA"] as const }, devolucoes: { none: {} }, id: { notIn: usados } };
}

const WHERE_NF_OCORRENCIA = {
  cancelada: false,
  depositoItens: { none: {} },
  entrega: { is: { OR: [{ status: "OCORRENCIA" as const }, { ocorrencias: { some: { resolvida: false } } }] } },
};

async function idsAvariasUsadas(prisma: PrismaClient): Promise<string[]> {
  const usados = await prisma.depositoItem.findMany({ where: { avariaId: { not: null } }, select: { avariaId: true } });
  return usados.map((u) => u.avariaId!);
}

/**
 * Contagem pura das três origens — usada pelo resumo (candidatosPendentes).
 * Mesmos where de buscarCandidatos: qualquer mudança de critério tem de
 * mudar os dois juntos.
 */
export async function contarCandidatos(prisma: PrismaClient): Promise<{ NOTA_DEVOLUCAO: number; AVARIA: number; ENTREGA: number }> {
  const usados = await idsAvariasUsadas(prisma);
  const [nfd, avaria, nf] = await Promise.all([
    prisma.notaDevolucao.count({ where: WHERE_NFD_PENDENTE }),
    prisma.avaria.count({ where: whereAvariasAbertas(usados) as any }),
    prisma.notaFiscal.count({ where: WHERE_NF_OCORRENCIA as any }),
  ]);
  return { NOTA_DEVOLUCAO: nfd, AVARIA: avaria, ENTREGA: nf };
}

/**
 * Busca as três origens pendentes de entrada, já normalizadas. `take` vale
 * por origem, não no total (300 candidatos podem virar 900 linhas).
 */
export async function buscarCandidatos(prisma: PrismaClient, take: number): Promise<CandidatoDeposito[]> {
  const usados = await idsAvariasUsadas(prisma);
  const [devolucoes, avarias, notas] = await Promise.all([
    prisma.notaDevolucao.findMany({ where: WHERE_NFD_PENDENTE, orderBy: { createdAt: "desc" }, take, select: SELECT_NFD }),
    prisma.avaria.findMany({ where: whereAvariasAbertas(usados) as any, orderBy: { dataOcorrencia: "desc" }, take, include: INCLUDE_AVARIA }),
    prisma.notaFiscal.findMany({ where: WHERE_NF_OCORRENCIA as any, orderBy: { updatedAt: "desc" }, take, select: SELECT_NF_OCORRENCIA }),
  ]);
  return montarCandidatos(prisma, devolucoes as any[], avarias as any[], notas as any[]);
}

/**
 * Busca por id explícito — usada pela importação para reconstruir o snapshot
 * a partir só do refId que o cliente mandou (nunca dos dados de identidade).
 */
export async function buscarCandidatosPorId(
  prisma: PrismaClient,
  ids: { notaDevolucaoIds: string[]; avariaIds: string[]; notaFiscalIds: string[] },
): Promise<CandidatoDeposito[]> {
  const [devolucoes, avarias, notas] = await Promise.all([
    ids.notaDevolucaoIds.length
      ? prisma.notaDevolucao.findMany({ where: { id: { in: ids.notaDevolucaoIds } }, select: SELECT_NFD })
      : [],
    ids.avariaIds.length
      ? prisma.avaria.findMany({ where: { id: { in: ids.avariaIds } }, include: INCLUDE_AVARIA })
      : [],
    ids.notaFiscalIds.length
      ? prisma.notaFiscal.findMany({ where: { id: { in: ids.notaFiscalIds } }, select: SELECT_NF_OCORRENCIA })
      : [],
  ]);
  return montarCandidatos(prisma, devolucoes as any[], avarias as any[], notas as any[]);
}

async function montarCandidatos(
  prisma: PrismaClient,
  devolucoes: any[],
  avarias: any[],
  notas: any[],
): Promise<CandidatoDeposito[]> {
  // resolverEmbarcadores em lote pro conjunto inteiro — nunca por linha.
  const pares = [
    ...devolucoes.map((d) => ({ chave: `ND:${d.id}`, cnpjA: d.destinatarioCnpj, razaoA: d.destinatarioRazao, cnpjB: d.emitenteCnpj, razaoB: d.emitenteRazao })),
    ...avarias.map((a) => {
      const nf = a.notaFiscal ?? a.entrega?.notas?.[0] ?? null;
      return { chave: `AV:${a.id}`, cnpjA: nf?.emitenteCnpj ?? null, razaoA: nf?.emitenteRazao ?? null, cnpjB: nf?.destinatarioCnpj ?? null, razaoB: null };
    }),
    ...notas.map((n) => ({ chave: `NF:${n.id}`, cnpjA: n.emitenteCnpj, razaoA: n.emitenteRazao, cnpjB: n.destinatarioCnpj, razaoB: n.destinatarioRazao })),
  ];
  const embarcadores = await resolverEmbarcadores(prisma, pares);
  const resolver = (chave: string) => embarcadores.get(chave) ?? { cnpj: "", razao: "" };

  const candDevolucoes: CandidatoDeposito[] = devolucoes.map((d) => {
    const emb = resolver(`ND:${d.id}`);
    return {
      origem: "NOTA_DEVOLUCAO", refId: d.id, referencia: `NF ${d.numero}`,
      descricao: d.avaria ? `Devolução vinculada à avaria ${d.avaria.codigo} (${d.avaria.tipo})` : "Devolução de mercadoria",
      embarcadorCnpj: emb.cnpj, embarcadorRazao: emb.razao, embarcadorIncerto: !emb.cnpj,
      transportadora: d.avaria?.transportadoraChegada ?? null,
      notaNumero: d.numero, notaSerie: d.serie, notaChave: d.chaveAcesso,
      // NotaDevolucao nao tem linhas de produto, so valorNota — nao da para
      // deduzir volume. 1 e o minimo honesto ("voltou pelo menos um volume")
      // e deixa a importacao em lote utilizavel; o conferente corrige na
      // hora de importar.
      volumes: 1, pesoKg: 0, valorMercadoria: d.valorNota || 0,
      dataSugerida: d.avaria?.dataChegada ?? d.dataEmissao ?? d.createdAt,
      tipoEntradaSugerido: "DEVOLUCAO_TOTAL",
      detalhe: d.avaria ? `${d.avaria.tipo} · Avaria ${d.avaria.codigo}` : "",
      avariaId: d.avaria?.id ?? null, entregaId: null, notaFiscalId: null, ocorrenciaId: null,
    };
  });

  const candAvarias: CandidatoDeposito[] = avarias.map((a) => {
    // A NF mora em três lugares, nesta ordem: notaFiscal -> entrega.notas[0]
    // -> nada. O select de entrega.notas é mais enxuto (sem série/chave),
    // mas carrega id — o fallback também linka notaFiscalId.
    const nfCompleta = a.notaFiscal;
    const nfParcial = a.entrega?.notas?.[0];
    const emb = resolver(`AV:${a.id}`);
    const descricaoProdutos = a.produtos.map((p: any) => p.descricao).filter(Boolean).join(", ");
    const volumesProdutos = Math.round(a.produtos.reduce((s: number, p: any) => s + (p.quantidadeAvaria || 0), 0));
    const valorProdutos = a.produtos.reduce((s: number, p: any) => s + (p.valorTotal || 0), 0);
    return {
      origem: "AVARIA", refId: a.id, referencia: a.codigo,
      descricao: descricaoProdutos || a.descricao,
      embarcadorCnpj: emb.cnpj, embarcadorRazao: emb.razao, embarcadorIncerto: !emb.cnpj,
      transportadora: a.transportadoraChegada ?? null,
      notaNumero: nfCompleta?.numero ?? nfParcial?.numero ?? null,
      notaSerie: nfCompleta?.serie ?? null,
      notaChave: nfCompleta?.chaveAcesso ?? null,
      volumes: volumesProdutos || nfCompleta?.volumes || 0,
      pesoKg: nfCompleta?.pesoBruto ?? 0,
      valorMercadoria: valorProdutos || a.valorPrejuizo || 0,
      dataSugerida: a.dataChegada ?? a.dataOcorrencia,
      tipoEntradaSugerido: "AVARIA",
      detalhe: a.entrega?.razaoSocial || a.tipo,
      avariaId: a.id, entregaId: a.entrega?.id ?? null, notaFiscalId: nfCompleta?.id ?? nfParcial?.id ?? null, ocorrenciaId: null,
    };
  });

  const candNotas: CandidatoDeposito[] = notas.map((n) => {
    const emb = resolver(`NF:${n.id}`);
    const oc = n.entrega?.ocorrencias?.[0];
    return {
      origem: "ENTREGA", refId: n.id, referencia: `NF ${n.numero}`,
      descricao: oc ? `${oc.tipo} — ${oc.descricao}` : `NF ${n.numero} em entrega com ocorrência`,
      embarcadorCnpj: emb.cnpj, embarcadorRazao: emb.razao, embarcadorIncerto: !emb.cnpj,
      transportadora: null, // ENTREGA nao tem avaria — sem transportadora de retorno
      notaNumero: n.numero, notaSerie: n.serie, notaChave: n.chaveAcesso,
      volumes: n.volumes, pesoKg: n.pesoBruto, valorMercadoria: n.valorNota,
      dataSugerida: n.entrega?.dataChegada ?? new Date(),
      tipoEntradaSugerido: "DEVOLUCAO_TOTAL",
      detalhe: oc ? oc.tipo : n.entrega?.status ?? "",
      avariaId: null, entregaId: n.entrega?.id ?? null, notaFiscalId: n.id, ocorrenciaId: oc?.id ?? null,
    };
  });

  return [...candDevolucoes, ...candAvarias, ...candNotas];
}
