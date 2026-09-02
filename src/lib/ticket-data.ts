// Montagem server-side dos valores padrão da Solicitação de Ticket.
//
// Ponte entre o banco e as funções puras de ticket-calc: lê a entrega, a
// TabelaTicket do embarcador e as tabelas já existentes de descarga e
// armazenagem, e devolve tudo pré-calculado para o modal.

import { prisma } from "@/lib/prisma";
import { calcularDescarga } from "@/lib/descarga-calc";
import { TIPO_VEICULO_LABELS } from "@/lib/utils";
import {
  ALIQUOTAS_PADRAO,
  TIPO_TICKET_LABELS,
  calcularArmazenagemTicket,
  calcularDescargaTicket,
  calcularDiaria,
  calcularPaletizacao,
  calcularReentrega,
  type Aliquotas,
  type TipoTicket,
} from "@/lib/ticket-calc";

const MS_POR_DIA = 1000 * 60 * 60 * 24;

function dataBr(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export type SugestaoTipo = {
  tipo: TipoTicket;
  label: string;
  valor: number;
  observacoes: string;
  semTabela: boolean;
  detalhe: string;
  // Só em DESCARGA: permite ao modal recalcular os impostos ao vivo.
  valorBase?: number;
};

export type DefaultsTicket = {
  entregaId: string;
  embarcadores: { cnpj: string; nome: string }[];
  embarcadorCnpj: string;
  embarcadorNome: string;
  temTabela: boolean;
  aliquotas: Aliquotas;
  destinatarios: { para: string; copia: string; assunto: string; intro: string; assinatura: string };
  campos: {
    dataSolicitacao: string;
    transportador: string;
    cliente: string;
    localidade: string;
    notasFiscais: string;
    dataAgenda: string;
    cte: string;
    perfilVeiculo: string;
    placaVeiculo: string;
    volumes: string;
  };
  sugestoes: SugestaoTipo[];
};

export async function montarDefaultsTicket(
  entregaId: string,
  embarcadorCnpjPreferido?: string | null,
): Promise<DefaultsTicket | null> {
  const entrega = await prisma.entrega.findUnique({
    where: { id: entregaId },
    include: {
      veiculo: { select: { placa: true, tipo: true } },
      notas: {
        select: {
          numero: true,
          emitenteCnpj: true,
          emitenteRazao: true,
          cte: { select: { numero: true } },
        },
      },
    },
  });
  if (!entrega) return null;

  // O EMBARCADOR é o emitente da NF (ex: Unicharm) — não confundir com
  // entrega.cnpj, que é o destinatário da carga.
  const mapaEmb = new Map<string, string>();
  for (const n of entrega.notas) {
    const cnpj = (n.emitenteCnpj || "").replace(/\D/g, "");
    if (cnpj && !mapaEmb.has(cnpj)) mapaEmb.set(cnpj, n.emitenteRazao || cnpj);
  }
  const embarcadores = Array.from(mapaEmb, ([cnpj, nome]) => ({ cnpj, nome }));

  const escolhido = (embarcadorCnpjPreferido || "").replace(/\D/g, "");
  const embarcador =
    embarcadores.find((e) => e.cnpj === escolhido) || embarcadores[0] || { cnpj: "", nome: "" };

  const tabela = embarcador.cnpj
    ? await prisma.tabelaTicket.findUnique({ where: { cnpjEmbarcador: embarcador.cnpj } })
    : null;

  const aliquotas: Aliquotas = tabela
    ? {
        irpj: tabela.aliqIrpj,
        csll: tabela.aliqCsll,
        cofins: tabela.aliqCofins,
        pis: tabela.aliqPis,
        iss: tabela.aliqIss,
      }
    : ALIQUOTAS_PADRAO;

  // Um CT-e cobre várias entregas e não há FK direta: chega-se nele pelas notas.
  const ctes = Array.from(
    new Set(entrega.notas.map((n) => n.cte?.numero).filter(Boolean) as string[]),
  ).join(", ");

  const cliente = entrega.razaoSocial || "";
  const nfs = entrega.notas.map((n) => n.numero).join(", ");

  // ── Sugestões por tipo ────────────────────────────────────────────────
  const sugestoes: SugestaoTipo[] = [];

  const pal = calcularPaletizacao(entrega.quantidadePaletes || 0, tabela?.valorPalete || 0);
  sugestoes.push({
    tipo: "PALETIZACAO",
    label: TIPO_TICKET_LABELS.PALETIZACAO,
    valor: pal.valor,
    observacoes: pal.observacoes,
    semTabela: pal.semTabela,
    detalhe: `${entrega.quantidadePaletes || 0} palete(s) × R$ ${(tabela?.valorPalete || 0).toFixed(2)}`,
  });

  // Descarga: respeita o valor já gravado na entrega; senão usa a TabelaDescarga.
  let baseDescarga = entrega.valorDescarga || 0;
  let detalheDescarga = "valor gravado na entrega";
  if (baseDescarga <= 0) {
    const calc = await calcularDescarga({
      cnpj: entrega.cnpj,
      quantidadePaletes: entrega.quantidadePaletes,
      veiculoId: entrega.veiculoId,
    });
    baseDescarga = calc.valor;
    detalheDescarga = calc.detalhe;
  }
  const desc = calcularDescargaTicket(baseDescarga, aliquotas);
  sugestoes.push({
    tipo: "DESCARGA",
    label: TIPO_TICKET_LABELS.DESCARGA,
    valor: desc.total,
    valorBase: desc.base,
    observacoes: "",
    semTabela: baseDescarga <= 0,
    detalhe: detalheDescarga,
  });

  const dia = calcularDiaria(entrega.veiculo?.tipo, {
    diariaVuc: tabela?.diariaVuc || 0,
    diariaTresQuartos: tabela?.diariaTresQuartos || 0,
    diariaToco: tabela?.diariaToco || 0,
    diariaTruck: tabela?.diariaTruck || 0,
    diariaCarreta: tabela?.diariaCarreta || 0,
    diariaBitruck: tabela?.diariaBitruck || 0,
    diariaUtilitario: tabela?.diariaUtilitario || 0,
  });
  sugestoes.push({
    tipo: "DIARIA",
    label: TIPO_TICKET_LABELS.DIARIA,
    valor: dia.valor,
    observacoes: dia.observacoes,
    semTabela: dia.semTabela,
    detalhe: entrega.veiculo?.tipo
      ? `perfil ${TIPO_VEICULO_LABELS[entrega.veiculo.tipo] ?? entrega.veiculo.tipo}`
      : "entrega sem veículo alocado",
  });

  const pctReentrega = tabela?.percentualReentrega ?? 80;
  const ree = calcularReentrega(entrega.valorFrete || 0, pctReentrega);
  sugestoes.push({
    tipo: "REENTREGA",
    label: TIPO_TICKET_LABELS.REENTREGA,
    valor: ree.valor,
    observacoes: ree.observacoes,
    semTabela: (entrega.valorFrete || 0) <= 0,
    detalhe: `${pctReentrega}% de R$ ${(entrega.valorFrete || 0).toFixed(2)} (frete da entrega)`,
  });

  // Armazenagem: mesma regra do bloco armazenagemCalc de /api/entregas/[id].
  let arm = { valor: entrega.valorArmazenagem || 0, observacoes: "", semTabela: true, detalhe: "" };
  if (embarcador.cnpj) {
    const tArm = await prisma.tabelaArmazenagem.findUnique({ where: { cnpjCliente: embarcador.cnpj } });
    if (tArm) {
      const entrada = new Date(entrega.dataChegada || entrega.createdAt);
      entrada.setHours(0, 0, 0, 0);
      const saida = new Date(entrega.dataEntrega || new Date());
      saida.setHours(0, 0, 0, 0);
      const dias = Math.max(0, Math.floor((saida.getTime() - entrada.getTime()) / MS_POR_DIA));
      const r = calcularArmazenagemTicket({
        dias,
        diasFree: tArm.diasFree || 0,
        valorPaleteDia: tArm.valorPaleteDia || 0,
        paletes: entrega.quantidadePaletes || 0,
      });
      arm = {
        valor: r.valor,
        observacoes: r.observacoes,
        semTabela: r.semTabela,
        detalhe: `${dias} dia(s) armazenado(s), ${tArm.diasFree} free × R$ ${tArm.valorPaleteDia.toFixed(2)}/palete/dia`,
      };
    } else {
      arm.detalhe = "sem tabela de armazenagem para este embarcador";
    }
  }
  sugestoes.push({
    tipo: "ARMAZENAGEM",
    label: TIPO_TICKET_LABELS.ARMAZENAGEM,
    valor: arm.valor,
    observacoes: arm.observacoes,
    semTabela: arm.semTabela,
    detalhe: arm.detalhe,
  });

  const assunto = (tabela?.assuntoModelo || "SOLICITAÇÃO DE TICKET - NF {NF}")
    .replace(/\{CLIENTE\}/g, cliente)
    .replace(/\{NF\}/g, nfs)
    .replace(/\{DATA\}/g, dataBr(new Date()));

  return {
    entregaId: entrega.id,
    embarcadores,
    embarcadorCnpj: embarcador.cnpj,
    embarcadorNome: embarcador.nome,
    temTabela: !!tabela,
    aliquotas,
    destinatarios: {
      para: tabela?.emailsPara || "",
      copia: tabela?.emailsCopia || "",
      assunto,
      intro: tabela?.textoIntro || "",
      assinatura: tabela?.textoAssinatura || "",
    },
    campos: {
      dataSolicitacao: dataBr(new Date()),
      transportador: "MAGNA LOG",
      cliente,
      localidade: [entrega.cidade, entrega.uf].filter(Boolean).join(" - "),
      notasFiscais: nfs,
      dataAgenda: dataBr(entrega.dataAgendada),
      cte: ctes,
      perfilVeiculo: entrega.veiculo?.tipo
        ? (TIPO_VEICULO_LABELS[entrega.veiculo.tipo] ?? entrega.veiculo.tipo).toUpperCase()
        : "",
      placaVeiculo: entrega.veiculo?.placa || "",
      volumes: String(entrega.volumeTotal || 0),
    },
    sugestoes,
  };
}
