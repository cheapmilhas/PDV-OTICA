// Registro global dos matchers do jest-dom (toHaveTextContent, toBeInTheDocument, …)
// para testes de componente (ambiente jsdom, via /** @vitest-environment jsdom */).
// Importar aqui evita repetir o import em cada arquivo de teste de UI.
// Em testes de ambiente `node` o import só registra os matchers; é inofensivo.
import "@testing-library/jest-dom/vitest";

// jsdom não implementa `window.matchMedia`. Componentes que usam `useMediaQuery`
// (SSR-safe, lê matchMedia de forma síncrona) quebrariam com "matchMedia is not a
// function". Stub padrão = NÃO-match (desktop/mouse): mantém o comportamento
// clássico dos testes que não se importam com media queries. Testes que precisam
// de um estado específico (ex.: `(pointer: coarse)`) sobrescrevem `window.matchMedia`
// localmente.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
