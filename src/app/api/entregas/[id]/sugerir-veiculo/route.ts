import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { extrairCargaEntrega, sugerirPorHistorico } from "@/lib/entrega-carga";
import { getCapacidadeVeiculo } from "@/lib/veiculo-capacidades";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const entrega = await prisma.entrega.findUnique({
      where: { id: params.id },
      include: { notas: { select: { xmlOriginal: true } } },
    });
    if (!entrega) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });

    const carga = extrairCargaEntrega(entrega);

    const veiculos = await prisma.veiculo.findMany({
      where: { ativo: true },
      include: { motorista: { select: { nome: true } } },
      orderBy: { placa: "asc" },
    });

    let historico: Awaited<ReturnType<typeof sugerirPorHistorico>> = [];
    let baseHistorico: { totalEntregas: number; filtradoPorNcm: boolean } | null = null;

    if (carga.fonte === "sem_dados") {
      historico = await sugerirPorHistorico(entrega.cnpj, carga.ncmsPrincipais);
      if (historico.length > 0) {
        baseHistorico = {
          totalEntregas: historico[0].totalEntregas,
          filtradoPorNcm: historico[0].filtradoPorNcm,
        };
      }
    }

    const historicoMap = new Map(historico.map((h) => [h.veiculoId, h]));

    const veiculosEnriquecidos = veiculos.map((v) => {
      const cap = getCapacidadeVeiculo(v);
      const hist = historicoMap.get(v.id) || null;

      let aproveitamento: number | null = null;
      let cabe: boolean | null = null;
      if (carga.fonte === "paletes" && cap.paletes > 0) {
        aproveitamento = carga.paletes / cap.paletes;
        cabe = aproveitamento <= 1.0;
      } else if (carga.fonte === "m3" && cap.m3 > 0 && carga.m3 != null) {
        aproveitamento = carga.m3 / cap.m3;
        cabe = aproveitamento <= 1.0;
      }

      return {
        id: v.id,
        placa: v.placa,
        tipo: v.tipo,
        modelo: v.modelo,
        motoristaNome: v.motorista?.nome || null,
        capacidadePaletes: cap.paletes,
        capacidadeM3: cap.m3,
        origemPaletes: cap.origemPaletes,
        origemM3: cap.origemM3,
        aproveitamento,
        cabe,
        atual: v.id === entrega.veiculoId,
        historico: hist ? { usos: hist.usos, totalEntregas: hist.totalEntregas, confianca: hist.confianca } : null,
      };
    });

    veiculosEnriquecidos.sort((a, b) => {
      if (carga.fonte === "sem_dados") {
        const ha = a.historico?.usos || 0;
        const hb = b.historico?.usos || 0;
        if (ha !== hb) return hb - ha;
        return a.placa.localeCompare(b.placa);
      }
      const aCabe = a.cabe ? 1 : 0;
      const bCabe = b.cabe ? 1 : 0;
      if (aCabe !== bCabe) return bCabe - aCabe;
      const aApr = a.aproveitamento ?? 0;
      const bApr = b.aproveitamento ?? 0;
      if (aCabe === 1 && bCabe === 1) {
        return bApr - aApr;
      }
      return aApr - bApr;
    });

    return NextResponse.json({
      carga,
      baseHistorico,
      veiculoAtualId: entrega.veiculoId,
      veiculos: veiculosEnriquecidos,
    });
  } catch (error: any) {
    console.error("sugerir-veiculo error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
