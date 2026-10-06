import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { buscarLinhasRelatorio, lerFiltros } from "@/lib/avarias-relatorio";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

const CABECALHO = [
  "Código", "Data", "Tipo", "Fase", "Status", "NF", "Embarcador", "Destinatário",
  "Cód. produto", "Produto", "Unidade", "Qtd. NF", "Qtd. divergência", "Valor (R$)",
  "Transportadora", "Placa", "Local", "Descrição", "Resolução",
];

const LARGURAS = [
  12, 12, 12, 14, 12, 12, 28, 28, 14, 34, 9, 10, 16, 12, 22, 10, 18, 40, 40,
];

// Primeira palavra do nome, minúscula e sem acento, para o nome do arquivo.
const slugEmbarcador = (nome: string) =>
  nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).find(Boolean) || "todos";

export async function GET(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const filtros = lerFiltros(new URL(req.url).searchParams);
  const linhas = await buscarLinhasRelatorio(filtros);

  const rows = linhas.map((l) => ({
    "Código": l.codigo,
    // dataOcorrencia fica em meia-noite UTC; sem timeZone UTC mostraria o dia anterior
    "Data": l.data.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
    "Tipo": l.tipo,
    "Fase": l.fase,
    "Status": l.status,
    "NF": l.nf,
    "Embarcador": l.embarcador,
    "Destinatário": l.destinatario,
    "Cód. produto": l.codigoProduto,
    "Produto": l.produto,
    "Unidade": l.unidade,
    "Qtd. NF": l.qtdNF ?? "",
    "Qtd. divergência": l.qtdDivergencia ?? "",
    "Valor (R$)": l.valor,
    "Transportadora": l.transportadora,
    "Placa": l.placa,
    "Local": l.local,
    "Descrição": l.descricao,
    "Resolução": l.resolucao,
  }));

  // header explícito: com lista vazia json_to_sheet perderia o cabeçalho
  const ws = XLSX.utils.json_to_sheet(rows, { header: CABECALHO });
  ws["!cols"] = LARGURAS.map((wch) => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Avarias e faltas");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const hoje = new Date().toISOString().slice(0, 10);
  const slug = filtros.embarcador && linhas.length > 0 ? slugEmbarcador(linhas[0].embarcador) : "todos";

  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="avarias_${slug}_${hoje}.xlsx"`,
    },
  });
}
