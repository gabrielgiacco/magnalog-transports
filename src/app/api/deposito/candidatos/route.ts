import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { buscarCandidatos, type OrigemCandidato } from "@/lib/deposito-candidatos";

export const dynamic = "force-dynamic";

// Lista de candidatos a entrada automática no Depósito: três origens
// mutuamente exclusivas (NFD pendente, avaria em aberto sem NFD, NF de
// entrega em ocorrência) — ver src/lib/deposito-candidatos.ts. NÃO existe
// candidato automático para ARMAZENAGEM: essa consulta seria todo o backlog
// de armazenagem, já coberto em outra tela. Armazenagem entra só manual.
export async function GET(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const origemFiltro = searchParams.get("origem") as OrigemCandidato | null;
  const takeParam = parseInt(searchParams.get("take") || "200", 10);
  const take = Math.min(Math.max(Number.isFinite(takeParam) ? takeParam : 200, 1), 300);

  const candidatos = await buscarCandidatos(prisma, take);

  // Totais sobre o conjunto bruto (antes de origem/q), pro badge de cada aba
  // não mudar quando o usuário filtra dentro de uma aba.
  const totais = {
    NOTA_DEVOLUCAO: candidatos.filter((c) => c.origem === "NOTA_DEVOLUCAO").length,
    AVARIA: candidatos.filter((c) => c.origem === "AVARIA").length,
    ENTREGA: candidatos.filter((c) => c.origem === "ENTREGA").length,
  };

  let filtrados = origemFiltro ? candidatos.filter((c) => c.origem === origemFiltro) : candidatos;
  if (q) {
    const alvo = normalizar(q);
    filtrados = filtrados.filter((c) =>
      normalizar(`${c.referencia} ${c.descricao} ${c.embarcadorRazao} ${c.notaNumero ?? ""}`).includes(alvo),
    );
  }

  return NextResponse.json({ candidatos: filtrados, totais });
}

// Normalização em memória: tira acento e caixa pra "joao" achar "João".
function normalizar(v: string): string {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
