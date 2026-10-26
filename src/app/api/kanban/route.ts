import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ENTREGA_NAO_ARQUIVADA, baixarOcorrenciasAbertas, resolucaoAutomatica } from "@/lib/ocorrencia-baixa";
import { moverRota } from "@/lib/rota-mover";

export async function GET(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Returns deliveries: non-finalized AND finalized within last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const entregas = await prisma.entrega.findMany({
    where: {
      AND: [
        {
          OR: [
            { status: { notIn: ["FINALIZADO"] } },
            {
              status: "FINALIZADO",
              updatedAt: { gte: sevenDaysAgo }
            }
          ]
        },
        // Tentativa encerrada por reentrega: fica só no painel de Ocorrências.
        ENTREGA_NAO_ARQUIVADA,
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
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const session = auth.session;
  if ((session.user as any)?.role === "CONFERENTE") {
    return NextResponse.json({ error: "Conferente não pode alterar status" }, { status: 403 });
  }

  const { id, status, dataEntrega } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "id e status obrigatórios" }, { status: 400 });

  const validStatuses = ["PROGRAMADO", "EM_SEPARACAO", "CARREGADO", "EM_ROTA", "ENTREGUE", "FINALIZADO", "OCORRENCIA"];
  if (!validStatuses.includes(status)) return NextResponse.json({ error: "Status inválido" }, { status: 400 });

  const data: any = { status };
  if (status === "FINALIZADO") data.statusCanhoto = "RECEBIDO";

  // Ao mover para ENTREGUE/FINALIZADO: o cliente sempre envia dataEntrega (modal obrigatório).
  // Se por acaso não vier e alguma entrega ainda não tem dataEntrega, exige o input.
  const dataEntregaISO = dataEntrega ? new Date(dataEntrega) : null;

  // Cartão de rota: mesma regra da tela de Rotas (só move as entregas que
  // precisam, nunca as em ocorrência, e deriva o status da rota).
  if (id.startsWith("rota_")) {
    const r = await prisma.$transaction((tx) => moverRota(tx, id.replace("rota_", ""), status, dataEntregaISO));
    if (!r.ok) return NextResponse.json({ error: r.erro, message: r.mensagem }, { status: r.http });
    return NextResponse.json({ ok: true, isRota: true, etapa: r.etapa });
  }

  if (status === "ENTREGUE" || status === "FINALIZADO") {
    const existente = await prisma.entrega.findUnique({ where: { id }, select: { dataEntrega: true } });
    if (!dataEntregaISO && !existente?.dataEntrega) {
      return NextResponse.json(
        { error: "DATA_ENTREGA_OBRIGATORIA", message: "Informe a data em que a entrega foi realizada." },
        { status: 400 }
      );
    }
  }

  if (dataEntregaISO) data.dataEntrega = dataEntregaISO;

  // Mesma regra do PUT /api/entregas/[id]: concluir ou sair de OCORRENCIA encerra as ocorrências abertas.
  const anterior = await prisma.entrega.findUnique({ where: { id }, select: { status: true } });
  const resolucao = resolucaoAutomatica(anterior?.status, status);
  if (resolucao) await baixarOcorrenciasAbertas(prisma, { id }, resolucao);

  const entrega = await prisma.entrega.update({
    where: { id },
    data,
    include: { motorista: { select: { nome: true } }, veiculo: { select: { placa: true } } },
  });

  return NextResponse.json(entrega);
}
