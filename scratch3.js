const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.entrega.findMany({
  where: {
    notas: { some: { numero: { in: ['134726', '134725'] } } }
  },
  select: {
    id: true,
    notas: { select: { numero: true } },
    latitude: true,
    longitude: true,
    status: true,
    rotaId: true
  }
}).then(console.dir).finally(() => prisma.$disconnect());
