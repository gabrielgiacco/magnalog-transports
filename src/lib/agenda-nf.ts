import type { TipoVeiculo } from "@prisma/client";
import { getCapacidadesPadrao, TIPO_LABEL } from "@/lib/veiculo-capacidades";

/**
 * Puro — sem Prisma, sem I/O. Precisa ser importavel de componente client
 * (ex.: SepararPorAgendaModal), entao nada aqui pode importar @/lib/prisma
 * nem @prisma/client como valor (so `import type`).
 */

/** Cubagem em m³ escrita nos dados adicionais ("M3: 16,320"). Fonte unica —
 *  entrega-carga.ts importa daqui. */
export const M3_REGEX = /M\s*[3³]\s*:?\s*(\d+(?:[.,]\d+)?)/i;

/** Data depois de "agendamento ... data:" nos dados adicionais da NF. Casa as
 *  duas grafias observadas nas NFs da Softys: "agendamento-> data:" e
 *  "agendamento /carga paletizada d... data:". */
const AGENDAMENTO_REGEX = /agendamento[^0-9]{0,40}?(\d{2})\/(\d{2})\/(\d{2,4})/i;

export function extrairM3(infCpl: string | null | undefined): number | null {
  if (!infCpl) return null;
  const match = infCpl.match(M3_REGEX);
  if (!match) return null;
  const num = parseFloat(match[1].replace(",", "."));
  if (isNaN(num) || num <= 0) return null;
  return num;
}

/** "YYYY-MM-DD" da data depois de "agendamento ... data:", ou null. Ano de 2
 *  digitos vira 20xx. */
export function extrairDataAgendamento(infCpl: string | null | undefined): string | null {
  if (!infCpl) return null;
  const match = infCpl.match(AGENDAMENTO_REGEX);
  if (!match) return null;
  const [, dia, mes, anoBruto] = match;
  const diaNum = parseInt(dia, 10);
  const mesNum = parseInt(mes, 10);
  if (diaNum < 1 || diaNum > 31 || mesNum < 1 || mesNum > 12) return null;
  const ano = anoBruto.length === 2 ? `20${anoBruto}` : anoBruto;
  return `${ano}-${mes}-${dia}`;
}

function arredondar3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Menor tipo de veiculo cuja capacidade padrao em m³ comporta a carga, ou
 *  null se nenhum comporta. */
function sugerirVeiculo(m3: number): TipoVeiculo | null {
  const tipos = (Object.keys(TIPO_LABEL) as TipoVeiculo[]).slice()
    .sort((a, b) => getCapacidadesPadrao(a).m3 - getCapacidadesPadrao(b).m3);
  for (const tipo of tipos) {
    if (getCapacidadesPadrao(tipo).m3 >= m3) return tipo;
  }
  return null;
}

export interface NotaParaAgenda {
  id: string;
  numero: string;
  infAdicionais: string;
  pesoBruto: number;
  volumes: number;
}

export interface GrupoAgenda {
  data: string | null; // null = sem agendamento (fica na entrega original)
  notas: { id: string; numero: string; m3: number | null }[];
  m3: number;
  pesoTotal: number;
  volumeTotal: number;
  veiculoSugerido: TipoVeiculo | null;
}

function montarGrupo(data: string | null, notas: NotaParaAgenda[]): GrupoAgenda {
  const notasGrupo = notas.map((n) => ({ id: n.id, numero: n.numero, m3: extrairM3(n.infAdicionais) }));
  const m3 = arredondar3(notasGrupo.reduce((s, n) => s + (n.m3 || 0), 0));
  const pesoTotal = arredondar3(notas.reduce((s, n) => s + (n.pesoBruto || 0), 0));
  const volumeTotal = notas.reduce((s, n) => s + (n.volumes || 0), 0);
  return { data, notas: notasGrupo, m3, pesoTotal, volumeTotal, veiculoSugerido: sugerirVeiculo(m3) };
}

/** Agrupa as notas de uma entrega pela data de agendamento escrita nos dados
 *  adicionais. Notas sem essa data caem em `semData` (ficam como estao). */
export function agruparPorAgenda(notas: NotaParaAgenda[]): { grupos: GrupoAgenda[]; semData: GrupoAgenda | null } {
  const porData = new Map<string, NotaParaAgenda[]>();
  const semDataNotas: NotaParaAgenda[] = [];

  for (const nota of notas) {
    const data = extrairDataAgendamento(nota.infAdicionais);
    if (data) {
      const lista = porData.get(data) || [];
      lista.push(nota);
      porData.set(data, lista);
    } else {
      semDataNotas.push(nota);
    }
  }

  const grupos = Array.from(porData.entries())
    .map(([data, lista]) => montarGrupo(data, lista))
    .sort((a, b) => (a.data! < b.data! ? -1 : a.data! > b.data! ? 1 : 0));

  const semData = semDataNotas.length > 0 ? montarGrupo(null, semDataNotas) : null;

  return { grupos, semData };
}
