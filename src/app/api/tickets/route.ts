import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { logFromRequest } from "@/lib/audit";
import { TIPOS_TICKET, round2, type TipoTicket } from "@/lib/ticket-calc";

export const dynamic = "force-dynamic";

async function requireAcesso() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Não autorizado", status: 401 };
  const role = (session.user as any)?.role;
  if (!["ADMIN", "FINANCEIRO", "OPERACIONAL"].includes(role)) {
    return { error: "Acesso negado", status: 403 };
  }
  return { session };
}

// ─── GET: lista + agregados para o painel do Financeiro ──────────────────
export async function GET(req: NextRequest) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const inicio = searchParams.get("inicio");
  const fim = searchParams.get("fim");
  const status = searchParams.get("status");
  const embarcador = searchParams.get("embarcador");
  const entregaId = searchParams.get("entregaId");

  const where: any = {};
  if (entregaId) where.entregaId = entregaId;
  if (status) where.status = status;
  if (embarcador) where.embarcadorCnpj = embarcador.replace(/\D/g, "");
  if (inicio || fim) {
    where.dataSolicitacao = {};
    if (inicio) where.dataSolicitacao.gte = new Date(inicio);
    if (fim) where.dataSolicitacao.lte = new Date(fim);
  }

  const solicitacoes = await prisma.solicitacaoTicket.findMany({
    where,
    orderBy: { dataSolicitacao: "desc" },
    include: {
      itens: true,
      entrega: { select: { id: true, codigo: true, razaoSocial: true } },
      criadoPor: { select: { name: true, email: true } },
    },
  });

  // Agregados por tipo e por status para os cartões do painel.
  const porTipo: Record<string, number> = {};
  for (const t of TIPOS_TICKET) porTipo[t] = 0;
  const porStatus: Record<string, number> = { ENVIADA: 0, APROVADA: 0, RECUSADA: 0, CANCELADA: 0 };

  for (const s of solicitacoes) {
    porStatus[s.status] = (porStatus[s.status] || 0) + 1;
    for (const item of s.itens) porTipo[item.tipo] = round2((porTipo[item.tipo] || 0) + item.valor);
  }

  return NextResponse.json({
    solicitacoes,
    total: solicitacoes.length,
    valorTotal: round2(solicitacoes.reduce((s, x) => s + (x.valorTotal || 0), 0)),
    porTipo,
    porStatus,
  });
}

// ─── POST: persiste a solicitação gerada no modal ────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  if (!body.entregaId) return NextResponse.json({ error: "entregaId é obrigatório" }, { status: 400 });

  const itens: any[] = Array.isArray(body.itens) ? body.itens : [];
  if (itens.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um tipo de solicitação" }, { status: 400 });
  }
  const invalido = itens.find((i) => !TIPOS_TICKET.includes(i.tipo as TipoTicket));
  if (invalido) return NextResponse.json({ error: `Tipo inválido: ${invalido.tipo}` }, { status: 400 });

  const entrega = await prisma.entrega.findUnique({ where: { id: body.entregaId }, select: { id: true } });
  if (!entrega) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  // Número sequencial TCK-00001, mesmo padrão das diárias.
  const ultima = await prisma.solicitacaoTicket.findFirst({
    orderBy: { createdAt: "desc" },
    select: { numero: true },
  });
  const ultimoNum = ultima ? parseInt(ultima.numero.replace("TCK-", "")) || 0 : 0;
  const numero = `TCK-${String(ultimoNum + 1).padStart(5, "0")}`;

  const valorTotal = round2(itens.reduce((s, i) => s + (Number(i.valor) || 0), 0));

  const criada = await prisma.solicitacaoTicket.create({
    data: {
      numero,
      entregaId: entrega.id,
      embarcadorCnpj: String(body.embarcadorCnpj || "").replace(/\D/g, ""),
      embarcadorNome: body.embarcadorNome || "",
      transportador: body.transportador || "MAGNA LOG",
      cliente: body.cliente || "",
      localidade: body.localidade || "",
      notasFiscais: body.notasFiscais || "",
      dataAgenda: body.dataAgenda ? new Date(body.dataAgenda) : null,
      cteNumero: body.cteNumero || null,
      perfilVeiculo: body.perfilVeiculo || null,
      placaVeiculo: body.placaVeiculo || null,
      volumes: Number(body.volumes) || 0,
      destinatarios: body.destinatarios || "",
      copia: body.copia || null,
      assunto: body.assunto || "",
      corpoHtml: body.corpoHtml || "",
      valorTotal,
      observacoes: body.observacoes || null,
      criadoPorId: (auth.session!.user as any)?.id || null,
      itens: {
        create: itens.map((i) => ({
          tipo: i.tipo,
          valor: round2(Number(i.valor) || 0),
          observacoes: i.observacoes || null,
          valorBase: i.valorBase != null ? round2(Number(i.valorBase)) : null,
          valorIrpj: i.valorIrpj != null ? round2(Number(i.valorIrpj)) : null,
          valorCsll: i.valorCsll != null ? round2(Number(i.valorCsll)) : null,
          valorCofins: i.valorCofins != null ? round2(Number(i.valorCofins)) : null,
          valorPis: i.valorPis != null ? round2(Number(i.valorPis)) : null,
          valorIss: i.valorIss != null ? round2(Number(i.valorIss)) : null,
        })),
      },
    },
    include: { itens: true },
  });

  await logFromRequest(req, "OUTRO", {
    user: auth.session!.user as any,
    recursoTipo: "SolicitacaoTicket",
    recursoId: criada.id,
    recursoDesc: `${numero} — ${criada.cliente} (${itens.map((i) => i.tipo).join(", ")})`,
    detalhes: { valorTotal, entregaId: entrega.id },
  });

  return NextResponse.json(criada, { status: 201 });
}
