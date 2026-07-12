/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CreateUserModal, EditUserModal, type UserData } from "./company-users";

const branches = [
  { id: "b1", name: "Filial 1" },
  { id: "b2", name: "Filial 2" },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })));
});

describe("EditUserModal", () => {
  const user: UserData = {
    id: "u1",
    name: "Matheus",
    email: "matheusr@login",
    role: "VENDEDOR",
    active: true,
    createdAt: "2026-01-01",
    branches: [{ id: "b1", name: "Filial 1" }],
    recoveryEmail: null,
  };

  it("mostra a parte legível do login (sem @login) e o campo é read-only", () => {
    render(<EditUserModal companyId="c1" user={user} branches={branches} onClose={() => {}} onSaved={() => {}} />);
    const loginInput = screen.getByDisplayValue("matheusr") as HTMLInputElement;
    expect(loginInput).toBeTruthy();
    expect(loginInput.readOnly).toBe(true);
  });

  it("mostra a nota de que não é e-mail quando o login termina em @login", () => {
    render(<EditUserModal companyId="c1" user={user} branches={branches} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText("Não é um e-mail — é o usuário de acesso.")).toBeTruthy();
  });

  it("tem o campo E-mail de recuperação", () => {
    render(<EditUserModal companyId="c1" user={user} branches={branches} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText("E-mail de recuperação")).toBeTruthy();
  });
});

describe("CreateUserModal", () => {
  it("o campo de login é type=text (não email)", () => {
    render(<CreateUserModal companyId="c1" branches={branches} onClose={() => {}} onCreated={() => {}} />);
    const loginInput = screen.getByPlaceholderText(/ex: matheusr ou email@exemplo\.com/i) as HTMLInputElement;
    expect(loginInput.type).toBe("text");
  });

  it("tem o campo E-mail de recuperação", () => {
    render(<CreateUserModal companyId="c1" branches={branches} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByText("E-mail de recuperação")).toBeTruthy();
  });
});
