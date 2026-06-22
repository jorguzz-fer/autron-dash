import { describe, it, expect } from "vitest";
import { encodeText } from "./vendor/qrcodegen";
import { qrSvg } from "./qr";

describe("gerador de QR (byte mode)", () => {
  it("usa versão 1 (21x21) para texto curto", () => {
    const { size, modules } = encodeText("HELLO", "MEDIUM");
    expect(size).toBe(21);
    expect(modules.length).toBe(21);
    expect(modules[0].length).toBe(21);
  });

  it("desenha os finder patterns nos três cantos", () => {
    const { size, modules } = encodeText("HELLO", "MEDIUM");
    // Anel externo do finder (linha 0 do canto superior-esquerdo) é todo escuro.
    for (let x = 0; x < 7; x++) expect(modules[0][x]).toBe(true);
    // O anel interno tem módulo claro em (1,1) e centro escuro em (3,3).
    expect(modules[1][1]).toBe(false);
    expect(modules[3][3]).toBe(true);
    // Cantos superior-direito e inferior-esquerdo também têm finder.
    expect(modules[0][size - 1]).toBe(true);
    expect(modules[size - 1][0]).toBe(true);
  });

  it("cresce de versão conforme o tamanho do conteúdo", () => {
    const small = encodeText("abc", "MEDIUM").size;
    const big = encodeText("x".repeat(400), "MEDIUM").size;
    expect(big).toBeGreaterThan(small);
  });

  it("é determinístico", () => {
    const a = encodeText("otpauth://totp/Autron:test", "MEDIUM");
    const b = encodeText("otpauth://totp/Autron:test", "MEDIUM");
    expect(JSON.stringify(a.modules)).toBe(JSON.stringify(b.modules));
  });

  it("qrSvg devolve um SVG com path e quiet zone", () => {
    const svg = qrSvg("otpauth://totp/Autron:test?secret=JBSWY3DPEHPK3PXP", { border: 4 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<path");
    // viewBox = size + 2*border. size=21 (curto) + 8 = 29 ... mas conteúdo é maior;
    // basta garantir que há uma viewBox quadrada.
    expect(svg).toMatch(/viewBox="0 0 (\d+) \1"/);
  });
});
