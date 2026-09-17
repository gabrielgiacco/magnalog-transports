import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { parseNotaFiscalXML } from "@/lib/xml-parser";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApi();
    if (!auth.ok) return auth.response;
    const session = auth.session;

    const user = session.user as any;
    const userId = user.id || user.userId;

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });

    const results = { importadas: 0, duplicadas: 0, mescladas: 0, erros: [] as { arquivo: string; erro: string }[] };

    // Cache de avarias encontradas/criadas por emitenteCnpj neste batch
    const avariaCache: Record<string, string> = {};

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

        let avariaId = avariaCache[nota.emitenteCnpj];

        if (!avariaId) {
          // Buscar avaria DEVOLUCAO PENDENTE existente com NFD do mesmo emitente CNPJ
          const existingDev = await prisma.notaDevolucao.findFirst({
            where: {
              emitenteCnpj: nota.emitenteCnpj,
              avaria: { tipo: "DEVOLUCAO", status: "PENDENTE" },
            },
            select: { avariaId: true },
          });

          if (existingDev) {
            avariaId = existingDev.avariaId;
            results.mescladas++;
          }
        }

        if (!avariaId) {
          // Criar nova avaria
          const lastAvaria = await prisma.avaria.findFirst({ orderBy: { createdAt: "desc" }, select: { codigo: true } });
          const lastNum = lastAvaria ? parseInt(lastAvaria.codigo.replace("AVR-", "")) || 0 : 0;
          const codigo = `AVR-${String(lastNum + 1).padStart(5, "0")}`;

          const avaria = await prisma.avaria.create({
            data: {
              codigo,
              tipo: "DEVOLUCAO",
              fase: "DEVOLUCAO",
              status: "PENDENTE",
              dataOcorrencia: nota.dataEmissao || new Date(),
              descricao: `Devolução - ${nota.emitenteRazao}`,
              registradoPorId: userId,
            },
          });
          avariaId = avaria.id;
        }

        avariaCache[nota.emitenteCnpj] = avariaId;

        // Update avaria description to reflect multiple NFs
        const existingCount = await prisma.notaDevolucao.count({ where: { avariaId } });
        if (existingCount > 0) {
          await prisma.avaria.update({
            where: { id: avariaId },
            data: { descricao: `Devolução - ${nota.emitenteRazao} (${existingCount + 1} NFs)` },
          });
        }

        await prisma.notaDevolucao.create({
          data: {
            avariaId,
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

// Mesclar avarias existentes que têm mesmo emitente CNPJ
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireApi();
    if (!auth.ok) return auth.response;

    // Buscar todas as avarias do tipo DEVOLUCAO com suas NFDs
    const avarias = await prisma.avaria.findMany({
      where: { tipo: "DEVOLUCAO" },
      include: { devolucoes: { select: { id: true, emitenteCnpj: true, emitenteRazao: true } } },
      orderBy: { createdAt: "asc" },
    });

    // Agrupar por emitenteCnpj
    const groups: Record<string, { mainAvariaId: string; mergeAvariaIds: string[]; razao: string; totalNfs: number }> = {};

    for (const av of avarias) {
      if (av.devolucoes.length === 0) continue;
      const cnpj = av.devolucoes[0].emitenteCnpj;
      if (!groups[cnpj]) {
        groups[cnpj] = { mainAvariaId: av.id, mergeAvariaIds: [], razao: av.devolucoes[0].emitenteRazao, totalNfs: av.devolucoes.length };
      } else {
        groups[cnpj].mergeAvariaIds.push(av.id);
        groups[cnpj].totalNfs += av.devolucoes.length;
      }
    }

    let mescladas = 0;
    let removidas = 0;

    for (const [cnpj, group] of Object.entries(groups)) {
      if (group.mergeAvariaIds.length === 0) continue;

      // Mover todas as NFDs para a avaria principal
      for (const mergeId of group.mergeAvariaIds) {
        await prisma.notaDevolucao.updateMany({
          where: { avariaId: mergeId },
          data: { avariaId: group.mainAvariaId },
        });
        // Deletar a avaria vazia
        await prisma.avaria.delete({ where: { id: mergeId } });
        removidas++;
      }

      // Atualizar descrição da avaria principal
      const count = await prisma.notaDevolucao.count({ where: { avariaId: group.mainAvariaId } });
      await prisma.avaria.update({
        where: { id: group.mainAvariaId },
        data: { descricao: `Devolução - ${group.razao}${count > 1 ? ` (${count} NFs)` : ""}` },
      });
      mescladas++;
    }

    return NextResponse.json({ mescladas, removidas });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
