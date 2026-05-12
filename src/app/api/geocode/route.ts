import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { geocodeAddress, delay } from "@/lib/geocode";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { entregaIds, allPending = false } = await req.json();

    let entregasToProcess = [];

    if (allPending) {
      // Pega entregas sem lat/lng que não estão canceladas nem finalizadas (limite 50 por request para não estourar tempo)
      entregasToProcess = await prisma.entrega.findMany({
        where: {
          latitude: null,
          longitude: null,
          status: { notIn: ["ENTREGUE", "FINALIZADO", "OCORRENCIA"] },
          cidade: { not: "" }, // Pelo menos a cidade tem que ter
        },
        take: 50,
        select: { id: true, endereco: true, bairro: true, cidade: true, uf: true, cep: true },
      });
    } else if (entregaIds && Array.isArray(entregaIds) && entregaIds.length > 0) {
      entregasToProcess = await prisma.entrega.findMany({
        where: { id: { in: entregaIds } },
        select: { id: true, endereco: true, bairro: true, cidade: true, uf: true, cep: true },
      });
    } else {
      return NextResponse.json({ error: "Forneça entregaIds ou allPending=true" }, { status: 400 });
    }

    if (entregasToProcess.length === 0) {
      return NextResponse.json({ message: "Nenhuma entrega para geocodificar", geocoded: 0, errors: 0 });
    }

    let geocodedCount = 0;
    let errorCount = 0;

    for (const entrega of entregasToProcess) {
      // 1 request per second policy of Nominatim
      await delay(1100); 

      const coords = await geocodeAddress(entrega);

      if (coords) {
        await prisma.entrega.update({
          where: { id: entrega.id },
          data: {
            latitude: coords.lat,
            longitude: coords.lng,
          },
        });
        geocodedCount++;
      } else {
        errorCount++;
      }
    }

    return NextResponse.json({ 
      message: "Geocodificação concluída", 
      geocoded: geocodedCount, 
      errors: errorCount,
      total: entregasToProcess.length
    });

  } catch (error: any) {
    console.error("ERRO_GEOCODE_API:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}
