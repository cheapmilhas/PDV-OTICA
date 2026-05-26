import "./_env-shim";
import { prisma } from "@/lib/prisma";

async function main() {
  const rows: any[] = await prisma.$queryRaw`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'branch_stocks'
    ORDER BY ordinal_position
  `;
  console.log("branch_stocks columns:");
  for (const r of rows) console.log(" -", r.column_name, r.data_type);
  await prisma.$disconnect();
}

main();
