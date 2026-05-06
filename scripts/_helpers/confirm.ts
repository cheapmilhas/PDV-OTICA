/**
 * Helper de confirmação interativa.
 * Pede ao usuário que digite "CONFIRMO" antes de prosseguir.
 *
 * Usado por scripts de correção em modo --apply.
 * Scripts em --dry-run NÃO devem pedir confirmação (não fazem nada).
 */

import { createInterface } from "readline";

export async function askConfirm(prompt: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() === "CONFIRMO");
    });
  });
}
