import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const fimMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59);

  const [
    mesAtual,
    mesAnterior,
    totalClientes,
    totalMotoristas,
    totalVeiculos,
    notasImportadas,
    rotasAtivas,
  ] = await Promise.all([
    // Mês atual
    prisma.entrega.aggregate({
      where: { createdAt: { gte: inicioMes } },
      _count: true,
      _sum: { valorFrete: true, pesoTotal: true },
    }),
    // Mês anterior (para calcular variação)
    prisma.entrega.aggregate({
      where: { createdAt: { gte: inicioMesAnterior, lte: fimMesAnterior } },
      _count: true,
      _sum: { valorFrete: true, pesoTotal: true },
    }),
    prisma.cliente.count(),
    prisma.motorista.count({ where: { ativo: true } }),
    prisma.veiculo.count({ where: { ativo: true } }),
    prisma.notaFiscal.count({ where: { createdAt: { gte: inicioMes } } }),
    prisma.rota.count({ where: { status: { in: ["PLANEJADA", "EM_ANDAMENTO"] } } }),
  ]);

  const variacaoEntregas =
    mesAnterior._count > 0
      ? Math.round(((mesAtual._count - mesAnterior._count) / mesAnterior._count) * 100)
      : 0;

  const variacaoFrete =
    (mesAnterior._sum.valorFrete ?? 0) > 0
      ? Math.round(
          (((mesAtual._sum.valorFrete ?? 0) - (mesAnterior._sum.valorFrete ?? 0)) /
            (mesAnterior._sum.valorFrete ?? 1)) *
            100
        )
      : 0;

  return NextResponse.json({
    mesAtual: {
      entregas: mesAtual._count,
      frete: mesAtual._sum.valorFrete ?? 0,
      peso: mesAtual._sum.pesoTotal ?? 0,
      notas: notasImportadas,
    },
    variacoes: {
      entregas: variacaoEntregas,
      frete: variacaoFrete,
    },
    totais: {
      clientes: totalClientes,
      motoristas: totalMotoristas,
      veiculos: totalVeiculos,
      rotasAtivas,
    },
  });
}
