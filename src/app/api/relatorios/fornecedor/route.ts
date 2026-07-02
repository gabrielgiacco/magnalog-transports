import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAcesso() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Não autorizado", status: 401 };
  const role = (session.user as any).role;
  if (!["ADMIN", "FINANCEIRO", "OPERACIONAL"].includes(role)) {
    return { error: "Acesso negado", status: 403 };
  }
  return { session };
}

/**
 * Classifica a NF pelo estado atual da entrega.
 */
function classificarTipo(entrega: any | null): "SEM_ENTREGA" | "ENTREGUE" | "REENTREGA" | "ARMAZENADA" | "OCORRENCIA" {
  if (!entrega) return "SEM_ENTREGA";
  const isReentrega = /-R\d+/i.test(entrega.codigo || "");
  if (entrega.status === "OCORRENCIA") return "OCORRENCIA";
  if (entrega.status === "ENTREGUE" || entrega.status === "FINALIZADO") {
    return isReentrega ? "REENTREGA" : "ENTREGUE";
  }
  return "ARMAZENADA";
}

export async function GET(req: NextRequest) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const cnpj = searchParams.get("cnpj");
  const inicio = searchParams.get("inicio");
  const fim = searchParams.get("fim");
  const listarFornecedores = searchParams.get("fornecedores") === "true";

  // Listar fornecedores disponíveis (para o dropdown)
  if (listarFornecedores) {
    const rows = await prisma.notaFiscal.groupBy({
      by: ["emitenteCnpj", "emitenteRazao"],
      _count: { _all: true },
      orderBy: { emitenteRazao: "asc" },
    });
    return NextResponse.json({
      fornecedores: rows.map((r) => ({
        cnpj: r.emitenteCnpj,
        nome: r.emitenteRazao,
        totalNotas: r._count._all,
      })),
    });
  }

  if (!cnpj) {
    return NextResponse.json({ error: "cnpj é obrigatório" }, { status: 400 });
  }

  // Filtro de período (data de emissão da NF) — YYYY-MM-DD normalizado UTC
  const parseDate = (s: string, isEnd = false) => {
    const ymd = s.length === 10 ? s : s.slice(0, 10);
    return new Date(ymd + (isEnd ? "T23:59:59.999Z" : "T00:00:00.000Z"));
  };

  const where: any = { emitenteCnpj: cnpj };
  if (inicio || fim) {
    where.dataEmissao = {};
    if (inicio) where.dataEmissao.gte = parseDate(inicio);
    if (fim) where.dataEmissao.lte = parseDate(fim, true);
  }

  const notas = await prisma.notaFiscal.findMany({
    where,
    orderBy: { dataEmissao: "asc" },
    select: {
      id: true,
      numero: true,
      serie: true,
      dataEmissao: true,
      valorNota: true,
      pesoBruto: true,
      volumes: true,
      emitenteRazao: true,
      emitenteCnpj: true,
      destinatarioRazao: true,
      destinatarioCnpj: true,
      cidade: true,
      uf: true,
      entrega: {
        select: {
          id: true,
          codigo: true,
          status: true,
          dataChegada: true,
          dataAgendada: true,
          dataEntrega: true,
          diasArmazenagem: true,
          quantidadePaletes: true,
          valorArmazenagem: true,
          valorFrete: true,
          valorDescarga: true,
          observacoes: true,
          motorista: { select: { nome: true } },
        },
      },
    },
  });

  // Tabelas de armazenagem — quem paga a armazenagem é o FORNECEDOR (emitente da NF).
  // No modelo TabelaArmazenagem o campo se chama cnpjCliente mas na prática guarda
  // o CNPJ do fornecedor (mesma convenção usada em /armazenagem-pendente).
  const tabela = await prisma.tabelaArmazenagem.findUnique({
    where: { cnpjCliente: cnpj },
  });

  // Enriquecer com tipo e calcular dias armazenados atuais
  const hoje = new Date();
  const items = notas.map((n) => {
    const e = n.entrega;
    const tipo = classificarTipo(e);

    // Dias armazenados: se ENTREGUE, diff entre chegada e entrega. Senão, chegada até hoje.
    let diasArmazenados: number | null = null;
    if (e?.dataChegada) {
      const start = new Date(e.dataChegada);
      const end = e.dataEntrega ? new Date(e.dataEntrega) : hoje;
      diasArmazenados = Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    }

    // Cálculo dinâmico de armazenagem — usa tabela do fornecedor + dias armazenados
    let valorArmazenagemCalculado = 0;
    let diasCobraveis = 0;
    let diasFree = 0;
    let valorPaleteDia = 0;
    if (tabela && e && diasArmazenados != null && e.quantidadePaletes > 0) {
      diasFree = tabela.diasFree;
      valorPaleteDia = tabela.valorPaleteDia;
      diasCobraveis = Math.max(0, diasArmazenados - diasFree);
      valorArmazenagemCalculado = diasCobraveis * valorPaleteDia * e.quantidadePaletes;
    }
    // Se a entrega já foi faturada (valor armazenagem preenchido), usa o valor real
    const valorArmazenagemFinal = e?.valorArmazenagem && e.valorArmazenagem > 0
      ? e.valorArmazenagem
      : valorArmazenagemCalculado;

    return {
      id: n.id,
      numero: n.numero,
      serie: n.serie,
      dataEmissao: n.dataEmissao,
      valorNota: n.valorNota,
      pesoBruto: n.pesoBruto,
      volumes: n.volumes,
      destinatario: {
        cnpj: n.destinatarioCnpj,
        razaoSocial: n.destinatarioRazao,
        cidade: n.cidade,
        uf: n.uf,
      },
      entrega: e
        ? {
            id: e.id,
            codigo: e.codigo,
            status: e.status,
            dataChegada: e.dataChegada,
            dataAgendada: e.dataAgendada,
            dataEntrega: e.dataEntrega,
            diasArmazenagem: e.diasArmazenagem,
            quantidadePaletes: e.quantidadePaletes,
            valorArmazenagem: valorArmazenagemFinal,
            valorArmazenagemFaturado: e.valorArmazenagem || 0,
            valorArmazenagemCalculado,
            diasCobraveis,
            diasFree,
            valorPaleteDia,
            valorFrete: e.valorFrete,
            valorDescarga: e.valorDescarga,
            motorista: e.motorista?.nome || null,
            observacoes: e.observacoes,
          }
        : null,
      tipo,
      diasArmazenados,
    };
  });

  // KPIs
  const kpis = {
    totalNotas: items.length,
    entregues: items.filter((i) => i.tipo === "ENTREGUE").length,
    reentregas: items.filter((i) => i.tipo === "REENTREGA").length,
    armazenadas: items.filter((i) => i.tipo === "ARMAZENADA").length,
    ocorrencias: items.filter((i) => i.tipo === "OCORRENCIA").length,
    semEntrega: items.filter((i) => i.tipo === "SEM_ENTREGA").length,
    valorTotalArmazenagem: items.reduce((s, i) => s + (i.entrega?.valorArmazenagem || 0), 0),
    valorTotalFrete: items.reduce((s, i) => s + (i.entrega?.valorFrete || 0), 0),
    valorTotalDescarga: items.reduce((s, i) => s + (i.entrega?.valorDescarga || 0), 0),
    valorTotalNotas: items.reduce((s, i) => s + (i.valorNota || 0), 0),
    pesoTotal: items.reduce((s, i) => s + (i.pesoBruto || 0), 0),
    volumesTotal: items.reduce((s, i) => s + (i.volumes || 0), 0),
    // Armazenagem só (nunca entregue)
    valorArmazenagemPendente: items
      .filter((i) => i.tipo === "ARMAZENADA" || i.tipo === "OCORRENCIA")
      .reduce((s, i) => s + (i.entrega?.valorArmazenagem || 0), 0),
  };

  const fornecedor = items.length > 0
    ? { cnpj: items[0].destinatario.cnpj ? cnpj : cnpj, nome: notas[0].emitenteRazao }
    : { cnpj, nome: "" };

  return NextResponse.json({
    fornecedor: { cnpj, nome: notas[0]?.emitenteRazao || "" },
    periodo: { inicio, fim },
    itens: items,
    kpis,
  });
}
