import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { parseNotaFiscalXML } from "@/lib/xml-parser";
import { XMLParser } from "fast-xml-parser";

export const dynamic = "force-dynamic";

function extractProdutos(xmlContent: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    numberParseOptions: { hex: false, leadingZeros: false, skipLike: /.*/ },
  });
  const parsed = parser.parse(xmlContent);
  const nfe = parsed?.nfeProc?.NFe || parsed?.NFe;
  const infNFe = nfe?.infNFe;
  if (!infNFe) return [];
  const detArray = Array.isArray(infNFe.det) ? infNFe.det : infNFe.det ? [infNFe.det] : [];
  return detArray.map((d: any) => {
    const p = d.prod || {};
    return {
      codigoProduto: String(p.cProd || ""),
      descricao: String(p.xProd || ""),
      ncm: String(p.NCM || ""),
      unidade: String(p.uCom || ""),
      quantidade: parseFloat(String(p.qCom || "0")) || 0,
      valorUnitario: parseFloat(String(p.vUnCom || "0")) || 0,
      valorTotal: parseFloat(String(p.vProd || "0")) || 0,
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    if (!files.length) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });

    const notas: any[] = [];
    const erros: { arquivo: string; erro: string }[] = [];

    for (const file of files) {
      try {
        const xmlContent = await file.text();
        const nota = parseNotaFiscalXML(xmlContent);
        const produtos = extractProdutos(xmlContent);

        // Upsert por chaveAcesso — se já existe, retorna a mesma NF (sem duplicar)
        const nf = await prisma.notaFiscal.upsert({
          where: { chaveAcesso: nota.chaveAcesso },
          update: {},
          create: {
            chaveAcesso: nota.chaveAcesso,
            numero: nota.numero,
            serie: nota.serie,
            emitenteCnpj: nota.emitenteCnpj,
            emitenteRazao: nota.emitenteRazao,
            destinatarioCnpj: nota.destinatarioCnpj,
            destinatarioRazao: nota.destinatarioRazao,
            cidade: nota.cidade || null,
            uf: nota.uf || null,
            endereco: nota.endereco || null,
            bairro: nota.bairro || null,
            cep: nota.cep || null,
            volumes: nota.volumes || 0,
            pesoBruto: nota.pesoBruto || 0,
            valorNota: nota.valorNota || 0,
            dataEmissao: nota.dataEmissao,
            xmlOriginal: xmlContent,
            entregaId: null,
          },
          select: {
            id: true, numero: true, serie: true,
            emitenteCnpj: true, emitenteRazao: true,
            destinatarioCnpj: true, destinatarioRazao: true,
            cidade: true, uf: true, valorNota: true, entregaId: true,
          },
        });

        notas.push({ ...nf, produtos });
      } catch (err: any) {
        erros.push({ arquivo: file.name, erro: err.message });
      }
    }

    return NextResponse.json({ notas, erros });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
