import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ entregas: [], notas: [], clientes: [], rotas: [] });
  }

  const cnpjQ = q.replace(/\D/g, "");

  const [entregas, notas, clientes, rotas] = await Promise.all([
    // Entregas
    prisma.entrega.findMany({
      where: {
        OR: [
          { codigo: { contains: q, mode: "insensitive" } },
          { razaoSocial: { contains: q, mode: "insensitive" } },
          { cidade: { contains: q, mode: "insensitive" } },
          { endereco: { contains: q, mode: "insensitive" } },
          { bairro: { contains: q, mode: "insensitive" } },
          { cep: { contains: q, mode: "insensitive" } },
          { notas: { some: { numero: { contains: q } } } },
          ...(cnpjQ.length >= 4 ? [{ cnpj: { contains: cnpjQ } }] : []),
        ],
      },
      take: 6,
      select: { id: true, codigo: true, razaoSocial: true, cidade: true, endereco: true, status: true, notas: { select: { numero: true } } },
      orderBy: { updatedAt: "desc" },
    }),

    // Notas
    prisma.notaFiscal.findMany({
      where: {
        OR: [
          { numero: { contains: q } },
          { emitenteRazao: { contains: q, mode: "insensitive" } },
          { destinatarioRazao: { contains: q, mode: "insensitive" } },
          { endereco: { contains: q, mode: "insensitive" } },
          { bairro: { contains: q, mode: "insensitive" } },
          { cep: { contains: q, mode: "insensitive" } },
          ...(q.length === 44 ? [{ chaveAcesso: q }] : []),
        ],
      },
      take: 5,
      select: { id: true, numero: true, emitenteRazao: true, destinatarioRazao: true, entregaId: true },
      orderBy: { createdAt: "desc" },
    }),

    // Clientes
    prisma.cliente.findMany({
      where: {
        OR: [
          { razaoSocial: { contains: q, mode: "insensitive" } },
          ...(cnpjQ.length >= 4 ? [{ cnpj: { contains: cnpjQ } }] : []),
        ],
      },
      take: 4,
      select: { id: true, cnpj: true, razaoSocial: true },
    }),

    // Rotas
    prisma.rota.findMany({
      where: {
        OR: [
          { codigo: { contains: q, mode: "insensitive" } },
          { entregas: { some: { 
            OR: [
              { cidade: { contains: q, mode: "insensitive" } },
              { notas: { some: { numero: { contains: q } } } }
            ]
          } } }
        ],
      },
      take: 5,
      select: { 
        id: true, 
        codigo: true, 
        status: true, 
        data: true,
        entregas: { 
          select: { 
            notas: { select: { numero: true } } 
          },
          take: 1
        }
      },
    }),
  ]);

  const total = entregas.length + notas.length + clientes.length + rotas.length;

  return NextResponse.json({ entregas, notas, clientes, rotas, total });
}
