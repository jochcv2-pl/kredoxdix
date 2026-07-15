import { PrismaClient } from '@prisma/client';

// Singleton PrismaClient : en développement, le hot reload (Next.js, tsx...)
// recrée les modules et ouvrirait une nouvelle connexion à chaque fois,
// ce qui épuise le pool PostgreSQL. On accroche l'instance à globalThis.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
