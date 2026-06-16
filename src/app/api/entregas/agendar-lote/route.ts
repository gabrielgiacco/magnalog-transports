import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { action, items } = body;

    if (!action || !Array.isArray(items)) {
      return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
    }

    const responseItems = [];

    if (action === "validate") {
      for (const item of items) {
        const nfNumero = String(item.notaFiscal).trim();
        const dataStr = item.dataAgendada;

        if (!nfNumero) {
          responseItems.push({
            notaFiscal: item.notaFiscal,
            dataAgendada: dataStr,
            status: "invalido",
            motivo: "Número da Nota Fiscal vazio",
          });
          continue;
        }

        // Buscar NF no banco
        const nf = await prisma.notaFiscal.findFirst({
          where: { numero: nfNumero },
          include: {
            entrega: {
              select: {
                id: true,
                razaoSocial: true,
                cidade: true,
                uf: true,
                status: true,
                dataAgendada: true,
              },
            },
          },
        });

        if (!nf) {
          responseItems.push({
            notaFiscal: nfNumero,
            dataAgendada: dataStr,
            status: "invalido",
            motivo: "NF não localizada no sistema",
          });
        } else if (!nf.entrega) {
          responseItems.push({
            notaFiscal: nfNumero,
            dataAgendada: dataStr,
            status: "invalido",
            motivo: "Entrega associada não encontrada",
          });
        } else {
          const entrega = nf.entrega;
          const jaEntregue = ["ENTREGUE", "FINALIZADO"].includes(entrega.status);

          responseItems.push({
            notaFiscal: nfNumero,
            dataAgendada: dataStr,
            status: jaEntregue ? "invalido" : "valido",
            motivo: jaEntregue ? `Entrega já finalizada (Status: ${entrega.status})` : null,
            entregaId: entrega.id,
            razaoSocial: entrega.razaoSocial,
            cidade: `${entrega.cidade}${entrega.uf ? ` - ${entrega.uf}` : ""}`,
            dataAtual: entrega.dataAgendada ? new Date(entrega.dataAgendada).toISOString().split("T")[0] : null,
          });
        }
      }

      return NextResponse.json({ items: responseItems });
    }

    if (action === "confirm") {
      const updates = [];
      let updatedCount = 0;

      for (const item of items) {
        const nfNumero = String(item.notaFiscal).trim();
        const dataStr = item.dataAgendada;

        if (!nfNumero || !dataStr) continue;

        // Buscar NF para obter a entrega associada
        const nf = await prisma.notaFiscal.findFirst({
          where: { numero: nfNumero },
          select: {
            entregaId: true,
            entrega: {
              select: {
                status: true,
              },
            },
          },
        });

        if (nf && nf.entregaId && nf.entrega) {
          // Verificar se a entrega já não está em status finalizado
          if (["ENTREGUE", "FINALIZADO"].includes(nf.entrega.status)) {
            continue;
          }

          // Converter a data informada para o fuso correto
          const parsedDate = new Date(dataStr);
          if (isNaN(parsedDate.getTime())) continue;

          updates.push(
            prisma.entrega.update({
              where: { id: nf.entregaId },
              data: { dataAgendada: parsedDate },
            })
          );
          updatedCount++;
        }
      }

      // Executar todas as atualizações em uma transação
      if (updates.length > 0) {
        await prisma.$transaction(updates);
      }

      return NextResponse.json({ success: true, updatedCount });
    }

    return NextResponse.json({ error: "Ação não suportada" }, { status: 400 });
  } catch (error: any) {
    console.error("Erro no agendamento em lote:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
