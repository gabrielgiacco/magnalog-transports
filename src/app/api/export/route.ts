import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

function toCSV(rows: Record<string, any>[], headers: { key: string; label: string }[]): string {
  const sep = ";";
  const header = headers.map(h => `"${h.label}"`).join(sep);
  const lines = rows.map(row =>
    headers.map(h => {
      const v = row[h.key];
      if (v === null || v === undefined) return '""';
      if (typeof v === "number") return String(v).replace(".", ",");
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(sep)
  );
  return "\uFEFF" + [header, ...lines].join("\r\n"); // BOM for Excel
}

export async function GET(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo") || "entregas";
  const status = searchParams.get("status");
  const dataInicio = searchParams.get("dataInicio");
  const dataFim = searchParams.get("dataFim");

  const where: any = {};
  if (status) where.status = status;
  if (dataInicio || dataFim) {
    where.createdAt = {};
    if (dataInicio) where.createdAt.gte = new Date(dataInicio);
    if (dataFim) where.createdAt.lte = new Date(dataFim);
  }

  const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString("pt-BR") : "";
  const fmtNum = (n: number) => (n ?? 0).toFixed(2);

  if (tipo === "entregas") {
    const entregas = await prisma.entrega.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        motorista: { select: { nome: true } },
        veiculo: { select: { placa: true, tipo: true } },
        rota: { select: { codigo: true } },
        notas: { select: { numero: true } },
        _count: { select: { notas: true } },
      },
    });

    const rows = entregas.map((e: any) => ({
      nf: e.notas && e.notas.length > 0 ? e.notas.map((n: any) => n.numero).join(", ") : e.codigo,
      cnpj: e.cnpj,
      razaoSocial: e.razaoSocial,
      cidade: e.cidade,
      uf: e.uf || "",
      status: e.status,
      notas: e._count.notas,
      pesoTotal: fmtNum(e.pesoTotal),
      volumeTotal: e.volumeTotal,
      valorFrete: fmtNum(e.valorFrete),
      valorDescarga: fmtNum(e.valorDescarga),
      valorArmazenagem: fmtNum(e.valorArmazenagem),
      adiantamento: fmtNum(e.adiantamento),
      saldoPendente: fmtNum(e.saldoPendente),
      motorista: e.motorista?.nome || "",
      veiculo: e.veiculo ? `${e.veiculo.placa} (${e.veiculo.tipo})` : "",
      rota: e.rota?.codigo || "",
      dataChegada: fmtDate(e.dataChegada),
      dataAgendada: fmtDate(e.dataAgendada),
      dataEntrega: fmtDate(e.dataEntrega),
      dataPagamento: fmtDate(e.dataPagamento),
      observacoes: e.observacoes || "",
      criadoEm: fmtDate(e.createdAt),
    }));

    const headers = [
      { key: "nf",              label: "NF" },
      { key: "cnpj",            label: "CNPJ" },
      { key: "razaoSocial",     label: "Razão Social" },
      { key: "cidade",          label: "Cidade" },
      { key: "uf",              label: "UF" },
      { key: "status",          label: "Status" },
      { key: "notas",           label: "Qtd NFs" },
      { key: "pesoTotal",       label: "Peso (kg)" },
      { key: "volumeTotal",     label: "Volumes" },
      { key: "valorFrete",      label: "Valor Frete" },
      { key: "valorDescarga",   label: "Descarga" },
      { key: "valorArmazenagem",label: "Armazenagem" },
      { key: "adiantamento",    label: "Adiantamento" },
      { key: "saldoPendente",   label: "Saldo Pendente" },
      { key: "motorista",       label: "Motorista" },
      { key: "veiculo",         label: "Veículo" },
      { key: "rota",            label: "Rota" },
      { key: "dataChegada",     label: "Data Chegada" },
      { key: "dataAgendada",    label: "Data Agendada" },
      { key: "dataEntrega",     label: "Data Entrega" },
      { key: "dataPagamento",   label: "Data Pagamento" },
      { key: "observacoes",     label: "Observações" },
      { key: "criadoEm",        label: "Criado Em" },
    ];

    const csv = toCSV(rows, headers);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="entregas_${new Date().toISOString().slice(0,10)}.csv"`,
      },
    });
  }

  if (tipo === "notas") {
    const notas = await prisma.notaFiscal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { entrega: { select: { codigo: true, status: true, notas: { select: { numero: true } } } } },
    });

    const rows = notas.map((n: any) => ({
      numero: n.numero,
      serie: n.serie || "",
      chaveAcesso: n.chaveAcesso,
      emitenteCnpj: n.emitenteCnpj,
      emitenteRazao: n.emitenteRazao,
      destinatarioCnpj: n.destinatarioCnpj,
      destinatarioRazao: n.destinatarioRazao,
      cidade: n.cidade || "",
      uf: n.uf || "",
      volumes: n.volumes,
      pesoBruto: fmtNum(n.pesoBruto),
      valorNota: fmtNum(n.valorNota),
      dataEmissao: fmtDate(n.dataEmissao),
      entrega: n.entrega ? (n.entrega.notas?.length > 0 ? n.entrega.notas.map((nt: any) => nt.numero).join(", ") : n.entrega.codigo) : "",
      statusEntrega: n.entrega?.status || "",
    }));

    const headers = [
      { key: "numero",            label: "Número NF" },
      { key: "serie",             label: "Série" },
      { key: "chaveAcesso",       label: "Chave Acesso" },
      { key: "emitenteCnpj",      label: "CNPJ Emitente" },
      { key: "emitenteRazao",     label: "Emitente" },
      { key: "destinatarioCnpj",  label: "CNPJ Destinatário" },
      { key: "destinatarioRazao", label: "Destinatário" },
      { key: "cidade",            label: "Cidade" },
      { key: "uf",                label: "UF" },
      { key: "volumes",           label: "Volumes" },
      { key: "pesoBruto",         label: "Peso Bruto (kg)" },
      { key: "valorNota",         label: "Valor NF" },
      { key: "dataEmissao",       label: "Data Emissão" },
      { key: "entrega",           label: "NF Referência" },
      { key: "statusEntrega",     label: "Status Entrega" },
    ];

    const csv = toCSV(rows, headers);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="notas_fiscais_${new Date().toISOString().slice(0,10)}.csv"`,
      },
    });
  }

  return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
}
