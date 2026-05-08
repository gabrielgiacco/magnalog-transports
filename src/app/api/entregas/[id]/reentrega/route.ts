import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const originalEntrega = await prisma.entrega.findUnique({
    where: { id: params.id },
    include: { notas: true },
  });

  if (!originalEntrega) {
    return NextResponse.json({ error: "Entrega original não encontrada" }, { status: 404 });
  }

  // 1. Criar a nova entrega (Clone limpo)
  const clone = await prisma.entrega.create({
    data: {
      codigo: originalEntrega.codigo + "-R" + Math.floor(Math.random() * 1000), // Sufixo para diferenciar
      cnpj: originalEntrega.cnpj,
      razaoSocial: originalEntrega.razaoSocial,
      cidade: originalEntrega.cidade,
      uf: originalEntrega.uf,
      endereco: originalEntrega.endereco,
      bairro: originalEntrega.bairro,
      cep: originalEntrega.cep,
      clienteId: originalEntrega.clienteId,
      pesoTotal: originalEntrega.pesoTotal,
      volumeTotal: originalEntrega.volumeTotal,
      quantidadePaletes: originalEntrega.quantidadePaletes,
      
      // Limpar campos de tracking e financeiros para a nova viagem
      status: "PROGRAMADO",
      rotaId: null,
      motoristaId: null,
      veiculoId: null,
      dataChegada: originalEntrega.dataChegada,
      dataAgendada: null,
      dataEntrega: null,
      valorFrete: originalEntrega.valorFrete, // mantemos o valor de receita, ou talvez devesse zerar? mantendo.
      valorDescarga: originalEntrega.valorDescarga,
      valorArmazenagem: originalEntrega.valorArmazenagem,
      diasArmazenagem: originalEntrega.diasArmazenagem,
      
      // Zero custo da viagem atual, isso quem define é a nova rota
      valorMotorista: 0,
      valorSaida: 0,
      adiantamentoMotorista: 0,
      descontosMotorista: 0,
      saldoMotorista: 0,
      dataAdiantamento: null,
      dataPagamentoSaldo: null,
      statusCanhoto: "PENDENTE",
      observacoes: "Reentrega gerada a partir de falha anterior.",
    }
  });

  // 2. Mover as notas fiscais para o novo clone
  if (originalEntrega.notas.length > 0) {
    const notaIds = originalEntrega.notas.map(n => n.id);
    const notasNumeros = originalEntrega.notas.map(n => n.numero).join(", ");
    
    // Atualiza as notas para apontar para a nova entrega
    await prisma.notaFiscal.updateMany({
      where: { id: { in: notaIds } },
      data: { entregaId: clone.id }
    });

    // 3. Atualizar a entrega original para manter o histórico visível
    const notasMsg = `Tentativa Falha das NFs: ${notasNumeros}`;
    await prisma.entrega.update({
      where: { id: originalEntrega.id },
      data: {
        observacoes: originalEntrega.observacoes 
          ? originalEntrega.observacoes + "\n" + notasMsg 
          : notasMsg,
        codigo: originalEntrega.codigo + " (FALHA)",
      }
    });
  }

  return NextResponse.json({ ok: true, novaEntregaId: clone.id });
}
