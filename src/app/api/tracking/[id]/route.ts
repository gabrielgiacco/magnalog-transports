import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logFromRequest } from "@/lib/audit";

// Public endpoint — no auth required
// Returns limited data for tracking page
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const entrega = await prisma.entrega.findFirst({
      where: {
        OR: [
          { notas: { some: { numero: params.id } } }, // principal (Número da NF)
          { codigo: params.id }, // backup (Código Magnalog)
          { id: params.id }, // backup (ID do banco)
        ]
      },
      select: {
        id: true,
        codigo: true,
        razaoSocial: true,
        cidade: true,
        uf: true,
        status: true,
        dataAgendada: true,
        dataEntrega: true,
        motorista: { select: { nome: true } },
        veiculo: { select: { placa: true } },
        motoristaCompl: { select: { nome: true } },
        veiculoCompl: { select: { placa: true } },
        notas: {
          select: {
            id: true,
            numero: true,
            serie: true,
            emitenteRazao: true,
            volumes: true,
            pesoBruto: true,
            valorNota: true,
          },
        },
        ocorrencias: {
          where: { resolvida: false },
          select: { id: true, tipo: true, descricao: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 3,
        },
        _count: { select: { notas: true } },
      },
    });

    if (!entrega) {
      await logFromRequest(req, "RASTREIO_PUBLICO", {
        sucesso: false,
        recursoTipo: "rastreio",
        recursoDesc: params.id,
        detalhes: { busca: params.id, resultado: "nao_encontrado" },
      });
      return NextResponse.json(
        { error: "Entrega não encontrada. Verifique o código de rastreamento." },
        { status: 404 }
      );
    }

    await logFromRequest(req, "RASTREIO_PUBLICO", {
      recursoTipo: "entrega",
      recursoId: entrega.id,
      recursoDesc: `${entrega.codigo} · ${entrega.razaoSocial}`,
      detalhes: { busca: params.id, status: entrega.status, cliente: entrega.razaoSocial },
    });

    return NextResponse.json(entrega);
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
