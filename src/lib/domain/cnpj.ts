/**
 * Normalização e validação de CNPJ/CPF (puro — sem I/O, testável).
 *
 * A planilha de cadastros (Protheus) traz a coluna "CNPJ/CPF" como texto, em
 * geral com os zeros à esquerda preservados. Mesmo assim tratamos o caso comum
 * de planilhas que perdem zeros à esquerda (Excel/pandas exporta como número).
 */

export type DocTipo = "CNPJ" | "CPF" | "INVALIDO";

export interface DocClassificado {
  /** Dígitos normalizados: 14 (CNPJ), 11 (CPF) ou os dígitos crus quando inválido. */
  digits: string;
  tipo: DocTipo;
  /** Dígitos verificadores conferem (apenas calculado para CNPJ). */
  valido: boolean;
}

/** Remove tudo que não é dígito. Retorna "" para nulo/vazio. */
export function onlyDigits(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  return String(raw).replace(/\D+/g, "");
}

/**
 * Normaliza para 14 dígitos de CNPJ. Repõe zeros à esquerda perdidos pelo Excel
 * (12–13 dígitos → pad para 14). Retorna null se não for plausível um CNPJ.
 */
export function normalizeCnpj(raw: unknown): string | null {
  let d = onlyDigits(raw);
  if (!d) return null;
  if (d.length >= 12 && d.length < 14) d = d.padStart(14, "0");
  if (d.length !== 14) return null;
  return d;
}

/** Valida os dígitos verificadores (módulo 11) de um CNPJ de 14 dígitos. */
export function isValidCnpj(value: unknown): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false; // rejeita sequências repetidas (00000000000000)

  const calcDigito = (base: string, pesos: number[]): number => {
    const soma = pesos.reduce((acc, peso, i) => acc + Number(base[i]) * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const dig1 = calcDigito(d.slice(0, 12), pesos1);
  const dig2 = calcDigito(d.slice(0, 13), pesos2);
  return dig1 === Number(d[12]) && dig2 === Number(d[13]);
}

/** Formata um CNPJ de 14 dígitos como 00.000.000/0000-00. */
export function formatCnpj(value: unknown): string {
  const d = onlyDigits(value);
  if (d.length !== 14) return String(value ?? "");
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Classifica um documento da coluna "CNPJ/CPF":
 *  - 14 dígitos (ou 12–13 com zeros perdidos) → CNPJ (com flag de DV válido)
 *  - 11 dígitos (ou 10 com zero perdido)      → CPF (pessoa física — não enriquecível)
 *  - qualquer outro                            → INVALIDO
 */
export function classifyDoc(raw: unknown): DocClassificado {
  const d = onlyDigits(raw);
  if (!d) return { digits: "", tipo: "INVALIDO", valido: false };

  // CPF (pessoa física): não consultável nas APIs de CNPJ da Receita.
  if (d.length === 11) return { digits: d, tipo: "CPF", valido: false };
  if (d.length === 10) return { digits: d.padStart(11, "0"), tipo: "CPF", valido: false };

  const cnpj = normalizeCnpj(d);
  if (cnpj) return { digits: cnpj, tipo: "CNPJ", valido: isValidCnpj(cnpj) };

  return { digits: d, tipo: "INVALIDO", valido: false };
}
