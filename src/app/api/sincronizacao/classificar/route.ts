import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { classificarNf, type DadosNfClassificada } from "@/lib/classificar-nf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Trava de segurança: mesmo tamanho de lote de qualquer varredura razoável.
// Acima disso é sinal de uso indevido, não de sincronização normal.
const LIMITE_DOCUMENTOS = 300;

type ClassificadaComExistencia = DadosNfClassificada & { jaExiste: boolean };

/**
 * Classifica em FRETE ou COMPRA um lote de XMLs que o cliente já baixou
 * (grátis) do Meu Danfe — nenhuma chamada ao provedor acontece aqui. Também
 * marca o que já existe no TMS, para a tela nunca oferecer duplicata.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const documentos = Array.isArray(body?.documentos) ? body.documentos : [];

  if (documentos.length > LIMITE_DOCUMENTOS) {
    return NextResponse.json(
      { error: `Máximo de ${LIMITE_DOCUMENTOS} documentos por chamada.` },
      { status: 400 }
    );
  }

  const empresa = await prisma.configuracaoEmpresa.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  const cnpjsProprios = [empresa.cnpj, ...empresa.cnpjsAdicionais];

  const frete: DadosNfClassificada[] = [];
  const compras: DadosNfClassificada[] = [];
  const invalidos: string[] = [];

  for (const doc of documentos) {
    const chave = String(doc?.chave || "");
    const xml = String(doc?.xml || "");
    const classificada = classificarNf(xml, chave, cnpjsProprios);
    if (!classificada) {
      invalidos.push(chave);
      continue;
    }
    (classificada.classe === "FRETE" ? frete : compras).push(classificada);
  }

  const [notasExistentes, contasExistentes] = await Promise.all([
    frete.length > 0
      ? prisma.notaFiscal.findMany({
          where: { chaveAcesso: { in: frete.map((f) => f.chave) } },
          select: { chaveAcesso: true },
        })
      : Promise.resolve([]),
    compras.length > 0
      ? prisma.contaPagar.findMany({
          where: { chaveAcesso: { in: compras.map((c) => c.chave) } },
          select: { chaveAcesso: true },
        })
      : Promise.resolve([]),
  ]);

  const chavesFreteExistentes = new Set(notasExistentes.map((n) => n.chaveAcesso));
  const chavesComprasExistentes = new Set(contasExistentes.map((c) => c.chaveAcesso));

  const freteComExistencia: ClassificadaComExistencia[] = frete.map((f) => ({
    ...f,
    jaExiste: chavesFreteExistentes.has(f.chave),
  }));
  const comprasComExistencia: ClassificadaComExistencia[] = compras.map((c) => ({
    ...c,
    jaExiste: chavesComprasExistentes.has(c.chave),
  }));

  return NextResponse.json({
    frete: freteComExistencia,
    compras: comprasComExistencia,
    invalidos,
    empresa: { cnpj: empresa.cnpj, razaoSocial: empresa.razaoSocial },
  });
}
