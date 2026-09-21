import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { XMLParser } from "fast-xml-parser";

function parsePaleteXML(xmlContent: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    numberParseOptions: { hex: false, leadingZeros: false, skipLike: /.*/ },
  });
  const parsed = parser.parse(xmlContent);
  const nfe = parsed?.nfeProc?.NFe || parsed?.NFe;
  const infNFe = nfe?.infNFe;
  if (!infNFe) throw new Error("XML inválido: infNFe não encontrado");

  const ide = infNFe.ide || {};
  const emit = infNFe.emit || {};
  const dest = infNFe.dest || {};
  const chaveAcesso = String(infNFe["@_Id"] || "").replace(/^NFe/, "");

  const nf = String(ide.nNF || "");
  const natOp = String(ide.natOp || "").toLowerCase();
  const dhEmi = String(ide.dhEmi || "");
  const dataEmissao = dhEmi ? new Date(dhEmi) : new Date();

  // Determine movimento from natOp
  let tipoMovimento: "SAIDA" | "ENTRADA" = "SAIDA";
  if (natOp.includes("devol") || natOp.includes("retorno") || natOp.includes("entrada")) {
    tipoMovimento = "ENTRADA";
  }

  // For SAIDA, counterparty is destinatário (emit=Magna Log, dest=cliente)
  // For ENTRADA (devolução), counterparty is emitente
  const counterpartyCnpj = tipoMovimento === "SAIDA"
    ? String(dest.CNPJ || dest.CPF || "")
    : String(emit.CNPJ || emit.CPF || "");
  const counterpartyRazao = tipoMovimento === "SAIDA"
    ? String(dest.xNome || "")
    : String(emit.xNome || "");

  // Sum pallet quantities across products (xProd contains "PALLET" or "PALETE")
  const detArray = Array.isArray(infNFe.det) ? infNFe.det : infNFe.det ? [infNFe.det] : [];
  let quantidade = 0;
  let produtoDesc = "";
  for (const d of detArray) {
    const p = d.prod || {};
    const xProd = String(p.xProd || "").toUpperCase();
    if (xProd.includes("PALLET") || xProd.includes("PALETE") || xProd.includes("PALET")) {
      quantidade += parseFloat(String(p.qCom || "0")) || 0;
      if (!produtoDesc) produtoDesc = String(p.xProd || "");
    }
  }

  // Fallback: if no pallet product detected, sum all qCom
  if (quantidade === 0 && detArray.length > 0) {
    for (const d of detArray) {
      const p = d.prod || {};
      quantidade += parseFloat(String(p.qCom || "0")) || 0;
      if (!produtoDesc) produtoDesc = String(p.xProd || "");
    }
  }

  return {
    nf,
    dataEmissao,
    quantidade: Math.round(quantidade),
    cnpjCliente: counterpartyCnpj,
    razaoCliente: counterpartyRazao,
    tipoMovimento,
    chaveAcessoNFe: chaveAcesso,
    produtoDesc,
    natOp: String(ide.natOp || ""),
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { xmls } = body; // array of { filename, content }

  if (!Array.isArray(xmls) || xmls.length === 0) {
    return NextResponse.json({ error: "Nenhum XML fornecido" }, { status: 400 });
  }

  const criados: any[] = [];
  const ignorados: { filename: string; motivo: string }[] = [];

  for (const { filename, content } of xmls) {
    try {
      const parsed = parsePaleteXML(content);

      // Check duplicate by chaveAcesso
      if (parsed.chaveAcessoNFe) {
        const existing = await prisma.paleteMovimento.findUnique({
          where: { chaveAcessoNFe: parsed.chaveAcessoNFe },
        });
        if (existing) {
          ignorados.push({ filename, motivo: "NF já importada" });
          continue;
        }
      }

      const movimento = await prisma.paleteMovimento.create({
        data: {
          nf: parsed.nf,
          tipoPallet: "CHEP",
          dataEmissao: parsed.dataEmissao,
          quantidade: parsed.quantidade,
          cnpjCliente: parsed.cnpjCliente.replace(/\D/g, ""),
          razaoCliente: parsed.razaoCliente,
          tipoMovimento: parsed.tipoMovimento,
          status: "PENDENTE",
          chaveAcessoNFe: parsed.chaveAcessoNFe || null,
          observacoes: parsed.natOp || null,
        },
      });
      criados.push(movimento);
    } catch (err: any) {
      ignorados.push({ filename, motivo: err.message || "Erro ao parsear XML" });
    }
  }

  return NextResponse.json({ criados: criados.length, ignorados, movimentos: criados });
}
