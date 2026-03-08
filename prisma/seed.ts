import { PrismaClient, DishCategory, DayOfWeek } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

async function main() {
  console.log('🌱 Seed O\'Food Dakar...\n');

  const pinHash = await bcrypt.hash('1234', SALT_ROUNDS);

  // ─── Users ──────────────────────────────────────────

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

  const client = await prisma.user.upsert({
    where: { phone: '221771111111' },
    update: {},
    create: {
      firstName: 'Fatou',
      lastName: 'Diallo',
      phone: '221771111111',
      email: 'fatou@gmail.com',
      pinHash,
      role: 'CLIENT',
      isActive: true,
    },
  });

  const owner1 = await prisma.user.upsert({
    where: { phone: '221772222222' },
    update: {},
    create: {
      firstName: 'Moussa',
      lastName: 'Ndiaye',
      phone: '221772222222',
      email: 'moussa@gmail.com',
      pinHash,
      role: 'RESTAURANT_OWNER',
      isActive: true,
    },
  });

  const owner2 = await prisma.user.upsert({
    where: { phone: '221773333333' },
    update: {},
    create: {
      firstName: 'Awa',
      lastName: 'Seck',
      phone: '221773333333',
      email: 'awa@gmail.com',
      pinHash,
      role: 'RESTAURANT_OWNER',
      isActive: true,
    },
  });

  const owner3 = await prisma.user.upsert({
    where: { phone: '221774444444' },
    update: {},
    create: {
      firstName: 'Ibrahima',
      lastName: 'Fall',
      phone: '221774444444',
      email: 'ibrahima@gmail.com',
      pinHash,
      role: 'RESTAURANT_OWNER',
      isActive: true,
    },
  });

  // ─── Wallets ────────────────────────────────────────

  for (const user of [client, owner1, owner2, owner3]) {
    await prisma.wallet.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, balance: user.id === client.id ? 10000 : 0 },
    });
  }

  // ─── Restaurants ────────────────────────────────────

  const resto1 = await prisma.restaurant.upsert({
    where: { ownerId: owner1.id },
    update: {},
    create: {
      ownerId: owner1.id,
      name: 'Chez Moussa - Thiéboudienne Royal',
      logoUrl: 'https://placehold.co/200x200/e67e22/fff?text=CM',
      address: 'Rue Moussé Diop, Plateau, Dakar',
      lat: 14.6697,
      lng: -17.4380,
      description: 'Le meilleur thiéboudienne de Dakar. Cuisine sénégalaise traditionnelle préparée avec amour.',
      avgRating: 4.5,
      totalRatings: 28,
      isOpen: true,
      avgPrepTime: 25,
      dailyCapacity: '50',
      isVerified: true,
    },
  });

  const resto2 = await prisma.restaurant.upsert({
    where: { ownerId: owner2.id },
    update: {},
    create: {
      ownerId: owner2.id,
      name: 'Dibiterie Awa',
      logoUrl: 'https://placehold.co/200x200/e74c3c/fff?text=DA',
      address: 'Avenue Cheikh Anta Diop, Fann, Dakar',
      lat: 14.6932,
      lng: -17.4665,
      description: 'Dibi de qualité supérieure. Agneau et bœuf grillés à la braise, accompagnés de nos sauces maison.',
      avgRating: 4.2,
      totalRatings: 45,
      isOpen: true,
      avgPrepTime: 15,
      dailyCapacity: '80',
      isVerified: true,
    },
  });

  const resto3 = await prisma.restaurant.upsert({
    where: { ownerId: owner3.id },
    update: {},
    create: {
      ownerId: owner3.id,
      name: 'Le Lamantin Gourmand',
      logoUrl: 'https://placehold.co/200x200/27ae60/fff?text=LG',
      address: 'Route de Ngor, Almadies, Dakar',
      lat: 14.7445,
      lng: -17.5134,
      description: 'Fusion afro-moderne. Plats sénégalais revisités avec une touche contemporaine. Vue sur mer.',
      avgRating: 4.7,
      totalRatings: 62,
      isOpen: true,
      avgPrepTime: 30,
      dailyCapacity: '40',
      isVerified: true,
    },
  });

  // ─── Dishes ─────────────────────────────────────────

  // Chez Moussa
  const dishes1 = await Promise.all([
    prisma.dish.create({
      data: {
        restaurantId: resto1.id,
        name: 'Thiéboudienne (Riz au poisson)',
        description: 'Le plat national. Riz cassé, thiof frais, légumes de saison, sauce tomate maison.',
        price: 2500,
        category: DishCategory.LUNCH,
        isAvailable: true,
      },
    }),
    prisma.dish.create({
      data: {
        restaurantId: resto1.id,
        name: 'Yassa Poulet',
        description: 'Poulet mariné aux oignons caramélisés, citron vert et moutarde. Riz blanc parfumé.',
        price: 2000,
        category: DishCategory.LUNCH,
        isAvailable: true,
      },
    }),
    prisma.dish.create({
      data: {
        restaurantId: resto1.id,
        name: 'Mafé Bœuf',
        description: 'Ragoût de bœuf à la pâte d\'arachide, patate douce et légumes.',
        price: 2200,
        category: DishCategory.LUNCH,
        isAvailable: true,
      },
    }),
    prisma.dish.create({
      data: {
        restaurantId: resto1.id,
        name: 'Ndambé Baguette',
        description: 'Sandwich baguette garni de haricots niébé épicés, oignons et piment.',
        price: 500,
        category: DishCategory.BREAKFAST,
        isAvailable: true,
      },
    }),
    prisma.dish.create({
      data: {
        restaurantId: resto1.id,
        name: 'Lakh (Bouillie de mil)',
        description: 'Bouillie de mil au lait caillé et sucre. Le petit-déjeuner sénégalais par excellence.',
        price: 800,
        category: DishCategory.BREAKFAST,
        isAvailable: true,
      },
    }),
    prisma.dish.create({
      data: {
        restaurantId: resto1.id,
        name: 'Thiakry',
        description: 'Couscous de mil sucré au lait caillé vanillé et raisins secs.',
        price: 1000,
        category: DishCategory.DESSERT,
        isAvailable: true,
      },
    }),
  ]);

  // Dibiterie Awa
  const dishes2 = await Promise.all([
    prisma.dish.create({
      data: {
        restaurantId: resto2.id,
        name: 'Dibi Agneau (portion)',
        description: 'Agneau grillé à la braise, sauce oignon-moutarde, frites maison.',
        price: 3000,
        category: DishCategory.DINNER,
        isAvailable: true,
      },
    }),
    prisma.dish.create({
      data: {
        restaurantId: resto2.id,
        name: 'Dibi Bœuf (portion)',
        description: 'Bœuf tendre grillé au charbon, sauce piquante, ataya offert.',
        price: 2500,
        category: DishCategory.DINNER,
        isAvailable: true,
      },
    }),
    prisma.dish.create({
      data: {
        restaurantId: resto2.id,
        name: 'Fataya Viande (x5)',
        description: 'Beignets farcis à la viande hachée épicée. Croustillants à souhait.',
        price: 1000,
        category: DishCategory.BREAKFAST,
        isAvailable: true,
      },
    }),
    prisma.dish.create({
      data: {
        restaurantId: resto2.id,
        name: 'Sandwich Chawarma',
        description: 'Pain libanais, viande émincée, crudités, sauce blanche et harissa.',
        price: 1500,
        category: DishCategory.LUNCH,
        isAvailable: true,
      },
    }),
    prisma.dish.create({
      data: {
        restaurantId: resto2.id,
        name: 'Alloco Poisson',
        description: 'Banane plantain frite dorée avec poisson braisé et sauce tomate pimentée.',
        price: 1800,
        category: DishCategory.LUNCH,
        isAvailable: true,
      },
    }),
  ]);

  // Le Lamantin Gourmand
  const dishes3 = await Promise.all([
    prisma.dish.create({
      data: {
        restaurantId: resto3.id,
        name: 'Bowl Thiéboudienne Déstructuré',
        description: 'Version bowl du classique : riz basmati, thiof poêlé, légumes rôtis, sauce bisque.',
        price: 4500,
        category: DishCategory.LUNCH,
        isAvailable: true,
      },
    }),
    prisma.dish.create({
      data: {
        restaurantId: resto3.id,
        name: 'Ceebu Jën Noir (Thiéboudienne noir)',
        description: 'La version fumée au charbon. Riz noir, poisson braisé, fermenté maison.',
        price: 3500,
        category: DishCategory.LUNCH,
        isAvailable: true,
      },
    }),
    prisma.dish.create({
      data: {
        restaurantId: resto3.id,
        name: 'Brochettes de Gambas Yassa',
        description: 'Gambas marinées sauce yassa, riz à la coriandre, légumes croquants.',
        price: 5000,
        category: DishCategory.DINNER,
        isAvailable: true,
      },
    }),
    prisma.dish.create({
      data: {
        restaurantId: resto3.id,
        name: 'Salade Almadies',
        description: 'Mangue verte, avocat, crevettes, graines de sésame, vinaigrette passion.',
        price: 3000,
        category: DishCategory.LUNCH,
        isAvailable: true,
      },
    }),
    prisma.dish.create({
      data: {
        restaurantId: resto3.id,
        name: 'Pancakes Lakh',
        description: 'Pancakes au mil, coulis de lait caillé vanillé, fruits frais de saison.',
        price: 2000,
        category: DishCategory.BREAKFAST,
        isAvailable: true,
      },
    }),
    prisma.dish.create({
      data: {
        restaurantId: resto3.id,
        name: 'Fondant Chocolat Bissap',
        description: 'Fondant au chocolat noir infusé au bissap, glace vanille bourbon.',
        price: 2500,
        category: DishCategory.DESSERT,
        isAvailable: true,
      },
    }),
  ]);

  // ─── Menus (7 jours) ───────────────────────────────

  const days = [
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY,
    DayOfWeek.SUNDAY,
  ];

  // Chez Moussa — rotation de plats par jour
  for (const day of days) {
    const menu = await prisma.menu.upsert({
      where: { restaurantId_dayOfWeek: { restaurantId: resto1.id, dayOfWeek: day } },
      update: {},
      create: { restaurantId: resto1.id, dayOfWeek: day },
    });

    const dayDishes =
      ([DayOfWeek.SATURDAY, DayOfWeek.SUNDAY] as DayOfWeek[]).includes(day)
        ? [dishes1[0], dishes1[2], dishes1[5]] // weekend: thieb + mafé + thiakry
        : [dishes1[0], dishes1[1], dishes1[3]]; // semaine: thieb + yassa + ndambé

    for (const dish of dayDishes) {
      await prisma.menuItem.upsert({
        where: { menuId_dishId: { menuId: menu.id, dishId: dish.id } },
        update: {},
        create: { menuId: menu.id, dishId: dish.id },
      });
    }
  }

  // Dibiterie Awa — même menu tous les jours
  for (const day of days) {
    const menu = await prisma.menu.upsert({
      where: { restaurantId_dayOfWeek: { restaurantId: resto2.id, dayOfWeek: day } },
      update: {},
      create: { restaurantId: resto2.id, dayOfWeek: day },
    });

    const dayDishes =
      ([DayOfWeek.FRIDAY, DayOfWeek.SATURDAY] as DayOfWeek[]).includes(day)
        ? [dishes2[0], dishes2[1], dishes2[2], dishes2[3], dishes2[4]] // vendredi/samedi: tout
        : [dishes2[0], dishes2[1], dishes2[3]]; // semaine: dibi + chawarma

    for (const dish of dayDishes) {
      await prisma.menuItem.upsert({
        where: { menuId_dishId: { menuId: menu.id, dishId: dish.id } },
        update: {},
        create: { menuId: menu.id, dishId: dish.id },
      });
    }
  }

  // Le Lamantin Gourmand
  for (const day of days) {
    const menu = await prisma.menu.upsert({
      where: { restaurantId_dayOfWeek: { restaurantId: resto3.id, dayOfWeek: day } },
      update: {},
      create: { restaurantId: resto3.id, dayOfWeek: day },
    });

    const dayDishes =
      day === DayOfWeek.SUNDAY
        ? [dishes3[4], dishes3[3], dishes3[5]] // dimanche brunch: pancakes + salade + fondant
        : [dishes3[0], dishes3[1], dishes3[2], dishes3[3], dishes3[5]]; // reste de la semaine

    for (const dish of dayDishes) {
      await prisma.menuItem.upsert({
        where: { menuId_dishId: { menuId: menu.id, dishId: dish.id } },
        update: {},
        create: { menuId: menu.id, dishId: dish.id },
      });
    }
  }

  // ─── Résumé ─────────────────────────────────────────

  console.log('👤 Utilisateurs :');
  console.log(`   Admin    → ${admin.phone} (PIN: 1234)`);
  console.log(`   Client   → ${client.phone} (PIN: 1234) — Fatou Diallo`);
  console.log(`   Owner 1  → ${owner1.phone} (PIN: 1234) — Moussa Ndiaye`);
  console.log(`   Owner 2  → ${owner2.phone} (PIN: 1234) — Awa Seck`);
  console.log(`   Owner 3  → ${owner3.phone} (PIN: 1234) — Ibrahima Fall`);
  console.log('');
  console.log('🍽️  Restaurants :');
  console.log(`   ${resto1.name} — Plateau (${dishes1.length} plats)`);
  console.log(`   ${resto2.name} — Fann (${dishes2.length} plats)`);
  console.log(`   ${resto3.name} — Almadies (${dishes3.length} plats)`);
  console.log('');
  console.log('✅ Seed terminé !');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
