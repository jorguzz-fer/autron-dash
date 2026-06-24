/**
 * Contrato dos provedores de dados de CNPJ e o shape normalizado retornado.
 * Mapeamentos concretos (BrasilAPI, ReceitaWS, B2B) implementam `CnpjProvider`
 * e expõem funções de mapeamento puras para teste.
 */

export interface CnpjSocio {
  nome: string;
  qualificacao: string | null;
}

export interface CnpjCnaeSecundario {
  codigo: string;
  descricao: string | null;
}

/** Dados normalizados de um CNPJ (Camada 1 — Receita Federal). */
export interface CnpjData {
  cnpj: string; // 14 dígitos
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacao: string | null;
  cnaePrincipal: string | null;
  cnaeDescricao: string | null;
  cnaesSecundarios: CnpjCnaeSecundario[];
  capitalSocial: string | null; // Decimal serializado como string para o Prisma
  porte: string | null;
  matrizFilial: string | null;
  email: string | null;
  telefone1: string | null;
  telefone2: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  socios: CnpjSocio[];
  raw: unknown; // payload bruto do provedor (re-mapear sem re-consultar)
}

/** Erro de provedor com classificação para a lógica de retry/fallback. */
export class ProviderError extends Error {
  retryable: boolean;
  notFound: boolean;
  status?: number;

  constructor(
    message: string,
    opts: { retryable?: boolean; notFound?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = "ProviderError";
    this.retryable = opts.retryable ?? false;
    this.notFound = opts.notFound ?? false;
    this.status = opts.status;
  }
}

export interface CnpjProvider {
  name: string;
  /** Intervalo mínimo entre chamadas a este provedor (rate budget). */
  minIntervalMs: number;
  /** Consulta um CNPJ (14 dígitos). Lança ProviderError em falha. */
  fetch(cnpj: string, signal?: AbortSignal): Promise<CnpjData>;
}

/** Helpers de coerção compartilhados pelos mapeadores. */
export function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function decimalOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  // string com vírgula/ponto: "1.000,00" ou "1000.00"
  const raw = String(v).replace(/[^\d.,-]/g, "");
  let cleaned = raw;
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(raw)) cleaned = raw.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d+$/.test(raw)) cleaned = raw.replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : null;
}
