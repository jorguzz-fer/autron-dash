import { describe, it, expect } from "vitest";
import {
  base32Encode,
  base32Decode,
  generateTotp,
  generateTotpSecret,
  verifyTotp,
  buildOtpauthUri,
} from "./totp";

describe("base32", () => {
  it("faz round-trip de bytes arbitrários", () => {
    const buf = Buffer.from([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });

  it("ignora espaços, padding e case", () => {
    const buf = Buffer.from("hello world");
    const enc = base32Encode(buf);
    const messy = enc.toLowerCase().replace(/(.{4})/g, "$1 ") + "===";
    expect(base32Decode(messy).equals(buf)).toBe(true);
  });
});

describe("TOTP (RFC 6238, SHA1, 6 dígitos)", () => {
  // Segredo de referência da RFC 6238: ASCII "12345678901234567890".
  const secret = base32Encode(Buffer.from("12345678901234567890"));

  // Valores de 6 dígitos (truncamento dos vetores de 8 dígitos da RFC).
  const vectors: [number, string][] = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ];

  for (const [t, expected] of vectors) {
    it(`gera ${expected} em T=${t}`, () => {
      expect(generateTotp(secret, t * 1000)).toBe(expected);
    });
  }

  it("verifica o código atual e rejeita inválido", () => {
    const now = 1234567890 * 1000;
    expect(verifyTotp(secret, "005924", { atMs: now })).toBe(true);
    expect(verifyTotp(secret, "000000", { atMs: now })).toBe(false);
    expect(verifyTotp(secret, "abc", { atMs: now })).toBe(false);
  });

  it("aceita drift de ±2 períodos (±60s) mas não além", () => {
    const base = 1234567890 * 1000;
    const codeAtBase = generateTotp(secret, base);
    expect(verifyTotp(secret, codeAtBase, { atMs: base + 30_000 })).toBe(true); // +1 período
    expect(verifyTotp(secret, codeAtBase, { atMs: base + 60_000 })).toBe(true); // +2 períodos
    expect(verifyTotp(secret, codeAtBase, { atMs: base + 90_000 })).toBe(false); // +3 períodos
    // Janela explícita continua respeitada.
    expect(verifyTotp(secret, codeAtBase, { atMs: base + 60_000, window: 1 })).toBe(false);
  });
});

describe("segredo e otpauth", () => {
  it("gera segredos base32 válidos e distintos", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]+$/);
    expect(a).not.toBe(b);
    expect(base32Decode(a).length).toBe(20);
  });

  it("monta a URI otpauth com issuer e secret", () => {
    const uri = buildOtpauthUri({ secretBase32: "JBSWY3DPEHPK3PXP", account: "a@b.com", issuer: "Autron Dash" });
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=Autron+Dash");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});
