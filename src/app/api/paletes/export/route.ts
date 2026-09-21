import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const dataInicio = searchParams.get("dataInicio");
  const dataFim = searchParams.get("dataFim");
  const incluirCancelados = searchParams.get("incluirCancelados") === "true";

  const where: any = {};
  if (!incluirCancelados) where.status = { not: "CANCELADO" };
  if (dataInicio || dataFim) {
    where.dataEmissao = {};
    if (dataInicio) where.dataEmissao.gte = new Date(dataInicio);
    if (dataFim) {
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      where.dataEmissao.lte = fim;
    }
  }

  const [movimentos, config] = await Promise.all([
    prisma.paleteMovimento.findMany({
      where,
      orderBy: { dataEmissao: "asc" },
    }),
    prisma.paleteConfig.findUnique({ where: { id: "default" } }),
  ]);

  const pool = config || {
    cnpjPool: "",
    razaoPool: "",
    glnPool: "",
    tipoPallet: "CHEP",
  };

  // Build rows matching the expected format (anexo 3)
  const rows = movimentos.map((m: any) => {
    // Origem = pool owner (Heinz); Destino = counterparty (the client we sent to or received from)
    const origemCnpj = pool.cnpjPool || "";
    const origemGln = pool.glnPool || "";
    const origemRazao = pool.razaoPool || "";
    const destinoCnpj = m.cnpjCliente || "";
    const destinoGln = m.glnCliente || "";
    const destinoRazao = m.razaoCliente || "";

    return {
      "CNPJ ORIGEM": origemCnpj,
      "GLID ORIGEM": origemGln,
      "RAZAO SOCIAL ORIGEM": origemRazao,
      "CNPJ DESTINO": destinoCnpj,
      "GLID DESTINO": destinoGln,
      "RAZAO SOCIAL DESTINO": destinoRazao,
      "DATA EMISSAO": m.dataEmissao ? new Date(m.dataEmissao).toLocaleDateString("pt-BR") : "",
      "NOTA FISCAL": m.nf,
      "PRODUTO": `PALETE ${m.tipoPallet || "CHEP"}`,
      "QUANTIDADE": m.quantidade,
      "MOVIMENTO": m.tipoMovimento === "SAIDA" ? "SAIDA" : "ENTRADA",
    };
  });

  // Create workbook
  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths similar to the example
  ws["!cols"] = [
    { wch: 16 }, // CNPJ ORIGEM
    { wch: 14 }, // GLID ORIGEM
    { wch: 30 }, // RAZAO ORIGEM
    { wch: 16 }, // CNPJ DESTINO
    { wch: 14 }, // GLID DESTINO
    { wch: 30 }, // RAZAO DESTINO
    { wch: 12 }, // DATA EMISSAO
    { wch: 12 }, // NOTA FISCAL
    { wch: 14 }, // PRODUTO
    { wch: 12 }, // QUANTIDADE
    { wch: 12 }, // MOVIMENTO
  ];

  // Apply header style (green background like the example)
  const headers = Object.keys(rows[0] || {});
  for (let i = 0; i < headers.length; i++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
    if (!ws[cellRef]) continue;
    ws[cellRef].s = {
      fill: { patternType: "solid", fgColor: { rgb: "548235" } },
      font: { bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } },
      },
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Movimentos");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const periodoStr = [
    dataInicio ? new Date(dataInicio).toLocaleDateString("pt-BR").replace(/\//g, "-") : "",
    dataFim ? new Date(dataFim).toLocaleDateString("pt-BR").replace(/\//g, "-") : "",
  ].filter(Boolean).join("_a_");
  const fileName = `controle_paletes_${periodoStr || "completo"}.xlsx`;

  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
