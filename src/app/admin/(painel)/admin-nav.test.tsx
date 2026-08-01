// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
}));

import { AdminNav } from "./admin-nav";

/**
 * A navegação é a metade BARATA do gate de papel — a que vale é a página não
 * CONSULTAR o dado (ver o comentário longo em `(painel)/page.tsx`), porque um
 * número escondido no JSX ainda viaja no payload RSC.
 *
 * Ainda assim ela precisa de teste próprio: um link visível para uma tela que
 * redireciona manda o operador para um beco sem saída, e `canSeeFinance` tem
 * `= true` como default no componente — ou seja, quem esquecer de passar a prop
 * abre tudo silenciosamente. É exatamente o modo de falha que deixou o painel
 * financeiro sem gate por tanto tempo.
 */
describe("AdminNav — gate de papel financeiro", () => {
  it("🔒 sem papel financeiro, as seções de receita somem", () => {
    render(<AdminNav activeProduct="VIS_APP" canSeeFinance={false} />);
    expect(screen.queryByText("Financeiro")).toBeNull();
    expect(screen.queryByText("Relatórios")).toBeNull();
    expect(screen.queryByText("Grupo")).toBeNull();
  });

  it("com papel financeiro, as seções de receita aparecem", () => {
    // Controle: sem ele, esconder TUDO (ou renderizar nada) passaria verde.
    //
    // `getAllByText`, não `getByText`: "Relatórios" é ao mesmo tempo título de
    // seção e label de link, então o match é legitimamente múltiplo. Exigir
    // unicidade aqui reprovaria o componente por um detalhe de marcação.
    render(<AdminNav activeProduct="VIS_APP" canSeeFinance />);
    expect(screen.getAllByText("Financeiro").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Relatórios").length).toBeGreaterThan(0);
  });

  it("as seções NÃO financeiras continuam para quem não tem o papel", () => {
    // O gate não pode virar um "esconde o painel inteiro": um SUPPORT legítimo
    // precisa continuar tendo por onde trabalhar.
    render(<AdminNav activeProduct="VIS_APP" canSeeFinance={false} />);
    expect(screen.queryByText("Principal")).not.toBeNull();
    expect(screen.queryByText("Suporte")).not.toBeNull();
  });
});
