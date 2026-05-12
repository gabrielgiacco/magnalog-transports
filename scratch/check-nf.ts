import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const numero = "134723";
  console.log(`Investigando NF: ${numero}`);

  const nota = await prisma.notaFiscal.findFirst({
    where: { numero },
    include: {
      entrega: {
        select: {
          id: true,
          codigo: true,
          status: true,
          rotaId: true,
          latitude: true,
          longitude: true,
          endereco: true,
          cidade: true
        }
      }
    }
  });

  if (!nota) {
    console.log("Nota Fiscal não encontrada.");
    return;
  }

  console.log("Dados da Nota:", JSON.stringify(nota, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
