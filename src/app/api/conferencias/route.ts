import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/api-auth";
import { montarItensDaRota } from "@/lib/conferencia";

export const dynamic = "force-dynamic";

const resumo = { id: true, status: true, concluidaEm: true, avariaId: true } as const;

// Lista as rotas do dia com a ultima conferencia (ou so a da rota, com ?rotaId=)
export async function GET(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const rotaId = sp.get("rotaId");
  if (rotaId) {
    const c = await prisma.conferencia.findFirst({ where: { rotaId }, orderBy: { createdAt: "desc" }, select: resumo });
    return NextResponse.json(c);
  }

  const data = sp.get("data") || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ error: "Data inválida" }, { status: 400 });

  const rotas = await prisma.rota.findMany({
    where: {
      data: { gte: new Date(`${data}T00:00:00.000Z`), lte: new Date(`${data}T23:59:59.999Z`) },
      status: { not: "CANCELADA" },
    },
    orderBy: { codigo: "asc" },
    select: {
      id: true, codigo: true, data: true, status: true,
      motorista: { select: { nome: true } },
      veiculo: { select: { placa: true } },
      entregas: { select: { _count: { select: { notas: true } } } },
      conferencias: { orderBy: { createdAt: "desc" }, take: 1, select: resumo },
    },
  });

  return NextResponse.json(
    rotas.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      data: r.data,
      status: r.status,
      motorista: r.motorista?.nome ?? null,
      placa: r.veiculo?.placa ?? null,
      entregas: r.entregas.length,
      nfs: r.entregas.reduce((s, e) => s + e._count.notas, 0),
      conferencia: r.conferencias[0] ?? null,
    })),
  );
}

// Inicia a conferencia da rota (ou retoma a que esta em andamento)
export async function POST(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const user = auth.session.user as any;
  const body = await req.json().catch(() => ({}));
  const rotaId = typeof body.rotaId === "string" ? body.rotaId : "";
  if (!rotaId) return NextResponse.json({ error: "rotaId obrigatório" }, { status: 400 });

  const rota = await prisma.rota.findUnique({ where: { id: rotaId }, select: { id: true, status: true } });
  if (!rota) return NextResponse.json({ error: "Rota não encontrada" }, { status: 404 });
  if (rota.status === "CANCELADA") return NextResponse.json({ error: "Rota cancelada" }, { status: 400 });

  const emAndamento = await prisma.conferencia.findFirst({
    where: { rotaId, status: "EM_ANDAMENTO" },
    select: { id: true },
  });
  if (emAndamento) return NextResponse.json({ id: emAndamento.id });

  const criada = await prisma.$transaction(async (tx) => {
    const itens = await montarItensDaRota(tx, rotaId);
    if (itens.length === 0) return null;
    return tx.conferencia.create({
      data: {
        rotaId,
        conferenteId: user.id || user.userId || null,
        conferenteNome: user.name || null,
        itens: { create: itens },
      },
      select: { id: true },
    });
  });
  if (!criada) return NextResponse.json({ error: "A rota não tem NFs para conferir" }, { status: 400 });
  return NextResponse.json({ id: criada.id });
}
