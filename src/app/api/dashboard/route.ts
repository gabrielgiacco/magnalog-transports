import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [
    totalEmAndamento,
    totalAtrasadas,
    totalEntreguesHoje,
    totalPesoMes,
    totalFreteMes,
    totalSaldoRota,
    porStatus,
    ultimasEntregas,
    ocorrenciasAbertas,
  ] = await Promise.all([
    // Em andamento (não finalizados)
    prisma.entrega.count({
      where: { status: { notIn: ["FINALIZADO", "ENTREGUE"] } },
    }),
    // Atrasadas: agendadas antes de hoje e não entregues
    prisma.entrega.count({
      where: {
        dataAgendada: { lt: hoje },
        status: { notIn: ["ENTREGUE", "FINALIZADO"] },
      },
    }),
    // Entregues hoje
    prisma.entrega.count({
      where: {
        dataEntrega: { gte: hoje },
        status: { in: ["ENTREGUE", "FINALIZADO"] },
      },
    }),
    // Peso total do mês
    prisma.entrega.aggregate({
      where: {
        dataAgendada: { gte: new Date(hoje.getFullYear(), hoje.getMonth(), 1) },
        status: { notIn: ["OCORRENCIA"] },
      },
      _sum: { pesoTotal: true },
    }),
    // Valor frete do mês e saldo entregas diretas
    (prisma.entrega as any).aggregate({
      where: {
        dataAgendada: { gte: new Date(hoje.getFullYear(), hoje.getMonth(), 1) },
      },
      _sum: { valorFrete: true, saldoMotorista: true },
    }),
    // Saldo pendente rotas do mês
    (prisma.rota as any).aggregate({
      where: {
        data: { gte: new Date(hoje.getFullYear(), hoje.getMonth(), 1) },
      },
      _sum: { saldoMotorista: true },
    }),
    // Contagem por status
    prisma.entrega.groupBy({
      by: ["status"],
      where: { status: { notIn: ["FINALIZADO"] } },
      _count: true,
    }),
    // Últimas 8 entregas
    prisma.entrega.findMany({
      take: 8,
      orderBy: { updatedAt: "desc" },
      where: { status: { notIn: ["FINALIZADO"] } },
      include: {
        motorista: { select: { nome: true } },
        notas: { select: { numero: true } },
        _count: { select: { notas: true } },
      },
    }),
    // Ocorrências abertas
    prisma.ocorrencia.count({ where: { resolvida: false } }),
  ]);

  // Entregas por dia nos últimos 7 dias
  const sete = new Date(hoje);
  sete.setDate(sete.getDate() - 6);
  const entregasSemana = await prisma.entrega.findMany({
    where: { createdAt: { gte: sete } },
    select: { createdAt: true, status: true },
  });

  const diasMap: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(sete);
    d.setDate(d.getDate() + i);
    diasMap[d.toISOString().slice(0, 10)] = 0;
  }
  entregasSemana.forEach((e: any) => {
    const key = e.createdAt.toISOString().slice(0, 10);
    if (diasMap[key] !== undefined) diasMap[key]++;
  });

  return NextResponse.json({
    kpis: {
      emAndamento: totalEmAndamento,
      atrasadas: totalAtrasadas,
      entreguesHoje: totalEntreguesHoje,
      pesoMes: totalPesoMes._sum.pesoTotal ?? 0,
      freteMes: totalFreteMes._sum.valorFrete ?? 0,
      saldoPendente: ((totalFreteMes._sum as any).saldoMotorista || 0) + ((totalSaldoRota._sum as any).saldoMotorista || 0),
      ocorrenciasAbertas,
    },
    porStatus,
    ultimasEntregas,
    graficoSemana: Object.entries(diasMap).map(([data, count]) => ({ data, count })),
  });
}
