import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { buildEml, nomeArquivoEml } from "@/lib/eml";

export const dynamic = "force-dynamic";

// Monta o .eml a partir do corpoHtml JÁ PERSISTIDO — assim o arquivo baixado e
// o que foi para a área de transferência são o mesmo documento, sem risco de
// divergirem por uma regeneração.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const role = (session.user as any)?.role;
  if (!["ADMIN", "FINANCEIRO", "OPERACIONAL"].includes(role)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const s = await prisma.solicitacaoTicket.findUnique({
    where: { id: params.id },
    select: { numero: true, destinatarios: true, copia: true, assunto: true, corpoHtml: true },
  });
  if (!s) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });

  const eml = buildEml({
    para: s.destinatarios,
    copia: s.copia,
    assunto: s.assunto,
    html: s.corpoHtml,
  });

  return new NextResponse(Buffer.from(eml, "utf8"), {
    headers: {
      "Content-Type": "message/rfc822",
      "Content-Disposition": `attachment; filename="${nomeArquivoEml(s.numero)}"`,
    },
  });
}
