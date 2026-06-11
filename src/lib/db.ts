import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseUrl } from "@/lib/env";

const databaseUrl = getDatabaseUrl();

const adapter = new PrismaPg({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
});

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
