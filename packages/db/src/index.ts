import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load environment variables from the root .env file
dotenv.config({ path: '../../../.env' });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
