const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function main() {
  const hash = await bcrypt.hash('12345678', 10);
  await prisma.user.update({
    where: { email: 'monitoramento@docemineiro.ind.br' },
    data: { password: hash }
  });
  console.log('Password reset to 12345678');
}
main().catch(console.error).finally(() => prisma.$disconnect());
