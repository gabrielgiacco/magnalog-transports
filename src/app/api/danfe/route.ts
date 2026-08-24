import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import {
  baixarPdf, enviarXml, chaveValida, MeuDanfeError,
  FORMATOS_SOMENTE_NFE, type FormatoDanfe,
} from "@/lib/meudanfe";

export const dynamic = "force-dynamic";

const FORMATOS: FormatoDanfe[] = ["completo", "simplificado", "etiqueta", "cupom"];

/**
 * Devolve o DANFE/DACTE oficial em PDF, gerado pelo Meu Danfe.
 *
 * O download é gratuito, mas só funciona para documento que já está na Área do
 * Cliente. Notas que entraram no TMS por upload de XML não estão lá — nesse
 * caso enviamos o XML (também gratuito) e tentamos uma única vez mais.
 * A doc avisa que envios repetidos do mesmo XML bloqueiam a conta, então o
 * envio só acontece após um 404 e nunca em laço.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const chave = String(body.chave || "").trim();
  const formato = (body.formato || "completo") as FormatoDanfe;

  if (!chaveValida(chave)) {
    return NextResponse.json({ error: "Chave de acesso inválida." }, { status: 400 });
  }
  if (!FORMATOS.includes(formato)) {
    return NextResponse.json(
      { error: `Formato inválido. Use: ${FORMATOS.join(", ")}.` },
      { status: 400 }
    );
  }

  try {
    let pdf;
    try {
      pdf = await baixarPdf(chave, formato);
    } catch (e) {
      if (!(e instanceof MeuDanfeError) || e.status !== 404) throw e;

      // Não está na Área do Cliente. Se temos o XML guardado, envia e repete.
      const xml = body.xml || (await xmlDoBanco(chave));
      if (!xml) {
        throw new MeuDanfeError(
          "Documento não está na sua Área do Cliente do Meu Danfe e não há XML guardado para enviar.",
          404
        );
      }
      await enviarXml(xml);
      pdf = await baixarPdf(chave, formato);
    }

    if (pdf.tipo !== "NFE" && FORMATOS_SOMENTE_NFE.includes(formato)) {
      return NextResponse.json(
        { error: "Simplificado, etiqueta e cupom existem apenas para NF-e." },
        { status: 400 }
      );
    }

    return new NextResponse(pdf.bytes as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.nome}"`,
        "Content-Length": String(pdf.bytes.length),
      },
    });
  } catch (e: any) {
    if (e instanceof MeuDanfeError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[danfe] erro:", e);
    return NextResponse.json({ error: "Erro ao gerar o DANFE." }, { status: 500 });
  }
}

async function xmlDoBanco(chave: string): Promise<string | null> {
  const nota = await prisma.notaFiscal.findUnique({
    where: { chaveAcesso: chave },
    select: { xmlOriginal: true },
  });
  return nota?.xmlOriginal || null;
}
