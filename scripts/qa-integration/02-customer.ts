/**
 * Cenário 2 — CRUD de cliente + validação de CPF.
 *
 * Chama o service `customerService` direto (sem HTTP) com TEST_DATABASE_URL.
 */
import "./_env-shim";
import { customerService } from "@/services/customer.service";
import { createCustomerSchema, updateCustomerSchema } from "@/lib/validations/customer.schema";
import { loadState, saveState, recordResult, recordBug } from "./_state";
import { prisma } from "@/lib/prisma";

const state = loadState();
const companyId = state.companyId!;
const prefix = state.prefix;

async function testCreate() {
  // CPF válido formato (11 dígitos, embora sem check digits)
  const validBody = {
    name: `${prefix}_Cliente_Maria_Silva`,
    cpf: "12345678900",
    email: `${prefix.toLowerCase().replace(/[^a-z0-9]/g, "")}.maria@qa.test`,
    phone: "(85) 99988-7766",
    city: "Fortaleza",
    state: "CE",
  };
  const parsed = createCustomerSchema.parse(validBody);
  const created = await customerService.create(parsed as any, companyId);
  state.customerId = created.id;
  saveState(state);
  recordResult(
    "2.1 criar cliente com dados válidos",
    "Customer criado, id retornado, cpf=12345678900",
    `id=${created.id}, cpf=${created.cpf}`,
    created.cpf === "12345678900" && !!created.id,
  );
}

function zodMsg(e: any): string {
  const issues = e?.issues ?? e?.errors ?? [];
  if (!Array.isArray(issues) || issues.length === 0) return e?.message ?? "rejeitado";
  return issues[0]?.message ?? "rejeitado";
}

async function testCpfFormatoInvalido() {
  // 10 dígitos
  try {
    createCustomerSchema.parse({ name: `${prefix}_X`, cpf: "1234567890" });
    recordResult(
      "2.2 cpf com 10 dígitos",
      "Zod deveria rejeitar",
      "passou (BUG)",
      false,
    );
  } catch (e: any) {
    const msg = zodMsg(e);
    recordResult(
      "2.2 cpf com 10 dígitos",
      "Zod rejeita com 'CPF inválido'",
      msg,
      msg.toLowerCase().includes("cpf"),
    );
  }

  // 12 dígitos
  try {
    createCustomerSchema.parse({ name: `${prefix}_X`, cpf: "123456789012" });
    recordResult(
      "2.3 cpf com 12 dígitos",
      "Zod deveria rejeitar",
      "passou (BUG)",
      false,
    );
  } catch (e: any) {
    const msg = zodMsg(e);
    recordResult(
      "2.3 cpf com 12 dígitos",
      "Zod rejeita",
      msg,
      msg.toLowerCase().includes("cpf"),
    );
  }

  // 11 dígitos com pontuação (123.456.789-09)
  try {
    createCustomerSchema.parse({ name: `${prefix}_X`, cpf: "123.456.789-09" });
    recordResult(
      "2.4 cpf com pontuação",
      "Zod deveria rejeitar (esperando só dígitos)",
      "passou (UI deve mascarar antes de enviar)",
      false,
    );
  } catch (e: any) {
    const msg = zodMsg(e);
    recordResult(
      "2.4 cpf com pontuação",
      "Zod rejeita pontuação",
      msg,
      msg.toLowerCase().includes("cpf"),
    );
  }
}

async function testCpfCheckDigit() {
  // CPF de 11 dígitos com check-digits inválidos: 11111111111
  // Regra real do CPF: dígitos verificadores devem bater. 11111111111 é inválido.
  // Schema atual aceita porque regex é só ^\d{11}$.
  try {
    const result = createCustomerSchema.parse({
      name: `${prefix}_FalsoCpf`,
      cpf: "11111111111",
    });
    if (result) {
      recordBug(
        "CPF aceito sem validar dígito verificador",
        "MEDIO",
        "createCustomerSchema.parse({ cpf: '11111111111' }) é aceito. Regex /^\\d{11}$/ não valida check digit. Cadastros gravam CPFs invalidos.",
        ["src/lib/validations/customer.schema.ts:5"],
      );
      recordResult(
        "2.5 cpf 11111111111 (check digit inválido)",
        "Sistema deveria rejeitar CPFs com DV inválido",
        "Aceito (regex só conta 11 dígitos)",
        false,
      );
    }
  } catch (e: any) {
    recordResult(
      "2.5 cpf 11111111111",
      "Rejeita ou aceita",
      `rejeitado: ${e.errors?.[0]?.message}`,
      true,
    );
  }
}

async function testCpfDuplicadoNaMesmaEmpresa() {
  try {
    const dup = await customerService.create(
      {
        name: `${prefix}_DUP`,
        cpf: "12345678900", // mesmo CPF do cliente criado em 2.1
      } as any,
      companyId,
    );
    recordResult(
      "2.6 CPF duplicado mesma empresa",
      "Deve rejeitar (duplicateError)",
      `criado dup id=${dup.id} (BUG)`,
      false,
    );
  } catch (e: any) {
    recordResult(
      "2.6 CPF duplicado mesma empresa",
      "duplicateError 'CPF já cadastrado'",
      e.message ?? "rejeitado",
      String(e.message).toLowerCase().includes("cpf"),
    );
  }
}

async function testList() {
  const list = await customerService.list(
    { page: 1, pageSize: 50, search: prefix } as any,
    companyId,
  );
  recordResult(
    "2.7 listar clientes do tenant",
    "Lista paginada contendo o cliente criado",
    `total=${(list as any).meta?.total ?? (list as any).total ?? "?"}, items=${
      (list as any).data?.length ?? (list as any).items?.length ?? "?"
    }`,
    JSON.stringify(list).includes(state.customerId!),
  );
}

async function testUpdate() {
  const updated = await customerService.update(
    state.customerId!,
    { phone: "(85) 99000-0000" } as any,
    companyId,
  );
  recordResult(
    "2.8 atualizar cliente (phone)",
    "phone alterado e persistido",
    `phone=${updated.phone}`,
    updated.phone === "(85) 99000-0000",
  );
}

async function testTenantIsolation() {
  // Tenta buscar o cliente recém-criado a partir de OUTRO companyId fictício
  // Deve devolver notFoundError (ou null no findByCPF).
  const other = await customerService.findByCPF("12345678900", "company-inexistente-xyz");
  recordResult(
    "2.9 findByCPF cross-tenant",
    "null (não vaza entre empresas)",
    String(other),
    other === null,
  );
}

async function main() {
  await testCreate();
  await testCpfFormatoInvalido();
  await testCpfCheckDigit();
  await testCpfDuplicadoNaMesmaEmpresa();
  await testList();
  await testUpdate();
  await testTenantIsolation();

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[QA-FAIL]", err);
  await prisma.$disconnect();
  process.exit(1);
});
