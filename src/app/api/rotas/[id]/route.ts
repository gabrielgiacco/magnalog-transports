import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ORDEM_PARADAS } from "@/lib/upload-token";
import { moverRota } from "@/lib/rota-mover";
import { etapaDaRota, statusParaNovaEntrega } from "@/lib/rota-etapa";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const rota = await prisma.rota.findUnique({
    where: { id: params.id },
    include: {
      motorista: true,
      veiculo: true,
      entregas: {
        include: {
          notas: { select: { id: true, numero: true, valorNota: true } },
        },
        orderBy: [...ORDEM_PARADAS],
      },
      qualidade: { select: { id: true } },
    },
  });

  if (!rota) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  return NextResponse.json(rota);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi();
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const data: any = {};

  if (body.status) data.status = body.status;
  if (body.motoristaId !== undefined) {
    data.motoristaId = body.motoristaId === "" ? null : body.motoristaId;
    if (data.motoristaId && body.valorMotorista === undefined) {
      const moto = await prisma.motorista.findUnique({ where: { id: data.motoristaId }, select: { tipo: true, valorDiaria: true } });
      if (moto) {
        if (moto.tipo === "FROTA") data.valorMotorista = 0;
        else if (moto.tipo === "DIARIA") {
          // Buscar a data da rota atual para verificar se já existe diária no mesmo dia
          const rotaAtual = await prisma.rota.findUnique({ where: { id: params.id }, select: { data: true } });
          const rotaDate = body.data ? new Date(body.data) : rotaAtual?.data || new Date();
          const diaInicio = new Date(rotaDate); diaInicio.setHours(0,0,0,0);
          const diaFim = new Date(rotaDate); diaFim.setHours(23,59,59,999);
          const [rotasMesmoDia, entregasMesmoDia] = await Promise.all([
            prisma.rota.count({ where: { id: { not: params.id }, motoristaId: data.motoristaId, data: { gte: diaInicio, lte: diaFim }, status: { not: "CANCELADA" } } }),
            prisma.entrega.count({ where: { motoristaId: data.motoristaId, rotaId: null, dataAgendada: { gte: diaInicio, lte: diaFim }, status: { notIn: ["PROGRAMADO", "EM_SEPARACAO"] } } }),
          ]);
          data.valorMotorista = (rotasMesmoDia + entregasMesmoDia) === 0 ? (moto.valorDiaria || 0) : 0;
        }
      }
    }
  }
  if (body.veiculoId !== undefined) data.veiculoId = body.veiculoId === "" ? null : body.veiculoId;
  if (body.data) data.data = new Date(body.data);
  if (body.valorMotorista !== undefined) data.valorMotorista = parseFloat(body.valorMotorista) || 0;
  if (body.observacoes !== undefined) data.observacoes = body.observacoes;

  // 1. Recalcular totais se houve mudança nas entregas (isso precisa ser feito antes do update final da rota)
  const queryEntregas = await prisma.entrega.findMany({
    where: { rotaId: params.id },
    select: { pesoTotal: true, volumeTotal: true },
  });
  data.pesoTotal = queryEntregas.reduce((s: number, e: any) => s + e.pesoTotal, 0);
  data.volumeTotal = queryEntregas.reduce((s: number, e: any) => s + e.volumeTotal, 0);

  // 2. Etapa da rota (Em Separação → Carregado → Em Rota → Entregue → Finalizado):
  //    mesma regra do Kanban, que também ajusta o status interno da rota.
  if (body.etapa) {
    const r = await prisma.$transaction((tx) =>
      moverRota(tx, params.id, body.etapa, body.dataEntrega ? new Date(body.dataEntrega) : null)
    );
    if (!r.ok) return NextResponse.json({ error: r.erro, message: r.mensagem }, { status: r.http });
  }

  // 3. Atualizar a rota
  const updatedRota = await prisma.rota.update({
    where: { id: params.id },
    data,
    include: { motorista: true, veiculo: true, entregas: true },
  });
  // Entrega que entra agora acompanha a etapa da rota (Carregado ou Em Rota); senão Em Separação.
  const statusNovaEntrega = statusParaNovaEntrega(etapaDaRota(updatedRota.entregas.map((e) => e.status)));

  // 3. Se mudou motorista, veículo ou valor, propagar para TODAS as entregas da rota
  if (body.motoristaId !== undefined || body.veiculoId !== undefined || body.valorMotorista !== undefined) {
    await prisma.entrega.updateMany({
      where: { rotaId: params.id },
      data: {
        motoristaId: (updatedRota as any).motoristaId,
        veiculoId: (updatedRota as any).veiculoId,
        valorMotorista: (updatedRota as any).valorMotorista,
      }
    });
  }

  // As NFs da rota ficam agendadas para a data da rota: mudou a data, muda o agendamento de todas.
  if (body.data) {
    await prisma.entrega.updateMany({ where: { rotaId: params.id }, data: { dataAgendada: updatedRota.data } });
  }

  // 4. Lógica específica para Adicionar/Remover entregas individuais (herdar ou limpar)
  if (body.addEntregaId) {
    await prisma.entrega.update({
      where: { id: body.addEntregaId },
      data: {
        rotaId: params.id,
        motoristaId: (updatedRota as any).motoristaId,
        veiculoId: (updatedRota as any).veiculoId,
        valorMotorista: (updatedRota as any).valorMotorista,
        dataAgendada: updatedRota.data,
        status: statusNovaEntrega
      },
    });
  }
  if (body.addEntregaIds && Array.isArray(body.addEntregaIds)) {
    // Entrega adicionada depois vai para o fim da sequencia.
    const ultima = await prisma.entrega.aggregate({ where: { rotaId: params.id }, _max: { ordemRota: true } });
    let proxima = (ultima._max.ordemRota ?? 0) + 1;
    await prisma.$transaction(
      (body.addEntregaIds as string[]).map((id) =>
        prisma.entrega.update({ where: { id }, data: { ordemRota: proxima++ } })
      )
    );
    await prisma.entrega.updateMany({
      where: { id: { in: body.addEntregaIds } },
      data: {
        rotaId: params.id,
        motoristaId: (updatedRota as any).motoristaId,
        veiculoId: (updatedRota as any).veiculoId,
        valorMotorista: (updatedRota as any).valorMotorista,
        dataAgendada: updatedRota.data,
        status: statusNovaEntrega
      },
    });
  }
  if (body.removeEntregaId) {
    await prisma.entrega.update({
      where: { id: body.removeEntregaId },
      data: {
        rotaId: null,
        // Sai da sequencia e do link da rota: o motorista nao pode agir numa
        // parada que a equipe tirou.
        ordemRota: null,
        uploadToken: null,
        uploadTokenExpira: null,
        motoristaId: null,
        veiculoId: null,
        valorMotorista: 0,
        status: "PROGRAMADO"
      },
    });
  }

  return NextResponse.json(updatedRota);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApi(["ADMIN"]);
  if (!auth.ok) return NextResponse.json({ error: "Não autorizado (Apenas Admins)" }, { status: 403 });

  try {
    // 1. Desvincular todas as entregas e resetar seus campos
    await prisma.entrega.updateMany({
      where: { rotaId: params.id },
      data: {
        rotaId: null,
        motoristaId: null,
        veiculoId: null,
        valorMotorista: 0,
        status: "PROGRAMADO"
      }
    });

    // 2. Excluir a rota
    await prisma.rota.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao excluir rota:", error);
    return NextResponse.json({ error: "Erro ao excluir rota" }, { status: 500 });
  }
}
