import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { XMLParser } from "fast-xml-parser";

function parseNFXml(xmlContent: string | null) {
  if (!xmlContent) return { produtos: [], infAdicionais: "", infFisco: "", emitente: null, destinatario: null, volumes: 0, pesoBruto: 0 };
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseAttributeValue: false,
      numberParseOptions: { hex: false, leadingZeros: false, skipLike: /.*/ },
    });
    const parsed = parser.parse(xmlContent);
    const nfe = parsed?.nfeProc?.NFe || parsed?.NFe;
    const infNFe = nfe?.infNFe;
    if (!infNFe) return { produtos: [], infAdicionais: "", infFisco: "", emitente: null, destinatario: null, volumes: 0, pesoBruto: 0 };

    const detArray = Array.isArray(infNFe.det) ? infNFe.det : infNFe.det ? [infNFe.det] : [];
    const produtos = detArray.map((d: any) => {
      const p = d.prod || {};
      return {
        codigoProduto: String(p.cProd || ""),
        descricao: String(p.xProd || ""),
        ncm: String(p.NCM || ""),
        cfop: String(p.CFOP || ""),
        unidade: String(p.uCom || ""),
        quantidade: parseFloat(String(p.qCom || "0")) || 0,
        valorUnitario: parseFloat(String(p.vUnCom || "0")) || 0,
        valorTotal: parseFloat(String(p.vProd || "0")) || 0,
      };
    });

    const infAdic = infNFe.infAdic || {};
    const emit = infNFe.emit || {};
    const enderEmit = emit.enderEmit || {};
    const dest = infNFe.dest || {};
    const enderDest = dest.enderDest || {};
    const transp = infNFe.transp || {};
    const vols = Array.isArray(transp.vol) ? transp.vol : transp.vol ? [transp.vol] : [];

    return {
      produtos,
      infAdicionais: String(infAdic.infCpl || ""),
      infFisco: String(infAdic.infAdFisco || ""),
      emitente: {
        razaoSocial: String(emit.xNome || ""),
        fantasia: String(emit.xFant || ""),
        cnpj: String(emit.CNPJ || emit.CPF || ""),
        ie: String(emit.IE || ""),
        cidade: String(enderEmit.xMun || ""),
        uf: String(enderEmit.UF || ""),
        endereco: `${enderEmit.xLgr || ""} ${enderEmit.nro || ""}`.trim(),
        bairro: String(enderEmit.xBairro || ""),
        telefone: String(enderEmit.fone || ""),
      },
      destinatario: {
        razaoSocial: String(dest.xNome || ""),
        cnpj: String(dest.CNPJ || dest.CPF || ""),
        cidade: String(enderDest.xMun || ""),
        uf: String(enderDest.UF || ""),
      },
      volumes: vols.reduce((s: number, v: any) => s + (parseInt(String(v.qVol || "0")) || 0), 0),
      pesoBruto: vols.reduce((s: number, v: any) => s + (parseFloat(String(v.pesoB || "0")) || 0), 0),
    };
  } catch {
    return { produtos: [], infAdicionais: "", infFisco: "", emitente: null, destinatario: null, volumes: 0, pesoBruto: 0 };
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const avaria = await prisma.avaria.findUnique({
      where: { id: params.id },
      include: {
        entrega: {
          select: { id: true, codigo: true, razaoSocial: true, cidade: true, uf: true, cnpj: true,
            motorista: { select: { id: true, nome: true } },
            notas: { select: { id: true, numero: true, emitenteRazao: true } },
          },
        },
        notaFiscal: true,
        motorista: { select: { id: true, nome: true, cpf: true, telefone: true } },
        rota: { select: { id: true, codigo: true } },
        registradoPor: { select: { id: true, name: true } },
        resolvidoPor: { select: { id: true, name: true } },
        produtos: {
          orderBy: { createdAt: "asc" },
          include: { notaFiscal: { select: { id: true, numero: true, emitenteRazao: true, emitenteCnpj: true } } },
        },
        devolucoes: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!avaria) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

    // Parse NF products if NF is linked
    let produtosNF: any[] = [];
    if (avaria.notaFiscal?.xmlOriginal) {
      const parsed = parseNFXml(avaria.notaFiscal.xmlOriginal);
      produtosNF = parsed.produtos;
    }

    const { notaFiscal, ...rest } = avaria;
    const nfSemXml = notaFiscal ? (() => { const { xmlOriginal, ...nf } = notaFiscal; return nf; })() : null;

    // Enrich devolucoes with parsed XML data
    const devolucoesEnriquecidas = avaria.devolucoes.map((d: any) => {
      const { xmlOriginal, ...devSemXml } = d;
      const parsed = parseNFXml(xmlOriginal);
      return { ...devSemXml, ...parsed };
    });

    return NextResponse.json({ ...rest, notaFiscal: nfSemXml, produtosNF, devolucoes: devolucoesEnriquecidas });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const user = session.user as any;
    const userId = user.id || user.userId;
    const body = await req.json();
    const data: any = {};

    if (body.status) data.status = body.status;
    if (body.resolucao !== undefined) data.resolucao = body.resolucao;
    if (body.observacoes !== undefined) data.observacoes = body.observacoes;
    if (body.valorPrejuizo !== undefined) data.valorPrejuizo = body.valorPrejuizo;
    if (body.descricao !== undefined) data.descricao = body.descricao;
    if (body.tipo) data.tipo = body.tipo;
    if (body.fase) data.fase = body.fase;
    if (body.dataChegada !== undefined) data.dataChegada = body.dataChegada ? new Date(body.dataChegada) : null;
    if (body.transportadoraChegada !== undefined) data.transportadoraChegada = body.transportadoraChegada || null;
    if (body.motoristaChegada !== undefined) data.motoristaChegada = body.motoristaChegada || null;
    if (body.placaChegada !== undefined) data.placaChegada = body.placaChegada || null;

    // Auto-set resolution metadata
    if (body.status === "RESOLVIDA" && !body.dataResolucao) {
      data.resolvidoPorId = userId;
      data.dataResolucao = new Date();
    }

    const avaria = await prisma.avaria.update({
      where: { id: params.id },
      data,
      include: {
        entrega: { select: { id: true, codigo: true, razaoSocial: true } },
        motorista: { select: { id: true, nome: true } },
        registradoPor: { select: { id: true, name: true } },
        resolvidoPor: { select: { id: true, name: true } },
        produtos: true,
        devolucoes: true,
      },
    });

    return NextResponse.json(avaria);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const user = session.user as any;
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    await prisma.avaria.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
