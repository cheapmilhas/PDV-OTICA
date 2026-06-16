import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY ausente ou inválida (esperado 32 bytes em hex = 64 chars)");
  }
  return Buffer.from(hex, "hex");
}

/** Cifra um segredo. Formato: ivHex:cipherHex:authTagHex. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit IV recomendado p/ GCM
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${enc.toString("hex")}:${tag.toString("hex")}`;
}

/** Decifra. Lança se o authTag não bater (adulteração) ou formato inválido. */
export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("ciphertext inválido");
  const [ivHex, encHex, tagHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(encHex, "hex")).toString("utf8") + decipher.final("utf8");
}
