import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

const money = (n: number) => Number((n || 0).toFixed(2));

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const fatura = await prisma.faturaTransportadora.findUnique({
      where: { id: params.id },
      include: { itens: { orderBy: { createdAt: "asc" } } },
    });
    if (!fatura) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

    const rows = fatura.itens.map((it) => ({
      "Data Entrega": "",
      "NFs": it.nfs || "",
      "Cliente": it.destinatarioRazao || "",
      "Cidade": it.cidade || "",
      "Cód. Entrega": it.codigoEntrega,
      "CT-e": it.cteNumero || "",
      "Valor CT-e": money(it.cteValorTotal),
      "% CT-e": money(it.valorPercentualCTE),
      "Taxa Entrega": money(it.valorTaxaEntrega),
      "Paletização": money(it.valorPaletizacao),
      "Armazenagem": money(it.valorArmazenagem),
      "Diária": money(it.valorDiaria),
      "Descarga": money(it.valorDescarga),
      "Total": money(it.subtotal),
    }));

    rows.push({
      "Data Entrega": "",
      "NFs": "",
      "Cliente": "",
      "Cidade": "",
      "Cód. Entrega": "",
      "CT-e": "TOTAIS",
      "Valor CT-e": 0,
      "% CT-e": money(fatura.valorPercentualCTE),
      "Taxa Entrega": money(fatura.valorTaxaEntrega),
      "Paletização": money(fatura.valorPaletizacao),
      "Armazenagem": money(fatura.valorArmazenagem),
      "Diária": money(fatura.valorDiarias),
      "Descarga": money(fatura.valorDescarga),
      "Total": money(fatura.valorTotal),
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Faturamento");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const filename = `${fatura.numero}_${fatura.transportadoraNome.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
