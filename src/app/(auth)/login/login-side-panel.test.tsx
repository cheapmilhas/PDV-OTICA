/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoginSidePanel } from "./login-side-panel";
import type { LoginPanelContent } from "./login-panel-content";

const HOJE = "2026-07-11";
const fresh: LoginPanelContent = { releases: [{ date: "2026-07-01", title: "Novo X", items: ["a", "b"] }] };
const borderIn: LoginPanelContent = { releases: [{ date: "2026-06-27", title: "Borda 14", items: ["a"] }] };
const borderOut: LoginPanelContent = { releases: [{ date: "2026-06-26", title: "Borda 15", items: ["a"] }] };
const unordered: LoginPanelContent = { releases: [
  { date: "2026-06-01", title: "Velha", items: ["x"] },
  { date: "2026-07-05", title: "Recente", items: ["y"] },
] };

describe("LoginSidePanel", () => {
  it("mostra a novidade (rodapé) quando fresca — 10 dias", () => {
    render(<LoginSidePanel content={fresh} today={HOJE} />);
    // Rodapé compacto: badge "Novidade" + o título.
    expect(screen.getByText("Novidade")).toBeTruthy();
    expect(screen.getByText("Novo X")).toBeTruthy();
  });
  it("FRONTEIRA: 14 dias ainda mostra o título da novidade", () => {
    render(<LoginSidePanel content={borderIn} today={HOJE} />);
    expect(screen.getByText("Borda 14")).toBeTruthy();
  });
  it("FRONTEIRA: 15 dias esconde a novidade", () => {
    render(<LoginSidePanel content={borderOut} today={HOJE} />);
    expect(screen.queryByText("Borda 15")).toBeNull();
    expect(screen.queryByText("Novidade")).toBeNull();
  });
  it("sem releases: não quebra e não mostra o rodapé de novidade", () => {
    render(<LoginSidePanel content={{ releases: [] }} today={HOJE} />);
    expect(screen.queryByText("Novidade")).toBeNull();
  });
  it("ordena defensivamente: usa a release de date mais recente, não releases[0]", () => {
    render(<LoginSidePanel content={unordered} today={HOJE} />);
    expect(screen.getByText("Recente")).toBeTruthy();
    expect(screen.queryByText("Velha")).toBeNull();
  });
  it("sempre renderiza o carrossel de funcionalidades (landmark 'Conheça o Vis')", () => {
    render(<LoginSidePanel content={{ releases: [] }} today={HOJE} />);
    expect(screen.getByRole("group", { name: "Funcionalidades do Vis" })).toBeTruthy();
  });
});
