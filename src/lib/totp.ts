/**
 * TOTP (RFC 6238) + Base32 (RFC 4648), implementação self-contained sobre
 * node:crypto — sem dependências externas (o ambiente bloqueia o CDN do xlsx,
 * o que inviabiliza `npm install` de libs novas).
 *
 * Parâmetros padrão de mercado, compatíveis com Google Authenticator / Authy /
 * 1Password / Microsoft Authenticator:
 *   - algoritmo HMAC-SHA1
 *   - 6 dígitos
 *   - período de 30s
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD = 30;
const SECRET_BYTES = 20; // 160 bits — recomendação da RFC 4226

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Codifica bytes em Base32 (RFC 4648), sem padding. */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += B32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/** Decodifica uma string Base32 (RFC 4648). Ignora espaços, padding e case. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = B32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("Caractere base32 inválido");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Gera um novo segredo TOTP aleatório, em Base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

/** Calcula o código TOTP para um dado contador (HOTP), com zero-padding. */
function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // counter é < 2^53; escreve como big-endian 64 bits (parte alta/baixa).
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);

  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % 10 ** TOTP_DIGITS;
  return otp.toString().padStart(TOTP_DIGITS, "0");
}

/** Gera o código TOTP atual para um segredo Base32. */
export function generateTotp(secretBase32: string, atMs: number = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / TOTP_PERIOD);
  return hotp(base32Decode(secretBase32), counter);
}

/**
 * Verifica um código TOTP com tolerância de ±`window` períodos (default 1,
 * = ±30s) para absorver drift de relógio. Comparação em tempo constante.
 */
export function verifyTotp(
  secretBase32: string,
  token: string,
  opts: { window?: number; atMs?: number } = {},
): boolean {
  const window = opts.window ?? 1;
  const atMs = opts.atMs ?? Date.now();
  const normalized = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;

  const secret = base32Decode(secretBase32);
  const counter = Math.floor(atMs / 1000 / TOTP_PERIOD);
  const expected = Buffer.from(normalized);
  for (let i = -window; i <= window; i++) {
    const candidate = Buffer.from(hotp(secret, counter + i));
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return true;
    }
  }
  return false;
}

/**
 * Monta a otpauth:// URI consumida pelos apps autenticadores (e codificada
 * no QR). label = "Issuer:account"; o issuer também vai no parâmetro.
 */
export function buildOtpauthUri(opts: {
  secretBase32: string;
  account: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.account}`);
  const params = new URLSearchParams({
    secret: opts.secretBase32,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Formata o segredo em grupos de 4 para digitação manual no app. */
export function formatSecretForDisplay(secretBase32: string): string {
  return secretBase32.replace(/(.{4})/g, "$1 ").trim();
}
