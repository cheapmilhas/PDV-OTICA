/**
 * Diff completo schema.prisma vs banco em tabelas críticas.
 * Lista os campos do schema que faltam no banco.
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const prisma = new PrismaClient();

const TABLES = [
  "Sale", "SaleItem", "SalePayment", "Quote", "QuoteItem",
  "CashShift", "CashMovement", "CashRegister",
  "Branch", "Company", "Customer", "User", "branch_stocks",
  "Product", "ServiceOrder", "Supplier", "Brand", "Category",
];

function parseSchemaFields(modelName: string, schema: string): { name: string; type: string }[] {
  const re = new RegExp(`^model ${modelName} \\{([\\s\\S]*?)^\\}`, "m");
  const m = schema.match(re);
  if (!m) return [];
  const body = m[1];
  const fields: { name: string; type: string }[] = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) continue;
    const m = trimmed.match(/^(\w+)\s+(\S+)/);
    if (!m) continue;
    const [, name, type] = m;
    // pula campos relacionais (começam com letra maiúscula no tipo e não são scalars conhecidos)
    if (type.match(/^[A-Z]/) && !["String", "Int", "Boolean", "DateTime", "Float", "Decimal", "Json", "BigInt", "Bytes"].some(t => type.startsWith(t))) {
      continue;
    }
    fields.push({ name, type });
  }
  return fields;
}

async function listColumns(table: string): Promise<Set<string>> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`,
    );
    return new Set(rows.map((r) => r.column_name));
  } catch {
    return new Set();
  }
}

async function main() {
  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  const missing: Record<string, { name: string; type: string }[]> = {};

  for (const t of TABLES) {
    const dbCols = await listColumns(t);
    if (dbCols.size === 0) {
      console.log(`⚠️  '${t}' não existe no banco`);
      continue;
    }
    const schemaFields = parseSchemaFields(t, schema);
    const gone: typeof schemaFields = [];
    for (const f of schemaFields) {
      // Considera @map - tentamos também buscar pelo nome em snake_case
      const snakeName = f.name.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
      if (!dbCols.has(f.name) && !dbCols.has(snakeName)) {
        gone.push(f);
      }
    }
    if (gone.length > 0) {
      missing[t] = gone;
      console.log(`\n❌ ${t}: faltam ${gone.length} colunas`);
      for (const f of gone) console.log(`    ${f.name}: ${f.type}`);
    } else {
      console.log(`✅ ${t}: ok (${schemaFields.length} campos)`);
    }
  }

  console.log("\n\n=== SQL pra adicionar tudo (sem @map; revisar manualmente) ===");
  for (const [table, fields] of Object.entries(missing)) {
    if (fields.length === 0) continue;
    console.log(`\n-- ${table}`);
    console.log(`ALTER TABLE "${table}"`);
    const lines = fields.map((f) => {
      const sqlType = f.type.startsWith("String") ? "TEXT"
        : f.type.startsWith("Int") ? "INTEGER"
        : f.type.startsWith("Boolean") ? "BOOLEAN"
        : f.type.startsWith("DateTime") ? "TIMESTAMP(3)"
        : f.type.startsWith("Decimal") ? "DECIMAL(12,2)"
        : f.type.startsWith("Json") ? "JSONB"
        : f.type.startsWith("Float") ? "DOUBLE PRECISION"
        : "TEXT";
      return `  ADD COLUMN IF NOT EXISTS "${f.name}" ${sqlType}`;
    });
    console.log(lines.join(",\n") + ";");
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
