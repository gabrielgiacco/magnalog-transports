import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Categorias...");

  // Receitas
  const receita = await prisma.categoriaFinanceira.create({
    data: {
      nome: "Receitas de Frete",
      tipo: "RECEITA",
      subcategorias: {
        create: [
          { nome: "Faturamento" },
          { nome: "Armazenagem" }
        ]
      }
    }
  });

  // Despesas com Frota / Terceiros
  const despesaFrota = await prisma.categoriaFinanceira.create({
    data: {
      nome: "Frota / Terceiros",
      tipo: "DESPESA",
      subcategorias: {
        create: [
          { nome: "Pagamento Motorista" },
          { nome: "Adiantamento Motorista" },
          { nome: "Descarga (Chapa)" },
          { nome: "Vale / Pedágio" }
        ]
      }
    }
  });

  // Despesas Operacionais
  const despesaOperacional = await prisma.categoriaFinanceira.create({
    data: {
      nome: "Despesas Operacionais",
      tipo: "DESPESA",
      subcategorias: {
        create: [
          { nome: "Combustível" },
          { nome: "Manutenção" },
          { nome: "Aluguel" }
        ]
      }
    }
  });

  console.log("Categorias inseridas!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
