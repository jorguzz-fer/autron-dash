/**
 * Renderiza uma string como QR code em SVG (string), usando o gerador
 * vendado em lib/vendor/qrcodegen. Server-side — o SVG é embutido na página
 * de configuração do MFA, sem dependências externas nem chamadas de rede
 * (importante: o otpauth:// URI contém o segredo TOTP e não pode vazar para
 * serviços de terceiros).
 */
import { encodeText, type Ecc } from "@/lib/vendor/qrcodegen";

export function qrSvg(
  text: string,
  opts: { border?: number; scale?: number; ecl?: Ecc; dark?: string; light?: string } = {},
): string {
  const border = opts.border ?? 4; // quiet zone (mínimo 4 pela spec)
  const dark = opts.dark ?? "#000000";
  const light = opts.light ?? "#ffffff";
  const { size, modules } = encodeText(text, opts.ecl ?? "MEDIUM");
  const dim = size + border * 2;

  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) {
        path += `M${x + border},${y + border}h1v1h-1z`;
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" stroke="none" shape-rendering="crispEdges" role="img" aria-label="QR code de configuração do MFA">`,
    `<rect width="100%" height="100%" fill="${light}"/>`,
    `<path d="${path}" fill="${dark}"/>`,
    `</svg>`,
  ].join("");
}
