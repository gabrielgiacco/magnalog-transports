import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { calcAging, diasParaVencer } from "@/lib/financeiro";

export const dynamic = "force-dynamic";

async function requireFinanceiro() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Não autorizado", status: 401 };
  const role = (session.user as any).role;
  if (!["ADMIN", "FINANCEIRO"].includes(role)) return { error: "Acesso negado", status: 403 };
  return { session };
}

export async function GET(req: NextRequest) {
  const auth = await requireFinanceiro();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "ABERTA"; // ABERTA | PAGA | CANCELADA | TODAS
  const cliente = searchParams.get("cliente")?.trim();

  const hoje = new Date();

  const whereFatura: any = {};
  const whereArm: any = {};
  if (status !== "TODAS") {
    whereFatura.status = status;
    whereArm.status = status;
  }
  if (cliente) {
    whereFatura.OR = [
      { clienteNome: { contains: cliente, mode: "insensitive" } },
      { clienteCnpj: { contains: cliente.replace(/\D/g, "") } },
    ];
    whereArm.OR = [
      { fornecedorNome: { contains: cliente, mode: "insensitive" } },
      { fornecedorCnpj: { contains: cliente.replace(/\D/g, "") } },
    ];
  }

  const [faturas, faturasArm] = await Promise.all([
    prisma.fatura.findMany({
      where: whereFatura,
      orderBy: { dataVencimento: "asc" },
      select: { id: true, numero: true, valorTotal: true, dataEmissao: true, dataVencimento: true, status: true, clienteCnpj: true, clienteNome: true },
    }),
    prisma.faturaArmazenagem.findMany({
      where: whereArm,
      orderBy: { dataVencimento: "asc" },
      select: { id: true, numero: true, valorTotal: true, dataEmissao: true, dataVencimento: true, status: true, fornecedorCnpj: true, fornecedorNome: true },
    }),
  ]);

  // Unifica
  const itens = [
    ...faturas.map((f) => ({
      id: f.id,
      tipo: "frete" as const,
      numero: f.numero,
      valor: f.valorTotal,
      dataEmissao: f.dataEmissao,
      dataVencimento: f.dataVencimento,
      status: f.status,
      clienteCnpj: f.clienteCnpj,
      clienteNome: f.clienteNome,
      aging: calcAging(f.dataVencimento, hoje),
      diasParaVencer: diasParaVencer(f.dataVencimento, hoje),
    })),
    ...faturasArm.map((f) => ({
      id: f.id,
      tipo: "armazenagem" as const,
      numero: f.numero,
      valor: f.valorTotal,
      dataEmissao: f.dataEmissao,
      dataVencimento: f.dataVencimento,
      status: f.status,
      clienteCnpj: f.fornecedorCnpj,
      clienteNome: f.fornecedorNome,
      aging: calcAging(f.dataVencimento, hoje),
      diasParaVencer: diasParaVencer(f.dataVencimento, hoje),
    })),
  ].sort((a, b) => a.dataVencimento.getTime() - b.dataVencimento.getTime());

  // Agrupa por cliente
  const porCliente: Record<string, { cnpj: string; nome: string; total: number; vencido: number; itens: typeof itens }> = {};
  const abertos = itens.filter((i) => i.status === "ABERTA");
  for (const i of abertos) {
    const key = i.clienteCnpj;
    if (!porCliente[key]) porCliente[key] = { cnpj: i.clienteCnpj, nome: i.clienteNome, total: 0, vencido: 0, itens: [] };
    porCliente[key].total += i.valor;
    if (i.aging === "vencido") porCliente[key].vencido += i.valor;
    porCliente[key].itens.push(i);
  }

  const agrupado = Object.values(porCliente).sort((a, b) => b.total - a.total);

  // KPIs
  const totalAberto = abertos.reduce((s, i) => s + i.valor, 0);
  const totalVencido = abertos.filter((i) => i.aging === "vencido").reduce((s, i) => s + i.valor, 0);
  const aVencer30d = abertos.filter((i) => i.aging === "0-30").reduce((s, i) => s + i.valor, 0);

  return NextResponse.json({
    itens,
    agrupado,
    kpis: { totalAberto, totalVencido, aVencer30d },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireFinanceiro();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  // body: { id, tipo, dataPagamento, formaPagamento }
  if (!body.id || !body.tipo) return NextResponse.json({ error: "id e tipo obrigatórios" }, { status: 400 });
  if (!["frete", "armazenagem"].includes(body.tipo)) return NextResponse.json({ error: "tipo inválido" }, { status: 400 });

  const dataPagamento = body.dataPagamento ? new Date(body.dataPagamento) : new Date();

  if (body.tipo === "frete") {
    const updated = await fetch(new URL("/api/financeiro/faturas", req.url).toString(), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
      body: JSON.stringify({ id: body.id, status: "PAGA", dataPagamento, formaPagamento: body.formaPagamento }),
    });
    if (!updated.ok) return NextResponse.json({ error: "Erro ao registrar pagamento" }, { status: 500 });
    return NextResponse.json(await updated.json());
  } else {
    const updated = await fetch(new URL("/api/financeiro/faturas-armazenagem", req.url).toString(), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
      body: JSON.stringify({ id: body.id, status: "PAGA", dataPagamento, formaPagamento: body.formaPagamento }),
    });
    if (!updated.ok) return NextResponse.json({ error: "Erro ao registrar pagamento" }, { status: 500 });
    return NextResponse.json(await updated.json());
  }
}
