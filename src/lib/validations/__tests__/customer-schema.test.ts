import { describe, it, expect } from "vitest";
import { createCustomerSchema, sanitizeCustomerDTO } from "../customer.schema";

/**
 * Regressão do bug "cliente PJ salvo como PF / CNPJ perdido":
 * antes, personType/cnpj/companyName/tradeName não existiam no schema e eram
 * descartados silenciosamente pelo Zod. Estes testes garantem que:
 *  1. os campos de PJ são preservados;
 *  2. CNPJ é obrigatório quando personType = PJ (erro no path "cnpj").
 */
describe("createCustomerSchema", () => {
  it("preserva os campos de Pessoa Jurídica", () => {
    const result = createCustomerSchema.parse({
      personType: "PJ",
      name: "Contato Empresa",
      cnpj: "11222333000181",
      companyName: "Empresa LTDA",
      tradeName: "Loja Fantasia",
    });

    expect(result.personType).toBe("PJ");
    expect(result.cnpj).toBe("11222333000181");
    expect(result.companyName).toBe("Empresa LTDA");
    expect(result.tradeName).toBe("Loja Fantasia");
  });

  it("exige CNPJ quando personType = PJ", () => {
    const result = createCustomerSchema.safeParse({
      personType: "PJ",
      name: "Contato Empresa",
      cnpj: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "cnpj");
      expect(issue).toBeDefined();
      expect(issue?.message).toMatch(/obrigatório/i);
    }
  });

  it("rejeita CNPJ com número de dígitos inválido", () => {
    const result = createCustomerSchema.safeParse({
      personType: "PJ",
      name: "Contato Empresa",
      cnpj: "123",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "cnpj")).toBe(true);
    }
  });

  it("não exige CNPJ para Pessoa Física", () => {
    const result = createCustomerSchema.safeParse({
      personType: "PF",
      name: "João Silva",
      cpf: "12345678901",
    });

    expect(result.success).toBe(true);
  });

  it("usa PF como personType padrão", () => {
    const result = createCustomerSchema.parse({ name: "Maria Souza" });
    expect(result.personType).toBe("PF");
  });
});

describe("cadastro rápido sem LGPD + campos opcionais", () => {
  it("aceita cadastro só com nome e telefone (sem consent)", () => {
    const result = createCustomerSchema.safeParse({
      name: "Maria Silva",
      phone: "11987654321",
    });
    expect(result.success).toBe(true);
  });

  it("aceita endereço, nascimento e gênero opcionais", () => {
    const result = createCustomerSchema.safeParse({
      name: "João Souza",
      phone: "11987654321",
      birthDate: "1990-05-20",
      gender: "M",
      zipCode: "01001000",
      address: "Rua A",
      number: "100",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
    });
    expect(result.success).toBe(true);
  });

  it("sanitizeCustomerDTO converte strings vazias em undefined", () => {
    const dto = sanitizeCustomerDTO({
      name: "Ana",
      phone: "11987654321",
      email: "",
      birthDate: "",
      address: "",
      gender: "",
    } as any);
    expect(dto.email).toBeUndefined();
    expect(dto.birthDate).toBeUndefined();
    expect(dto.address).toBeUndefined();
    expect(dto.gender).toBeUndefined();
  });
});
