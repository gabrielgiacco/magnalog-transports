import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { parseNotaFiscalXML } from "@/lib/xml-parser";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireApi();
    if (!auth.ok) return auth.response;

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });

    // Verify avaria exists
    const avaria = await prisma.avaria.findUnique({ where: { id: params.id } });
    if (!avaria) return NextResponse.json({ error: "Avaria não encontrada" }, { status: 404 });

    const results = { importadas: 0, duplicadas: 0, erros: [] as { arquivo: string; erro: string }[] };

    for (const file of files) {
      try {
        const xmlContent = await file.text();
        const nota = parseNotaFiscalXML(xmlContent);

        // Check duplicate
        const existing = await prisma.notaDevolucao.findUnique({
          where: { chaveAcesso: nota.chaveAcesso },
        });
        if (existing) {
          results.duplicadas++;
          continue;
        }

        await prisma.notaDevolucao.create({
          data: {
            avariaId: params.id,
            chaveAcesso: nota.chaveAcesso,
            numero: nota.numero,
            serie: nota.serie,
            emitenteCnpj: nota.emitenteCnpj,
            emitenteRazao: nota.emitenteRazao,
            destinatarioCnpj: nota.destinatarioCnpj,
            destinatarioRazao: nota.destinatarioRazao,
            dataEmissao: nota.dataEmissao,
            valorNota: nota.valorNota,
            xmlOriginal: xmlContent,
          },
        });
        results.importadas++;
      } catch (err: any) {
        results.erros.push({ arquivo: file.name, erro: err.message });
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireApi();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const devolucaoId = searchParams.get("devolucaoId");
    if (!devolucaoId) return NextResponse.json({ error: "devolucaoId obrigatório" }, { status: 400 });

    await prisma.notaDevolucao.delete({ where: { id: devolucaoId } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireApi();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { devolucaoId, status, responsavel, observacoes } = body;

    if (!devolucaoId) return NextResponse.json({ error: "devolucaoId obrigatório" }, { status: 400 });

    const data: any = {};
    if (status) data.status = status;
    if (responsavel !== undefined) data.responsavel = responsavel;
    if (observacoes !== undefined) data.observacoes = observacoes;

    // Auto-set date fields based on status
    if (status === "DEVOLVIDO_CLIENTE") data.dataRetorno = new Date();
    if (status === "RETIRADO") data.dataRetirada = new Date();
    if (status === "DESCARTADO") data.dataDescarte = new Date();

    const devolucao = await prisma.notaDevolucao.update({
      where: { id: devolucaoId },
      data,
    });

    return NextResponse.json(devolucao);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
