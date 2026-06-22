/**
 * Cifragem do segredo TOTP em repouso (AES-256-GCM).
 *
 * O segredo TOTP é tão sensível quanto a senha: quem o lê consegue gerar
 * códigos válidos. Por isso não guardamos em claro no banco — ciframos com
 * uma chave derivada de MFA_ENCRYPTION_KEY (ou, na ausência, de AUTH_SECRET,
 * que já é obrigatório para o Auth.js). Assim um dump do banco não vaza os
 * segredos sem também vazar a chave do app.
 *
 * Formato armazenado: base64( iv[12] || authTag[16] || ciphertext ).
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const IV_LEN = 12; // GCM recomenda 96 bits
const TAG_LEN = 16;

function getKey(): Buffer {
  const secret = process.env.MFA_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "MFA_ENCRYPTION_KEY/AUTH_SECRET ausente — necessário para cifrar o segredo MFA.",
    );
  }
  // Deriva 32 bytes determinísticos da chave do app. Salt fixo: a entropia
  // vem do próprio secret; só precisamos de uma derivação estável.
  return scryptSync(secret, "autron-dash:mfa", 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
