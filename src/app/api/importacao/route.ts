import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";
import { parseNotaFiscalXML } from "@/lib/xml-parser";
import { parseCTeXML } from "@/lib/cte-parser";
import { geocodeAddress } from "@/lib/geocode";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });

    const results = {
      importadas: 0,
      duplicadas: 0,
      agrupadas: 0,
      ctesImportados: 0,
      erros: [] as { arquivo: string; erro: string }[],
      notas: [] as any[],
      ctes: [] as any[],
    };

    for (const file of files) {
      try {
        const xmlContent = await file.text();

        // Identifica se é XML de CT-e
        if (xmlContent.includes("<CTe") || xmlContent.includes("<cteProc")) {
          const cteData = parseCTeXML(xmlContent);

          let existingCte = await prisma.cTe.findUnique({
            where: { chaveAcesso: cteData.chaveCte },
          });

          let isDuplicate = false;

          if (existingCte) {
            isDuplicate = true;
          } else {
            existingCte = await prisma.cTe.create({
              data: {
                chaveAcesso: cteData.chaveCte,
                numero: cteData.numero,
                serie: cteData.serie,
                dataEmissao: cteData.dataEmissao,
                valorReceber: cteData.valorReceber,
                valorPedagio: cteData.valorPedagio,
                emitenteCnpj: cteData.emitenteCnpj,
                emitenteNome: cteData.emitenteNome,
                tomadorCnpj: cteData.tomadorCnpj,
                tomadorNome: cteData.tomadorNome,
              },
            });
          }

          // Sempre tenta vincular NFs e atualizar frete — mesmo se CTE já existia
          let notasVinculadas = 0;
          let debugInfo: any = { chavesNFeDoCte: cteData.chavesNFe, notasEncontradas: 0, entregasAtualizadas: 0 };

          if (cteData.chavesNFe.length > 0) {
            // Busca TODAS as notas que batem com as chaves do CTE
            const notasNoBanco = await prisma.notaFiscal.findMany({
              where: { chaveAcesso: { in: cteData.chavesNFe } },
              select: { id: true, entregaId: true, cteId: true, chaveAcesso: true, numero: true },
            });

            debugInfo.notasEncontradas = notasNoBanco.length;
            debugInfo.notasDetalhes = notasNoBanco.map(n => ({ id: n.id, numero: n.numero, chave: n.chaveAcesso?.substring(0, 10) + "...", entregaId: n.entregaId }));

            if (notasNoBanco.length > 0) {
              // Vincula notas que ainda não estão linkadas a este CTE
              const notasSemVinculo = notasNoBanco.filter((n) => n.cteId !== existingCte.id);
              if (notasSemVinculo.length > 0) {
                await prisma.notaFiscal.updateMany({
                  where: { id: { in: notasSemVinculo.map((n) => n.id) } },
                  data: { cteId: existingCte.id },
                });
              }

              // SEMPRE atualiza o valorFrete das entregas
              const entregaIds = Array.from(new Set(notasNoBanco.map((n) => n.entregaId).filter(Boolean))) as string[];
              debugInfo.entregasAtualizadas = entregaIds.length;
              if (entregaIds.length > 0) {
                const valorRateado = cteData.valorReceber / entregaIds.length;
                debugInfo.valorRateadoPorEntrega = valorRateado;
                for (const eId of entregaIds) {
                  await prisma.entrega.update({
                    where: { id: eId },
                    data: { valorFrete: valorRateado },
                  });
                }
              }

              notasVinculadas = notasNoBanco.length;
            } else {
              // FALLBACK: tenta buscar entregas diretamente pela chaveAcesso da entrega
              debugInfo.fallback = "Buscando entregas pela chaveAcesso diretamente...";
              const entregasDiretas = await prisma.entrega.findMany({
                where: { chaveAcesso: { in: cteData.chavesNFe } },
                select: { id: true, chaveAcesso: true, codigo: true },
              });
              debugInfo.entregasDiretas = entregasDiretas.length;
              if (entregasDiretas.length > 0) {
                const valorRateado = cteData.valorReceber / entregasDiretas.length;
                for (const ent of entregasDiretas) {
                  await prisma.entrega.update({
                    where: { id: ent.id },
                    data: { valorFrete: valorRateado },
                  });
                }
                notasVinculadas = entregasDiretas.length;
                debugInfo.entregasAtualizadas = entregasDiretas.length;
              }
            }
          } else {
            debugInfo.aviso = "CTE não contém chaves de NFe referenciadas";
          }

          if (isDuplicate && notasVinculadas === 0) {
            results.duplicadas++;
            results.erros.push({ arquivo: file.name, erro: `CTE duplicado. Debug: ${JSON.stringify(debugInfo)}` });
            continue;
          }

          results.ctes.push({
            numero: cteData.numero,
            tomador: cteData.tomadorNome,
            valor: cteData.valorReceber,
            vinculadas: notasVinculadas,
            reprocessado: isDuplicate,
            debug: debugInfo,
          });
          results.ctesImportados++;
          continue;
        }

        // Se checamos até aqui e não é CT-e, processamos como NF-e
        const nota = parseNotaFiscalXML(xmlContent);

        // 1. Verificar duplicidade pela chave de acesso
        const existing = await prisma.notaFiscal.findUnique({
          where: { chaveAcesso: nota.chaveAcesso },
        });

        if (existing) {
          // Se a NF é órfã (entrega foi deletada), deletar para permitir reimportação
          if (!existing.entregaId) {
            await prisma.notaFiscal.delete({ where: { id: existing.id } });
          } else {
            results.duplicadas++;
            continue;
          }
        }

        // 2. Buscar ou criar cliente
        let cliente = await prisma.cliente.findUnique({
          where: { cnpj: nota.destinatarioCnpj },
        });

        if (!cliente) {
          cliente = await prisma.cliente.create({
            data: {
              cnpj: nota.destinatarioCnpj,
              razaoSocial: nota.destinatarioRazao,
            },
          });
        }

        // 3. Lógica de agrupamento automático (fracionado)
        // Somente agrupa notas se forem adicionadas no MESMO DIA (pela data de criação da entrega)
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const fimDeHoje = new Date(hoje);
        fimDeHoje.setHours(23, 59, 59, 999);

        const entregaExistente = await prisma.entrega.findFirst({
          where: {
            cnpj: nota.destinatarioCnpj,
            status: { notIn: ["ENTREGUE", "FINALIZADO", "OCORRENCIA"] },
            notas: { some: { emitenteCnpj: nota.emitenteCnpj } },
            createdAt: { gte: hoje, lte: fimDeHoje },
          },
          orderBy: { createdAt: "desc" },
        });

        let entregaId: string;

        if (entregaExistente) {
          await prisma.entrega.update({
            where: { id: entregaExistente.id },
            data: {
              pesoTotal: { increment: nota.pesoBruto },
              volumeTotal: { increment: nota.volumes },
              codigo: { set: `${entregaExistente.codigo} / ${nota.numero}` }
            },
          });
          entregaId = entregaExistente.id;
          results.agrupadas++;
        } else {
          const codigo = nota.numero;

          const novaEntrega = await prisma.entrega.create({
            data: {
              codigo,
              clienteId: cliente.id,
              cnpj: nota.destinatarioCnpj,
              razaoSocial: nota.destinatarioRazao,
              cidade: nota.cidade,
              uf: nota.uf,
              endereco: nota.endereco,
              bairro: nota.bairro,
              cep: nota.cep,
              pesoTotal: nota.pesoBruto,
              volumeTotal: nota.volumes,
              dataChegada: new Date(),
              status: "PROGRAMADO",
              chaveAcesso: nota.chaveAcesso,
              // Tenta geocodificar no momento da criação
              ...(await geocodeAddress(nota).then(coords => coords ? { latitude: coords.lat, longitude: coords.lng } : {}))
            },
          });
          entregaId = novaEntrega.id;
          results.importadas++;
        }

        // 4. Criar nota fiscal
        const notaCriada = await prisma.notaFiscal.create({
          data: {
            chaveAcesso: nota.chaveAcesso,
            numero: nota.numero,
            serie: nota.serie,
            emitenteCnpj: nota.emitenteCnpj,
            emitenteRazao: nota.emitenteRazao,
            destinatarioCnpj: nota.destinatarioCnpj,
            destinatarioRazao: nota.destinatarioRazao,
            cidade: nota.cidade,
            uf: nota.uf,
            endereco: nota.endereco,
            bairro: nota.bairro,
            cep: nota.cep,
            volumes: nota.volumes,
            pesoBruto: nota.pesoBruto,
            valorNota: nota.valorNota,
            dataEmissao: nota.dataEmissao,
            entregaId,
            xmlOriginal: nota.xmlOriginal,
          },
          include: { entrega: { select: { codigo: true } } },
        });

        results.notas.push({
          numero: nota.numero,
          destinatario: nota.destinatarioRazao,
          cidade: nota.cidade,
          peso: nota.pesoBruto,
          volumes: nota.volumes,
          entrega: notaCriada.entrega?.codigo,
          agrupada: !!entregaExistente,
        });
      } catch (err: any) {
        results.erros.push({ arquivo: file.name, erro: err.message });
      }
    }

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    const [notas, total] = await Promise.all([
      prisma.notaFiscal.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { entrega: { select: { id: true, codigo: true, status: true } } },
      }),
      prisma.notaFiscal.count(),
    ]);

    return NextResponse.json({ notas, total, pages: Math.ceil(total / limit) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
