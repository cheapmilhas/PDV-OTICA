#!/usr/bin/env ts-node

/**
 * Script de Validação de Imports do Lucide React
 *
 * Este script:
 * 1. Encontra todos arquivos .tsx/.ts no projeto
 * 2. Identifica ícones do lucide-react sendo usados
 * 3. Verifica se todos estão no import
 * 4. Reporta erros e gera relatório
 *
 * Uso: npm run validate:imports
 */

import * as fs from 'fs';
import * as path from 'path';

interface ValidationError {
  file: string;
  missingIcons: string[];
  line: number;
}

interface ValidationResult {
  totalFiles: number;
  filesWithErrors: number;
  errors: ValidationError[];
}

/**
 * Extrai ícones do import do lucide-react
 */
function extractLucideImports(content: string): Set<string> {
  const importRegex = /import\s+{([^}]+)}\s+from\s+["']lucide-react["']/g;
  const icons = new Set<string>();

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importedItems = match[1].split(',').map(item => item.trim());
    importedItems.forEach(item => icons.add(item));
  }

  return icons;
}

/**
 * Encontra todos ícones sendo usados no JSX/TSX
 */
function findUsedIcons(content: string, importedIcons: Set<string>): string[] {
  const missingIcons: string[] = [];

  // Lista de ícones comuns do lucide-react
  const commonIcons = [
    'Loader2', 'AlertTriangle', 'Check', 'X', 'ChevronDown', 'ChevronUp',
    'ChevronLeft', 'ChevronRight', 'Search', 'Plus', 'Minus', 'Edit',
    'Trash2', 'Eye', 'EyeOff', 'Save', 'Download', 'Upload', 'Filter',
    'Settings', 'User', 'Users', 'Package', 'ShoppingCart', 'ShoppingBag',
    'DollarSign', 'CreditCard', 'Calendar', 'Clock', 'TrendingUp',
    'TrendingDown', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown',
    'CheckCircle2', 'XCircle', 'AlertCircle', 'Info', 'HelpCircle',
    'Home', 'FileText', 'Folder', 'File', 'Image', 'Video', 'Music',
    'Mail', 'Phone', 'MapPin', 'Globe', 'Wifi', 'Battery', 'Volume2',
    'Mic', 'Camera', 'Printer', 'Monitor', 'Smartphone', 'Tablet',
    'Target', 'Percent', 'Hash', 'AtSign', 'Link', 'Paperclip',
    'Copy', 'Clipboard', 'Scissors', 'MoreVertical', 'MoreHorizontal',
    'Menu', 'Grid', 'List', 'Columns', 'Rows', 'Maximize2', 'Minimize2',
    'ZoomIn', 'ZoomOut', 'RefreshCw', 'RotateCw', 'RotateCcw',
    'Play', 'Pause', 'Square', 'Circle', 'Triangle', 'Star',
    'Heart', 'Bookmark', 'Flag', 'Tag', 'Bell', 'Shield',
  ];

  // Verifica cada ícone comum
  commonIcons.forEach(icon => {
    // Procura por usos do ícone no código (como JSX tag ou referência)
    const iconUsageRegex = new RegExp(`<${icon}[\\s/>]|\\b${icon}\\b(?!:)`, 'g');

    if (iconUsageRegex.test(content)) {
      // Se o ícone é usado mas não está importado
      if (!importedIcons.has(icon)) {
        missingIcons.push(icon);
      }
    }
  });

  return missingIcons;
}

/**
 * Valida um arquivo individual
 */
function validateFile(filePath: string): ValidationError | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Verifica se o arquivo importa do lucide-react
    if (!content.includes('from "lucide-react"') && !content.includes("from 'lucide-react'")) {
      return null; // Arquivo não usa lucide-react
    }

    const importedIcons = extractLucideImports(content);
    const missingIcons = findUsedIcons(content, importedIcons);

    if (missingIcons.length > 0) {
      // Encontra a linha do import para referência
      const lines = content.split('\n');
      const importLineIndex = lines.findIndex(line => line.includes('from "lucide-react"') || line.includes("from 'lucide-react'"));

      return {
        file: filePath,
        missingIcons,
        line: importLineIndex + 1,
      };
    }

    return null;
  } catch (error) {
    console.error(`Erro ao validar ${filePath}:`, error);
    return null;
  }
}

/**
 * Encontra arquivos recursivamente
 */
function findFiles(dir: string, pattern: RegExp, exclude: RegExp): string[] {
  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Pular pastas excluídas
      if (exclude.test(fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        results.push(...findFiles(fullPath, pattern, exclude));
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch (error) {
    // Ignorar erros de permissão
  }

  return results;
}

/**
 * Valida todos arquivos do projeto
 */
function validateAllFiles(): ValidationResult {
  console.log('🔍 Procurando arquivos TypeScript/React...\n');

  // Encontra todos arquivos .ts e .tsx, excluindo node_modules, .next e scripts
  const files = findFiles(
    process.cwd(),
    /\.(ts|tsx)$/,
    /node_modules|\.next|out|dist|build|scripts/
  );

  console.log(`📁 Encontrados ${files.length} arquivos para validar\n`);

  const errors: ValidationError[] = [];

  for (const file of files) {
    const error = validateFile(file);
    if (error) {
      errors.push(error);
    }
  }

  return {
    totalFiles: files.length,
    filesWithErrors: errors.length,
    errors,
  };
}

/**
 * Gera relatório de validação
 */
function generateReport(result: ValidationResult): void {
  console.log('━'.repeat(80));
  console.log('📊 RELATÓRIO DE VALIDAÇÃO DE IMPORTS LUCIDE-REACT');
  console.log('━'.repeat(80));
  console.log();

  console.log(`📁 Total de arquivos verificados: ${result.totalFiles}`);
  console.log(`${result.filesWithErrors === 0 ? '✅' : '❌'} Arquivos com erros: ${result.filesWithErrors}`);
  console.log();

  if (result.errors.length === 0) {
    console.log('✅ TODOS OS IMPORTS ESTÃO CORRETOS!');
    console.log();
    console.log('Nenhum ícone do lucide-react está sendo usado sem import.');
    return;
  }

  console.log('❌ ERROS ENCONTRADOS:\n');

  result.errors.forEach((error, index) => {
    console.log(`${index + 1}. ${error.file}:${error.line}`);
    console.log(`   Ícones faltando no import:`);
    error.missingIcons.forEach(icon => {
      console.log(`   - ${icon}`);
    });
    console.log();
  });

  console.log('━'.repeat(80));
  console.log('💡 COMO CORRIGIR:');
  console.log('━'.repeat(80));
  console.log();
  console.log('Adicione os ícones faltantes ao import do lucide-react:');
  console.log();
  console.log('import {');
  console.log('  // ... outros ícones,');

  // Lista única de todos ícones faltantes
  const allMissingIcons = new Set<string>();
  result.errors.forEach(error => {
    error.missingIcons.forEach(icon => allMissingIcons.add(icon));
  });

  Array.from(allMissingIcons).forEach(icon => {
    console.log(`  ${icon},  // ← ADICIONAR`);
  });

  console.log('} from "lucide-react";');
  console.log();
}

/**
 * Main
 */
function main() {
  console.log('🚀 Iniciando validação de imports do lucide-react...\n');

  const result = validateAllFiles();
  generateReport(result);

  // Exit code 1 se houver erros
  if (result.filesWithErrors > 0) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
}
