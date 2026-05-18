import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const radius = searchParams.get("radius"); // Em km, futuro
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    
    // Busca entregas que:
    // 1. Estão disponíveis (sem rota)
    // 2. Não estão finalizadas/entregues/canceladas
    // 3. Têm latitude e longitude
    // 4. (Opcional) pertencem a uma lista específica de clientes (fracionados)
    
    const entregas = await prisma.entrega.findMany({
      where: {
        rotaId: null,
        status: { notIn: ["ENTREGUE", "FINALIZADO", "OCORRENCIA"] },
      },
      select: {
        id: true,
        codigo: true,
        razaoSocial: true,
        cidade: true,
        uf: true,
        endereco: true,
        bairro: true,
        cep: true,
        pesoTotal: true,
        volumeTotal: true,
        latitude: true,
        longitude: true,
        status: true,
        notas: {
          select: { numero: true, chaveAcesso: true, emitenteRazao: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    // Se tivermos filtro de distância, poderíamos filtrar aqui no Node usando fórmula de Haversine
    // ou futuramente via query espacial no Prisma/Postgis
    let resultados = entregas;

    if (radius && lat && lng) {
      const centerLat = parseFloat(lat);
      const centerLng = parseFloat(lng);
      const radiusKm = parseFloat(radius);

      resultados = entregas.filter(e => {
        if (!e.latitude || !e.longitude) return false;
        const d = haversineDistance(centerLat, centerLng, e.latitude, e.longitude);
        return d <= radiusKm;
      });
    }

    return NextResponse.json(resultados);
  } catch (error: any) {
    console.error("ERRO_ENTREGAS_MAPA:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}

// Haversine formula to calculate distance between two lat/lng points in km
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}
