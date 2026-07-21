import { PrismaClient } from "@prisma/client";

// Single shared Prisma client. All queries go through Prisma's parameterised
// query builder, which is the primary SQL-injection defence in this app -
// there is no raw string-concatenated SQL anywhere in the codebase.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
