#!/usr/bin/env ts-node

/**
 * Script Automático de Correção de Imports do Lucide React
 *
 * Este script:
 * 1. Identifica todos ícones usados mas não importados
 * 2. Adiciona automaticamente ao import
 * 3. Salva os arquivos corrigidos
 */

import * as fs from 'fs';

// Mapeamento de arquivos e ícones faltando
// Nota: Link vem do next/link, não do lucide-react
const fixes: Record<string, string[]> = {
  '/Users/matheusreboucas/PDV OTICA/src/app/(dashboard)/dashboard/clientes/page.tsx': ['Search'],
  '/Users/matheusreboucas/PDV OTICA/src/app/(dashboard)/dashboard/configuracoes/page.tsx': ['Upload'],
  '/Users/matheusreboucas/PDV OTICA/src/app/(dashboard)/dashboard/ordens-servico/[id]/editar/page.tsx': ['Info'],
  '/Users/matheusreboucas/PDV OTICA/src/app/(dashboard)/dashboard/ordens-servico/page.tsx': ['Search'],
  '/Users/matheusreboucas/PDV OTICA/src/app/(dashboard)/dashboard/produtos/page.tsx': ['Search'],
  '/Users/matheusreboucas/PDV OTICA/src/app/(dashboard)/dashboard/vendas/page.tsx': ['Search'],
  '/Users/matheusreboucas/PDV OTICA/src/components/estoque/modal-saida-estoque.tsx': ['Info'],
  '/Users/matheusreboucas/PDV OTICA/src/components/shared/pagination.tsx': ['X'],
  '/Users/matheusreboucas/PDV OTICA/src/components/ui/command.tsx': ['List'],
};

function fixImportsInFile(filePath: string, missingIcons: string[]): void {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Encontra a linha do import do lucide-react
    let importStartLine = -1;
    let importEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('from "lucide-react"') || lines[i].includes("from 'lucide-react'")) {
        // Import em uma linha
        if (lines[i].includes('import') && lines[i].includes('}')) {
          importStartLine = i;
          importEndLine = i;
          break;
        }
      }

      if (lines[i].includes('import') && lines[i].includes('{') &&
          (lines[i].includes('lucide-react') || i < lines.length - 5)) {
        // Import multi-linha - procura o fim
        importStartLine = i;
        for (let j = i; j < lines.length; j++) {
          if (lines[j].includes('from "lucide-react"') || lines[j].includes("from 'lucide-react'")) {
            importEndLine = j;
            break;
          }
        }
        if (importEndLine > -1) break;
      }
    }

    if (importStartLine === -1) {
      console.log(`⚠️  ${filePath}: Import do lucide-react não encontrado`);
      return;
    }

    // Extrai os ícones já importados
    const importBlock = lines.slice(importStartLine, importEndLine + 1).join('\n');

    // Remove from "lucide-react" para pegar só os ícones
    const iconsText = importBlock
      .replace(/import\s+{/, '')
      .replace(/}\s+from\s+["']lucide-react["'].*/, '')
      .trim();

    const existingIcons = iconsText
      .split(',')
      .map(icon => icon.trim())
      .filter(icon => icon.length > 0);

    // Adiciona os ícones faltantes
    const allIcons = [...new Set([...existingIcons, ...missingIcons])].sort();

    // Reconstrói o import
    const newImport = `import {\n  ${allIcons.join(',\n  ')},\n} from "lucide-react";`;

    // Substitui o import antigo pelo novo
    const newLines = [...lines];
    newLines.splice(importStartLine, importEndLine - importStartLine + 1, newImport);

    // Salva o arquivo
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');

    console.log(`✅ ${filePath}: Adicionados ${missingIcons.join(', ')}`);
  } catch (error) {
    console.error(`❌ Erro ao processar ${filePath}:`, error);
  }
}

function main() {
  console.log('🔧 Corrigindo imports do lucide-react...\n');

  let fixed = 0;

  for (const [filePath, missingIcons] of Object.entries(fixes)) {
    fixImportsInFile(filePath, missingIcons);
    fixed++;
  }

  console.log(`\n✅ ${fixed} arquivos corrigidos!`);
  console.log('\n🔍 Execute "npm run validate:imports" para verificar.');
}

main();
