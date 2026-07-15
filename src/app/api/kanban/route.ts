import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Returns deliveries: non-finalized AND finalized within last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const entregas = await prisma.entrega.findMany({
    where: {
      OR: [
        { status: { notIn: ["FINALIZADO"] } },
        {
          status: "FINALIZADO",
          updatedAt: { gte: sevenDaysAgo }
        }
      ]
    },
    orderBy: { updatedAt: "desc" },
    include: {
      motorista: { select: { nome: true } },
      veiculo: { select: { placa: true } },
      _count: { select: { notas: true } },
      notas: { select: { numero: true, emitenteRazao: true } },
      rota: { select: { id: true, codigo: true, valorMotorista: true } },
      qualidade: { select: { id: true } },
      diarias: { where: { status: { in: ["PENDENTE", "PAGA"] } }, select: { id: true, status: true, valor: true } },
    },
  });

  return NextResponse.json(entregas);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role === "CONFERENTE") {
    return NextResponse.json({ error: "Conferente não pode alterar status" }, { status: 403 });
  }

  const { id, status } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "id e status obrigatórios" }, { status: 400 });

  const validStatuses = ["PROGRAMADO", "EM_SEPARACAO", "CARREGADO", "EM_ROTA", "ENTREGUE", "FINALIZADO", "OCORRENCIA"];
  if (!validStatuses.includes(status)) return NextResponse.json({ error: "Status inválido" }, { status: 400 });

  const data: any = { status };
  if (status === "ENTREGUE" || status === "FINALIZADO") data.dataEntrega = new Date();
  if (status === "FINALIZADO") data.statusCanhoto = "RECEBIDO";

  if (id.startsWith("rota_")) {
    const rotaId = id.replace("rota_", "");
    
    // Atualizar todas as entregas da rota
    await prisma.entrega.updateMany({
      where: { rotaId },
      data,
    });

    // Mapear status da entrega para status da rota se necessário
    let rotaStatus: string | undefined;
    if (status === "EM_ROTA") rotaStatus = "EM_ANDAMENTO";
    else if (["ENTREGUE", "FINALIZADO"].includes(status)) rotaStatus = "CONCLUIDA";
    else if (status === "PROGRAMADO") rotaStatus = "PLANEJADA";

    if (rotaStatus) {
      await prisma.rota.update({
        where: { id: rotaId },
        data: { status: rotaStatus as any }
      });
    }

    return NextResponse.json({ ok: true, isRota: true });
  }

  const entrega = await prisma.entrega.update({
    where: { id },
    data,
    include: { motorista: { select: { nome: true } }, veiculo: { select: { placa: true } } },
  });

  return NextResponse.json(entrega);
}
