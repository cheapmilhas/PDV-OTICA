// Registro global dos matchers do jest-dom (toHaveTextContent, toBeInTheDocument, …)
// para testes de componente (ambiente jsdom, via /** @vitest-environment jsdom */).
// Importar aqui evita repetir o import em cada arquivo de teste de UI.
// Em testes de ambiente `node` o import só registra os matchers; é inofensivo.
import "@testing-library/jest-dom/vitest";
