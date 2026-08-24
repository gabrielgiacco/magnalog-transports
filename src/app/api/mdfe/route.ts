import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import {
  parseMdfeXML, parseEncerramentoMdfe,
  ehXmlMdfe, ehEventoEncerramentoMdfe,
} from "@/lib/mdfe-parser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q");

  const where: any = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { numero: { contains: q } },
      { chaveAcesso: { contains: q } },
      { placaTracao: { contains: q, mode: "insensitive" } },
      { condutorNome: { contains: q, mode: "insensitive" } },
    ];
  }

  const mdfes = await prisma.mdfe.findMany({
    where,
    orderBy: { dataInicioViagem: "desc" },
    take: 200,
    include: {
      rota: { select: { id: true, codigo: true } },
      _count: { select: { documentos: true } },
    },
  });

  return NextResponse.json({ mdfes });
}

/**
 * Importa XML de MDF-e ou do evento de encerramento (tpEvento 110112).
 * O mesmo campo aceita os dois: distingue pelo conteudo.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];
  if (!files.length) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });

  const resultado = {
    importados: 0,
    duplicados: 0,
    encerrados: 0,
    vinculados: 0,
    erros: [] as { arquivo: string; erro: string }[],
  };

  for (const file of files) {
    try {
      const xml = await file.text();

      // Encerramento primeiro: o XML do evento tambem contem "MDFe" e cairia
      // no parser do manifesto se a ordem fosse invertida.
      if (ehEventoEncerramentoMdfe(xml)) {
        const enc = parseEncerramentoMdfe(xml);
        const alvo = await prisma.mdfe.findUnique({ where: { chaveAcesso: enc.chaveAcesso } });
        if (!alvo) {
          resultado.erros.push({ arquivo: file.name, erro: "Encerramento de um MDF-e que nao esta importado" });
          continue;
        }
        await prisma.mdfe.update({
          where: { id: alvo.id },
          data: {
            status: "ENCERRADO",
            encerradoEm: enc.dataEncerramento || new Date(),
            encerradoPor: "EVENTO",
            protocoloEncerramento: enc.protocolo,
          },
        });
        resultado.encerrados++;
        continue;
      }

      if (!ehXmlMdfe(xml)) {
        resultado.erros.push({ arquivo: file.name, erro: "Nao parece um XML de MDF-e" });
        continue;
      }

      const m = parseMdfeXML(xml);

      const existente = await prisma.mdfe.findUnique({ where: { chaveAcesso: m.chaveAcesso } });
      if (existente) { resultado.duplicados++; continue; }

      // Vinculo com Rota: melhor esforco por placa + data da viagem.
      // Na operacao da Magna Log a carreta manifestada quase nunca vira Rota
      // (as Rotas sao a distribuicao), entao ficar sem vinculo e o normal.
      let rotaId: string | null = null;
      if (m.placaTracao && m.dataInicioViagem) {
        const de = new Date(m.dataInicioViagem); de.setHours(0, 0, 0, 0);
        const ate = new Date(m.dataInicioViagem); ate.setHours(23, 59, 59, 999);
        const candidatas = await prisma.rota.findMany({
          where: {
            data: { gte: de, lte: ate },
            veiculo: { placa: { contains: m.placaTracao, mode: "insensitive" } },
          },
          select: { id: true },
          take: 2,
        });
        if (candidatas.length === 1) { rotaId = candidatas[0].id; resultado.vinculados++; }
      }

      await prisma.mdfe.create({
        data: {
          chaveAcesso: m.chaveAcesso,
          numero: m.numero,
          serie: m.serie,
          modelo: m.modelo,
          emitenteCnpj: m.emitenteCnpj,
          emitenteNome: m.emitenteNome,
          ufInicio: m.ufInicio,
          ufFim: m.ufFim,
          municipioCarregamento: m.municipioCarregamento,
          dataEmissao: m.dataEmissao,
          dataInicioViagem: m.dataInicioViagem,
          placaTracao: m.placaTracao,
          placaReboque: m.placaReboque,
          rntrc: m.rntrc,
          condutorNome: m.condutorNome,
          condutorCpf: m.condutorCpf,
          contratanteCnpj: m.contratanteCnpj,
          qtdCTe: m.qtdCTe,
          qtdNFe: m.qtdNFe,
          valorCarga: m.valorCarga,
          pesoCarga: m.pesoCarga,
          cStat: m.cStat,
          rotaId,
          xmlOriginal: xml,
          documentos: { create: m.documentos },
        },
      });
      resultado.importados++;
    } catch (e: any) {
      resultado.erros.push({ arquivo: file.name, erro: e.message || "Erro ao processar" });
    }
  }

  return NextResponse.json(resultado);
}
