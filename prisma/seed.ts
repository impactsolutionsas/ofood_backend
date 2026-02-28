import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

async function main() {
  const pinHash = await bcrypt.hash('1234', SALT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { phone: '221770000000' },
    update: {},
    create: {
      firstName: 'Admin',
      lastName: 'OFood',
      phone: '221770000000',
      email: 'admin@ofood.sn',
      pinHash,
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log(`✅ Admin créé : ${admin.firstName} ${admin.lastName} (${admin.phone})`);
  console.log(`   PIN : 1234`);
  console.log(`   Role : ${admin.role}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
