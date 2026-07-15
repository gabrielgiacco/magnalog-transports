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

// ─── GET: listar diárias com filtros ────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status");
  const clienteCnpj = searchParams.get("clienteCnpj");
  const entregaId = searchParams.get("entregaId");
  const valorPendente = searchParams.get("valorPendente") === "true";
  const inicio = searchParams.get("inicio");
  const fim = searchParams.get("fim");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "100");

  const where: any = {};
  if (status) where.status = status;
  if (clienteCnpj) where.clienteCnpj = clienteCnpj.replace(/\D/g, "");
  if (entregaId) where.entregaId = entregaId;
  if (valorPendente) where.valor = 0;
  if (inicio || fim) {
    where.dataOcorrencia = {};
    if (inicio) where.dataOcorrencia.gte = new Date(inicio + "T00:00:00.000Z");
    if (fim) where.dataOcorrencia.lte = new Date(fim + "T23:59:59.999Z");
  }
  if (q) {
    where.OR = [
      { numero: { contains: q, mode: "insensitive" } },
      { clienteNome: { contains: q, mode: "insensitive" } },
      { motivo: { contains: q, mode: "insensitive" } },
      { entrega: { codigo: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [itens, total] = await Promise.all([
    prisma.diaria.findMany({
      where,
      orderBy: { dataOcorrencia: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        entrega: { select: { id: true, codigo: true, razaoSocial: true, cidade: true, uf: true, dataAgendada: true } },
      },
    }),
    prisma.diaria.count({ where }),
  ]);

  return NextResponse.json({ itens, total, pages: Math.ceil(total / limit) });
}

// ─── POST: criar diária ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAcesso();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  if (!body.entregaId) {
    return NextResponse.json({ error: "entregaId é obrigatório" }, { status: 400 });
  }

  const entrega = await prisma.entrega.findUnique({
    where: { id: body.entregaId },
    select: { id: true, cnpj: true, razaoSocial: true },
  });
  if (!entrega) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

  // Gera número sequencial DIA-00001
  const ultima = await prisma.diaria.findFirst({ orderBy: { createdAt: "desc" }, select: { numero: true } });
  const ultimoNum = ultima ? parseInt(ultima.numero.replace("DIA-", "")) || 0 : 0;
  const numero = `DIA-${String(ultimoNum + 1).padStart(5, "0")}`;

  const diaria = await prisma.diaria.create({
    data: {
      numero,
      entregaId: entrega.id,
      clienteCnpj: entrega.cnpj || "",
      clienteNome: entrega.razaoSocial || "",
      motivo: body.motivo || null,
      valor: typeof body.valor === "number" ? body.valor : parseFloat(body.valor) || 0,
      observacoes: body.observacoes || null,
      status: "PENDENTE",
    },
    include: {
      entrega: { select: { id: true, codigo: true, razaoSocial: true } },
    },
  });

  return NextResponse.json(diaria, { status: 201 });
}
