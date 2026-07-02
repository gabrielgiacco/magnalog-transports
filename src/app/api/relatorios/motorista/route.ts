import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const motoristaId = searchParams.get("motoristaId");
  const inicio = searchParams.get("inicio");
  const fim = searchParams.get("fim");

  if (!motoristaId || !inicio || !fim) {
    return NextResponse.json({ error: "Parâmetros obrigatórios: motoristaId, inicio, fim" }, { status: 400 });
  }

  // Range UTC-normalizado — cobre todo o dia independente de timezone salvo
  const parseDate = (s: string, isEnd = false) => {
    const ymd = s.length === 10 ? s : s.slice(0, 10);
    return new Date(ymd + (isEnd ? "T23:59:59.999Z" : "T00:00:00.000Z"));
  };
  const dateFilter = { gte: parseDate(inicio), lte: parseDate(fim, true) };

  // Entregas diretas (sem rota)
  const entregasDiretas = await prisma.entrega.findMany({
    where: {
      motoristaId,
      rotaId: null,
      dataAgendada: dateFilter,
    },
    select: {
      id: true, codigo: true, razaoSocial: true, cidade: true, uf: true,
      status: true, dataAgendada: true, pesoTotal: true, volumeTotal: true,
      valorFrete: true, valorMotorista: true, adiantamentoMotorista: true, saldoMotorista: true,
    },
    orderBy: { dataAgendada: "asc" },
  });

  // Rotas do motorista com suas entregas
  const rotas = await prisma.rota.findMany({
    where: {
      motoristaId,
      data: dateFilter,
    },
    include: {
      entregas: {
        select: {
          id: true, codigo: true, razaoSocial: true, cidade: true, uf: true,
          status: true, dataAgendada: true, pesoTotal: true, volumeTotal: true,
          valorFrete: true,
        },
        orderBy: { dataAgendada: "asc" },
      },
    },
    orderBy: { data: "asc" },
  });

  // Build result: entregas diretas + rotas (as groups)
  const items: any[] = [];

  for (const e of entregasDiretas) {
    items.push({ ...e, tipo: "DIRETA" });
  }

  for (const r of rotas) {
    // Add a rota header item
    items.push({
      id: r.id,
      tipo: "ROTA",
      codigo: r.codigo,
      razaoSocial: `Rota ${r.codigo} (${r.entregas.length} entregas)`,
      cidade: "",
      uf: "",
      status: r.status,
      dataAgendada: r.data,
      pesoTotal: r.pesoTotal,
      volumeTotal: r.volumeTotal,
      valorFrete: r.entregas.reduce((s, e) => s + (e.valorFrete || 0), 0),
      valorMotorista: r.valorMotorista,
      adiantamentoMotorista: r.adiantamentoMotorista,
      saldoMotorista: r.saldoMotorista,
      entregas: r.entregas,
    });
  }

  return NextResponse.json(items);
}
