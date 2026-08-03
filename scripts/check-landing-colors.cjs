#!/usr/bin/env node
/**
 * Contrato de cor da landing — verificação por compilação.
 *
 * Por que existe: a landing e o app logado compartilham um único globals.css com
 * DOIS sistemas de cor incompatíveis.
 *
 *   - `--lp-*` / `--brand-*` guardam COR COMPLETA (hex/rgba) e são consumidos
 *     crus:              bg-[var(--lp-surface)]
 *   - as vars do Shadcn guardam TRIPLA HSL e só valem dentro de hsl(), porque é
 *     assim que o tailwind.config as declara:
 *                        foreground: "hsl(var(--foreground))"
 *
 * Misturar os dois gera `hsl(#0A1F44)` — CSS inválido. O navegador descarta a
 * declaração EM SILÊNCIO: sem erro de build, sem warning, sem teste vermelho.
 * A cor cai para herança e ninguém percebe até alguém olhar o site. Foi assim
 * que 28 títulos, o divisor do rodapé e três utilities de sombra foram para
 * produção renderizando errado.
 *
 * As quatro checagens abaixo cobrem os caminhos conhecidos para produzir isso:
 *   1. cor completa envolvida em hsl()          — hsl(var(--lp-foreground))
 *   2. var-canal recebendo cor completa sob      — --foreground: var(--lp-foreground)
 *      .landing-scope                              (a regressão que originou a Onda 4)
 *   3. var-canal consumida crua na landing      — border-[var(--border)]
 *   4. classe custom citada no JSX que não       — `hover:bg-brand-hover` e
 *      existe no CSS compilado                     `shadow-glow-lg` foram a produção assim
 *
 * O que ele NÃO garante: que a regra existente tenha a propriedade ou o estado
 * certos. A checagem 4 confirma que o seletor existe, não que ele faz a coisa
 * certa — isso continua sendo trabalho de olho humano no preview.
 *
 * Uso: node scripts/check-landing-colors.cjs
 * Sai com código 1 se o contrato foi quebrado.
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const problemas = [];

function arquivosDe(dir, exts, acc = []) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return acc;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) arquivosDe(rel, exts, acc);
    else if (exts.some((e) => entry.name.endsWith(e))) acc.push(rel);
  }
  return acc;
}

// ── 1. Nenhuma var de cor completa consumida dentro de hsl() ────────────────
// `hsl(var(--lp-foreground))` = `hsl(#0A1F44)` = inválido. Este é o erro que um
// find-replace descuidado introduz ao migrar chamadas entre os dois sistemas.
const fontes = [
  ...arquivosDe("src", [".tsx", ".ts", ".css"]),
];

for (const rel of fontes) {
  const texto = fs.readFileSync(path.join(ROOT, rel), "utf8");
  texto.split("\n").forEach((linha, i) => {
    const m = linha.match(/hsl\(\s*var\(--(lp|brand)-[a-z-]+\)/);
    if (m) {
      problemas.push(
        `${rel}:${i + 1} — \`${m[0]}…\` envolve em hsl() uma var que já guarda ` +
          `cor completa. Consuma-a crua: var(--${m[1]}-…).`
      );
    }
  });
}

// ── 2. Nenhuma var-canal do shadcn recebe cor completa sob .landing-scope ───
// Esta é a regressão exata que originou a Onda 4: reatribuir `--foreground` (ou
// `--border`, `--muted`, `--background`) com um `--lp-*` dentro de
// `.landing-scope` recria `hsl(#0A1F44)` em runtime, sem nenhum texto
// `hsl(var(--lp-…))` aparecer no fonte para a checagem 1 encontrar.
const CANAIS = ["background", "foreground", "muted", "border", "card", "popover"];
const cssFonte = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");

for (const bloco of cssFonte.matchAll(/\.landing-scope[^{]*\{([^}]*)\}/g)) {
  for (const decl of bloco[1].matchAll(/--([a-z-]+)\s*:\s*var\(--(lp|brand)-[a-z-]+\)/g)) {
    if (CANAIS.includes(decl[1])) {
      problemas.push(
        `src/app/globals.css — \`--${decl[1]}\` recebe uma cor completa dentro de ` +
          `.landing-scope. O Tailwind consome esse nome como \`hsl(var(--${decl[1]}))\`, ` +
          `então isso vira \`hsl(#…)\`: inválido, descartado em silêncio. Foi este ` +
          `exato padrão que quebrou 28 pontos da landing em produção.`
      );
    }
  }
}

// ── 3. Componentes da landing não consomem var-canal do shadcn crua ─────────
// O inverso da anterior: `border-[var(--border)]` na landing recebe uma tripla
// HSL onde se espera cor completa — inválido do mesmo jeito, e igualmente mudo.
const DIRS_LANDING = ["src/app/(landing)", "src/components/home", "src/components/landing-layout", "src/components/seo"];
for (const dir of DIRS_LANDING) {
  for (const rel of arquivosDe(dir, [".tsx"])) {
    const texto = fs.readFileSync(path.join(ROOT, rel), "utf8");
    texto.split("\n").forEach((linha, i) => {
      // `[var(--border)]` sim; `[var(--lp-border)]` e `hsl(var(--border))` não.
      const m = linha.match(/\[var\(--(background|foreground|muted|border)\)\]/);
      if (m) {
        problemas.push(
          `${rel}:${i + 1} — \`${m[0]}\` consome crua uma var que guarda tripla HSL. ` +
            `Use \`var(--lp-${m[1]})\`, que guarda cor completa.`
        );
      }
    });
  }
}

// ── 4. Toda classe custom citada no JSX existe no CSS compilado ─────────────
// Estas classes são escritas à mão no globals.css; o Tailwind não as gera. Se
// alguém citar uma que não existe (ou escrever uma variante `hover:`/`md:` que
// ninguém declarou), o elemento simplesmente renderiza sem o estilo.
let css;
try {
  const out = path.join(os.tmpdir(), `landing-contract-${process.pid}.css`);
  execFileSync(
    path.join(ROOT, "node_modules/.bin/tailwindcss"),
    ["-c", "tailwind.config.js", "-i", "src/app/globals.css", "-o", out],
    { cwd: ROOT, stdio: "pipe" }
  );
  // Comentários fora: uma classe *mencionada* num comentário não é uma regra.
  // Sem isto o gate passa verde quando a regra foi apagada mas o comentário que
  // fala dela continua no arquivo — furo pego na própria mutação de teste.
  css = fs.readFileSync(out, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  fs.unlinkSync(out);
} catch (erro) {
  console.error("Não foi possível compilar o Tailwind para verificar o contrato:");
  console.error(erro.stderr?.toString() || erro.message);
  process.exit(1);
}

// Prefixos das famílias escritas à mão. Só verificamos estas: as famílias do
// próprio Tailwind (text-sm, bg-white…) o engine garante.
const CUSTOM = /\b((?:hover:|focus:|md:|lg:)?(?:text|bg|border)-brand-[a-z]+(?:\/\d+)?|shadow-glow(?:-lg)?|text-subtle)\b/g;

const citadas = new Map();
for (const rel of arquivosDe("src", [".tsx"])) {
  const texto = fs.readFileSync(path.join(ROOT, rel), "utf8");
  for (const m of texto.matchAll(CUSTOM)) {
    if (!citadas.has(m[1])) citadas.set(m[1], rel);
  }
}

// No CSS, `:` e `/` de um nome de classe aparecem escapados com barra invertida
// (`.hover\:bg-brand-hover`, `.bg-brand-primary\/10`). Montamos o regex numa
// passada só, para não re-escapar as barras que acabamos de inserir.
const escapa = (classe) =>
  "\\." +
  Array.from(classe)
    .map((ch) => {
      if (ch === ":" || ch === "/") return "\\\\\\" + ch; // vira \\: / \\/ no regex
      return /[.*+?^${}()|[\]\\]/.test(ch) ? "\\" + ch : ch;
    })
    .join("");

for (const [classe, origem] of citadas) {
  // A regra pode sair como `.x`, `.x:hover` ou dentro de `:where(...) .x`.
  if (!new RegExp(escapa(classe) + "(?![\\w-])").test(css)) {
    problemas.push(
      `${origem} — a classe \`${classe}\` é citada no JSX mas não existe no CSS ` +
        `compilado. Declare-a em globals.css (as utilities de marca são escritas ` +
        `à mão, inclusive cada variante de estado).`
    );
  }
}

// ── Resultado ───────────────────────────────────────────────────────────────
if (problemas.length > 0) {
  console.error("\nContrato de cor da landing quebrado:\n");
  for (const p of problemas) console.error("  • " + p);
  console.error(
    `\n${problemas.length} problema(s). Estes defeitos não quebram o build nem ` +
      `aparecem em teste — só no site, para o visitante.\n`
  );
  process.exit(1);
}

console.log("Contrato de cor da landing: OK");
