/*
 * QR Code generator — byte-mode port of Project Nayuki's public-domain library.
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Original copyright (c) Project Nayuki. (MIT License)
 * Trimmed to byte-mode segments (suficiente para otpauth:// URIs) e adaptado
 * para TypeScript/ESM. Vendado localmente porque o ambiente bloqueia o
 * `npm install` de dependências novas.
 */

export type Ecc = "LOW" | "MEDIUM" | "QUARTILE" | "HIGH";

// Índice e nº de bits de correção (format bits) por nível, conforme a spec.
const ECC_ORDER: Ecc[] = ["MEDIUM", "LOW", "HIGH", "QUARTILE"];
const ECC_FORMAT_BITS: Record<Ecc, number> = { LOW: 1, MEDIUM: 0, QUARTILE: 3, HIGH: 2 };

const MIN_VERSION = 1;
const MAX_VERSION = 40;
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

// Tabelas da spec (linhas = nível ECC na ordem LOW, MEDIUM, QUARTILE, HIGH;
// colunas = versão 1..40). [0] é placeholder (versão 0 não existe).
const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  // L
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // M
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  // Q
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // H
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
  // L
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  // M
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  // Q
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  // H
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

function eccRow(ecl: Ecc): number {
  // Ordem das tabelas acima: L=0, M=1, Q=2, H=3.
  return { LOW: 0, MEDIUM: 1, QUARTILE: 2, HIGH: 3 }[ecl];
}

function getNumRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function getNumDataCodewords(ver: number, ecl: Ecc): number {
  const row = eccRow(ecl);
  return (
    Math.floor(getNumRawDataModules(ver) / 8) -
    ECC_CODEWORDS_PER_BLOCK[row][ver] * NUM_ERROR_CORRECTION_BLOCKS[row][ver]
  );
}

// ── Reed-Solomon sobre GF(256), polinômio 0x11D ────────────────────────────
function reedSolomonMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function reedSolomonComputeDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}
function reedSolomonComputeRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= reedSolomonMultiply(coef, factor);
    });
  }
  return result;
}

export interface QrModules {
  size: number;
  /** matrix[y][x] = true para módulo escuro. */
  modules: boolean[][];
}

/** Codifica `data` (bytes) em uma matriz QR no nível ECC dado. */
export function encodeBytesToQr(data: number[], ecl: Ecc): QrModules {
  // 1. Escolhe a menor versão que comporta os dados.
  let version = MIN_VERSION;
  let dataCapacityBits = 0;
  const usedBitsFor = (ver: number): number => {
    const ccBits = ver <= 9 ? 8 : 16; // char-count bits (byte mode)
    return 4 + ccBits + data.length * 8;
  };
  for (; ; version++) {
    if (version > MAX_VERSION) throw new Error("Dados excedem a capacidade do QR");
    dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
    if (usedBitsFor(version) <= dataCapacityBits) break;
  }

  // 2. Monta o bitstream: mode (0100) + char count + dados.
  const bb: number[] = [];
  const appendBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
  };
  appendBits(0x4, 4); // byte mode
  appendBits(data.length, version <= 9 ? 8 : 16);
  for (const b of data) appendBits(b, 8);

  // Terminator + padding até múltiplo de 8 + bytes de preenchimento.
  appendBits(0, Math.min(4, dataCapacityBits - bb.length));
  while (bb.length % 8 !== 0) bb.push(0);
  const dataCodewords: number[] = [];
  for (let i = 0; i < bb.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bb[i + j];
    dataCodewords.push(byte);
  }
  for (let pad = 0xec; dataCodewords.length * 8 < dataCapacityBits; pad ^= 0xec ^ 0x11) {
    dataCodewords.push(pad);
  }

  // 3. ECC + interleave dos blocos.
  const row = eccRow(ecl);
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[row][version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[row][version];
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  const rsDiv = reedSolomonComputeDivisor(blockEccLen);
  let k = 0;
  for (let i = 0; i < numBlocks; i++) {
    const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = dataCodewords.slice(k, k + datLen);
    k += datLen;
    const ecc = reedSolomonComputeRemainder(dat, rsDiv);
    if (i < numShortBlocks) dat.push(0); // alinhamento p/ interleave
    blocks.push(dat.concat(ecc));
  }

  const finalCodewords: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    for (let j = 0; j < blocks.length; j++) {
      // Pula a célula de padding dos short blocks na coluna de dados.
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
        finalCodewords.push(blocks[j][i]);
      }
    }
  }

  // 4. Desenha a matriz e escolhe a melhor máscara.
  return drawQr(version, ecl, finalCodewords);
}

function drawQr(version: number, ecl: Ecc, codewords: number[]): QrModules {
  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const setFn = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  // Timing patterns
  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }

  // Finder patterns (3 cantos) + separadores
  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) {
          setFn(x, y, dist !== 2 && dist !== 4);
        }
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  // Alignment patterns
  const alignPositions = getAlignmentPatternPositions(version);
  const numAlign = alignPositions.length;
  for (let i = 0; i < numAlign; i++) {
    for (let j = 0; j < numAlign; j++) {
      // Pula os 3 cantos ocupados pelos finders.
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === numAlign - 1) ||
        (i === numAlign - 1 && j === 0)
      ) {
        continue;
      }
      drawAlignment(alignPositions[i], alignPositions[j], setFn);
    }
  }

  // Reserva format (e version) — preenchido depois com a máscara escolhida.
  drawFormatBits(ecl, 0, size, setFn); // valor provisório
  drawVersion(version, size, setFn);

  // Coloca os codewords (zigzag) nos módulos não-funcionais.
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    const col = right === 6 ? 5 : right; // pula a coluna de timing
    for (let v = 0; v < size; v++) {
      for (let c = 0; c < 2; c++) {
        const x = col - c;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - v : v;
        if (!isFunction[y][x] && bitIdx < totalBits) {
          modules[y][x] = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
          bitIdx++;
        }
      }
    }
  }

  // Testa as 8 máscaras, escolhe a de menor penalidade.
  let bestMask = 0;
  let minPenalty = Infinity;
  let bestModules = modules;
  for (let mask = 0; mask < 8; mask++) {
    const trial = modules.map((r) => r.slice());
    applyMask(trial, isFunction, mask);
    drawFormatBits(ecl, mask, size, (x, y, dark) => {
      trial[y][x] = dark;
    });
    const penalty = getPenaltyScore(trial, size);
    if (penalty < minPenalty) {
      minPenalty = penalty;
      bestMask = mask;
      bestModules = trial;
    }
  }

  return { size, modules: bestModules };
}

function getAlignmentPatternPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result: number[] = [6];
  for (let pos = version * 4 + 10; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

function drawAlignment(cx: number, cy: number, setFn: (x: number, y: number, d: boolean) => void) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function drawFormatBits(
  ecl: Ecc,
  mask: number,
  size: number,
  setFn: (x: number, y: number, d: boolean) => void,
) {
  const data = (ECC_FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;

  // Cópia 1 (em torno do finder superior-esquerdo).
  for (let i = 0; i <= 5; i++) setFn(8, i, getBit(bits, i));
  setFn(8, 7, getBit(bits, 6));
  setFn(8, 8, getBit(bits, 7));
  setFn(7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i++) setFn(14 - i, 8, getBit(bits, i));

  // Cópia 2 (espelhada nos outros dois cantos).
  for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(bits, i));
  setFn(8, size - 8, true); // módulo escuro fixo
}

function drawVersion(version: number, size: number, setFn: (x: number, y: number, d: boolean) => void) {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const bit = getBit(bits, i);
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFn(a, b, bit);
    setFn(b, a, bit);
  }
}

function applyMask(modules: boolean[][], isFunction: boolean[][], mask: number) {
  const size = modules.length;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFunction[y][x]) continue;
      let invert = false;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
      }
      if (invert) modules[y][x] = !modules[y][x];
    }
  }
}

function getPenaltyScore(modules: boolean[][], size: number): number {
  let result = 0;

  // Regra 1: corridas de mesma cor (linhas e colunas).
  for (let y = 0; y < size; y++) {
    let runColor = false;
    let runLen = 0;
    for (let x = 0; x < size; x++) {
      if (modules[y][x] === runColor) {
        runLen++;
        if (runLen === 5) result += PENALTY_N1;
        else if (runLen > 5) result++;
      } else {
        runColor = modules[y][x];
        runLen = 1;
      }
    }
  }
  for (let x = 0; x < size; x++) {
    let runColor = false;
    let runLen = 0;
    for (let y = 0; y < size; y++) {
      if (modules[y][x] === runColor) {
        runLen++;
        if (runLen === 5) result += PENALTY_N1;
        else if (runLen > 5) result++;
      } else {
        runColor = modules[y][x];
        runLen = 1;
      }
    }
  }

  // Regra 2: blocos 2x2 da mesma cor.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
        result += PENALTY_N2;
      }
    }
  }

  // Regra 3: padrões tipo finder (1:1:3:1:1) em linhas e colunas.
  const pattern = [true, false, true, true, true, false, true];
  const hasPattern = (cells: boolean[], i: number): boolean => {
    for (let p = 0; p < 7; p++) if (cells[i + p] !== pattern[p]) return false;
    const before = i - 4 < 0 || cells.slice(i - 4, i).every((v) => !v);
    const after = i + 11 > cells.length || cells.slice(i + 7, i + 11).every((v) => !v);
    return before && after;
  };
  for (let y = 0; y < size; y++) {
    const rowCells = modules[y];
    for (let x = 0; x <= size - 7; x++) if (hasPattern(rowCells, x)) result += PENALTY_N3;
  }
  for (let x = 0; x < size; x++) {
    const colCells = modules.map((r) => r[x]);
    for (let y = 0; y <= size - 7; y++) if (hasPattern(colCells, y)) result += PENALTY_N3;
  }

  // Regra 4: desvio do balanço claro/escuro de 50%.
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * PENALTY_N4;

  return result;
}

function getBit(value: number, i: number): boolean {
  return ((value >>> i) & 1) !== 0;
}

/** Conveniência: codifica uma string UTF-8 em QR. */
export function encodeText(text: string, ecl: Ecc = "MEDIUM"): QrModules {
  const bytes = Array.from(Buffer.from(text, "utf8"));
  return encodeBytesToQr(bytes, ecl);
}
