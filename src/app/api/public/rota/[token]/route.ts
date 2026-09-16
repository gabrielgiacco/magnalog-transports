import { NextRequest, NextResponse } from "next/server";
import { validarTokenRota, type ParadaDoToken } from "@/lib/upload-token";

export const dynamic = "force-dynamic";

/**
 * O que cada parada expõe ao motorista. O token de cada entrega sai daqui só
 * para as entregas DESTA rota — é o que faz o card abrir a página por entrega.
 * uploadTokenExpira, anexos e ocorrencias viram flags; nada financeiro passa.
 */
function montarParada(p: ParadaDoToken, i: number) {
  const { uploadToken, uploadTokenExpira, anexos, ocorrencias, ...campos } = p;
  const tokenAtivo = !!uploadToken && !!uploadTokenExpira && uploadTokenExpira > new Date();
  return {
    ordem: i + 1,
    ...campos,
    temCanhoto: anexos.some((a) => a.tipo === "CANHOTO" || a.tipo === "CANHOTO_DESCARGA"),
    temAssinatura: anexos.some((a) => a.tipo === "ASSINATURA"),
    ocorrenciaAberta: ocorrencias.length > 0,
    // Nulo quando a entrega entrou na rota depois do link ser gerado.
    token: tokenAtivo ? uploadToken : null,
  };
}

// GET — cabeçalho da rota + paradas em ordem (usado por /rota/[token])
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const rota = await validarTokenRota(params.token);
  if (!rota) return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });

  return NextResponse.json({
    rota: {
      codigo: rota.codigo,
      data: rota.data,
      status: rota.status,
      motorista: rota.motorista ? { nome: rota.motorista.nome } : null,
    },
    paradas: rota.entregas.map(montarParada),
    expira: rota.uploadTokenExpira,
  });
}
