import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { diasParados } from "@/lib/deposito";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

const parseDate = (s: string, isEnd = false) =>
  new Date(s.slice(0, 10) + (isEnd ? "T23:59:59.999Z" : "T00:00:00.000Z"));

const ROTULO_TIPO_ENTRADA: Record<string, string> = {
  DEVOLUCAO_TOTAL: "Devolução total",
  DEVOLUCAO_PARCIAL: "Devolução parcial",
  SOBRA: "Sobra",
  AVARIA: "Avaria",
  ARMAZENAGEM: "Armazenagem",
};

const ROTULO_MOTIVO_BAIXA: Record<string, string> = {
  REEXPEDIDO: "Reexpedido",
  DEVOLVIDO_EMBARCADOR: "Devolvido ao embarcador",
  RETIRADO_EMBARCADOR: "Retirado pelo embarcador",
  DESCARTE: "Descarte",
};

const ROTULO_TIPO_MOVIMENTO: Record<string, string> = {
  ENTRADA: "Entrada",
  AJUSTE: "Ajuste",
  BAIXA: "Baixa",
  ESTORNO: "Estorno",
};

// Norma do embarcador que cobra o relatório semanal: só o que ainda está no
// CD, e só devolução/sobra — avaria e armazenagem não entram nesse recorte.
const TIPOS_LUP = ["DEVOLUCAO_TOTAL", "DEVOLUCAO_PARCIAL", "SOBRA"];

export async function GET(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const dataInicio = searchParams.get("dataInicio");
  const dataFim = searchParams.get("dataFim");
  const embarcadorCnpj = searchParams.get("embarcadorCnpj");
  const transportadora = searchParams.get("transportadora");
  const status = searchParams.get("status");
  const tipoEntrada = searchParams.get("tipoEntrada");
  const preset = searchParams.get("preset");

  // preset=lup sobrepõe status e tipoEntrada individuais; os demais filtros
  // (embarcador, período) continuam valendo em cima dele.
  const whereItem: any = {};
  if (preset === "lup") {
    whereItem.status = "EM_ESTOQUE";
    whereItem.tipoEntrada = { in: TIPOS_LUP };
  } else {
    if (status) whereItem.status = status;
    if (tipoEntrada) whereItem.tipoEntrada = tipoEntrada;
  }
  if (embarcadorCnpj) whereItem.embarcadorCnpj = embarcadorCnpj;
  if (transportadora) whereItem.transportadora = { contains: transportadora, mode: "insensitive" };
  if (dataInicio || dataFim) {
    whereItem.dataEntrada = {};
    if (dataInicio) whereItem.dataEntrada.gte = parseDate(dataInicio);
    if (dataFim) whereItem.dataEntrada.lte = parseDate(dataFim, true);
  }

  const whereMov: any = {};
  if (embarcadorCnpj) whereMov.item = { embarcadorCnpj };
  if (dataInicio || dataFim) {
    whereMov.createdAt = {};
    if (dataInicio) whereMov.createdAt.gte = parseDate(dataInicio);
    if (dataFim) whereMov.createdAt.lte = parseDate(dataFim, true);
  }

  const [itens, movimentos] = await Promise.all([
    prisma.depositoItem.findMany({ where: whereItem, orderBy: { dataEntrada: "asc" } }),
    prisma.depositoMovimento.findMany({
      where: whereMov,
      orderBy: { createdAt: "asc" },
      include: {
        item: { select: { codigo: true, notaNumero: true, notaSerie: true, embarcadorRazao: true } },
        usuario: { select: { name: true } },
      },
    }),
  ]);

  const fmtData = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");

  const linhasItens = itens.map((it) => ({
    "Código": it.codigo,
    "NF": it.notaNumero || "",
    "Série": it.notaSerie || "",
    "Embarcador": it.embarcadorRazao,
    "CNPJ Embarcador": it.embarcadorCnpj,
    "Transportadora": it.transportadora || "",
    "Tipo de entrada": ROTULO_TIPO_ENTRADA[it.tipoEntrada] || it.tipoEntrada,
    "Descrição": it.descricao,
    "Volumes": it.volumes,
    "Saldo": it.volumes - it.volumesBaixados,
    "Peso (kg)": it.pesoKg,
    "Valor (R$)": it.valorMercadoria,
    "Localização": it.localizacao || "",
    "Data de entrada": fmtData(it.dataEntrada),
    "Dias parado": diasParados(it.dataEntrada, it.dataSaida),
    "Observações": it.observacoes || "",
  }));

  const linhasMovimentos = movimentos.map((m) => ({
    "Data": fmtData(m.createdAt),
    "Código do item": m.item.codigo,
    "NF": m.item.notaNumero ? `${m.item.notaNumero}${m.item.notaSerie ? "/" + m.item.notaSerie : ""}` : "",
    "Embarcador": m.item.embarcadorRazao,
    "Tipo": ROTULO_TIPO_MOVIMENTO[m.tipo] || m.tipo,
    "Motivo": m.motivo ? ROTULO_MOTIVO_BAIXA[m.motivo] || m.motivo : "",
    "Volumes": m.volumes,
    "Documento": m.documento || "",
    "Responsável": m.responsavel || "",
    "Usuário": m.usuario?.name || "",
  }));

  const wsItens = XLSX.utils.json_to_sheet(linhasItens);
  wsItens["!cols"] = [
    { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 26 }, { wch: 18 }, { wch: 22 }, { wch: 16 },
    { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 18 },
    { wch: 14 }, { wch: 12 }, { wch: 26 },
  ];

  const wsMovimentos = XLSX.utils.json_to_sheet(linhasMovimentos);
  wsMovimentos["!cols"] = [
    { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 26 }, { wch: 10 }, { wch: 18 },
    { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsItens, "NF Paradas");
  XLSX.utils.book_append_sheet(wb, wsMovimentos, "Movimentação do período");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const hoje = new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="deposito_nf_paradas_${hoje}.xlsx"`,
    },
  });
}
