// src/lib/sankhya/client.ts
//
// Cliente HTTP da API do Sankhya (gateway). Responsabilidades:
//
//   - autenticar (OAuth 2.0 client_credentials OU login legado) e manter o
//     bearer token em cache até perto da expiração;
//   - invocar serviços do MGE via gateway
//     (POST {base}/gateway/v1/mge/service.sbr?serviceName=…&outputType=json),
//     reautenticando UMA vez em caso de 401/sessão expirada;
//   - expor wrappers de consulta:
//       loadRecords  → CRUDServiceProvider.loadRecords (paginado, normaliza
//                      o formato f0/f1/… + metadata para objetos por nome);
//       executeQuery → DbExplorerSP.executeQuery (SELECT livre — depende do
//                      serviço estar liberado para o usuário da integração).
//
// Nada aqui conhece regra de negócio — consultas dos pilares da comissão
// ficam em queries.ts. Server-only (usa credenciais de ambiente).

import { getSankhyaConfig, type SankhyaConfig } from "./config";

// ─── Erro tipado ───────────────────────────────────────────────────────────

export class SankhyaError extends Error {
  constructor(
    message: string,
    /** Etapa em que falhou: "config" | "auth" | "http" | "service". */
    readonly stage: "config" | "auth" | "http" | "service",
    /** HTTP status, quando aplicável. */
    readonly httpStatus?: number,
    /** serviceName da chamada, quando aplicável. */
    readonly serviceName?: string,
  ) {
    super(message);
    this.name = "SankhyaError";
  }
}

// ─── Cache de token (por processo) ─────────────────────────────────────────

interface CachedToken {
  bearer: string;
  /** epoch ms após o qual o token não deve mais ser usado. */
  expiresAt: number;
  /** Identifica a config que gerou o token — troca de env invalida o cache. */
  signature: string;
}

let cachedToken: CachedToken | null = null;

function configSignature(cfg: SankhyaConfig): string {
  return cfg.mode === "oauth"
    ? `oauth|${cfg.baseUrl}|${cfg.clientId}|${cfg.xToken}`
    : `legacy|${cfg.baseUrl}|${cfg.appkey}|${cfg.username}`;
}

/** Margem de segurança antes da expiração (o JWT do gateway dura ~5 min). */
const TOKEN_SAFETY_MS = 30_000;
/** Sessão do login legado expira por inatividade (~30 min); renova antes. */
const LEGACY_TOKEN_TTL_MS = 20 * 60_000;

// ─── Autenticação ──────────────────────────────────────────────────────────

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SankhyaError(`falha de rede ao chamar ${url}: ${msg}`, "http");
  }
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

async function authenticate(cfg: SankhyaConfig): Promise<CachedToken> {
  if (cfg.mode === "oauth") {
    const { status, body } = await fetchJson(
      `${cfg.baseUrl}/authenticate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Token": cfg.xToken,
        },
        body: new URLSearchParams({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          grant_type: "client_credentials",
        }),
      },
      cfg.timeoutMs,
    );
    const b = body as { access_token?: string; expires_in?: number; error_description?: string } | null;
    if (status !== 200 || !b?.access_token) {
      throw new SankhyaError(
        `autenticação OAuth falhou (HTTP ${status})${b?.error_description ? `: ${b.error_description}` : ""} — confira SANKHYA_CLIENT_ID/SECRET e SANKHYA_XTOKEN`,
        "auth",
        status,
      );
    }
    const ttlMs = Math.max(60, Number(b.expires_in ?? 300)) * 1000;
    return {
      bearer: b.access_token,
      expiresAt: Date.now() + ttlMs - TOKEN_SAFETY_MS,
      signature: configSignature(cfg),
    };
  }

  const { status, body } = await fetchJson(
    `${cfg.baseUrl}/login`,
    {
      method: "POST",
      headers: {
        appkey: cfg.appkey,
        token: cfg.token,
        username: cfg.username,
        password: cfg.password,
      },
    },
    cfg.timeoutMs,
  );
  const b = body as { bearerToken?: string; error?: unknown } | null;
  if (status !== 200 || !b?.bearerToken) {
    throw new SankhyaError(
      `login legado falhou (HTTP ${status})${b?.error ? `: ${JSON.stringify(b.error)}` : ""} — confira SANKHYA_APPKEY/TOKEN/USERNAME/PASSWORD`,
      "auth",
      status,
    );
  }
  return {
    bearer: b.bearerToken,
    expiresAt: Date.now() + LEGACY_TOKEN_TTL_MS,
    signature: configSignature(cfg),
  };
}

async function getBearer(cfg: SankhyaConfig, forceRefresh = false): Promise<string> {
  const sig = configSignature(cfg);
  if (!forceRefresh && cachedToken && cachedToken.signature === sig && cachedToken.expiresAt > Date.now()) {
    return cachedToken.bearer;
  }
  cachedToken = await authenticate(cfg);
  return cachedToken.bearer;
}

// ─── Invocação de serviços do MGE via gateway ──────────────────────────────

/** Envelope padrão de resposta dos serviços MGE. status "1" = sucesso. */
interface ServiceEnvelope {
  serviceName?: string;
  status?: string;
  statusMessage?: string;
  responseBody?: unknown;
}

/** statusMessage às vezes vem em base64 — decodifica quando fizer sentido. */
export function decodeStatusMessage(msg: string | undefined): string {
  if (!msg) return "(sem statusMessage)";
  if (/^[A-Za-z0-9+/=\s]+$/.test(msg) && msg.length % 4 === 0 && msg.length >= 8) {
    try {
      const decoded = Buffer.from(msg, "base64").toString("utf8");
      // Só aceita o decode se o resultado é texto legível (evita falso positivo
      // em mensagens curtas que por acaso são base64 válido).
      if (decoded.length > 0 && !/[\u0000-\u0008\u000e-\u001f]/.test(decoded)) return decoded;
    } catch {
      /* usa a original */
    }
  }
  return msg;
}

export interface InvokeOptions {
  /** Módulo do serviço no gateway. Consultas genéricas ficam no "mge". */
  module?: "mge" | "mgecom" | "mgefin";
}

/**
 * Invoca um serviço do Sankhya via gateway. Autentica sob demanda e repete a
 * chamada UMA vez com token novo em caso de 401 (token/sessão expirados).
 * Lança SankhyaError quando o envelope volta com status != "1".
 */
export async function invokeService<T = unknown>(
  serviceName: string,
  requestBody: unknown,
  opts: InvokeOptions = {},
): Promise<T> {
  const cfg = getSankhyaConfig();
  if (!cfg) {
    throw new SankhyaError(
      "integração Sankhya não configurada — defina as variáveis SANKHYA_* no ambiente",
      "config",
    );
  }

  const moduleName = opts.module ?? "mge";
  const url = `${cfg.baseUrl}/gateway/v1/${moduleName}/service.sbr?serviceName=${encodeURIComponent(serviceName)}&outputType=json`;
  const payload = JSON.stringify({ serviceName, requestBody });

  const call = async (forceRefresh: boolean) => {
    const bearer = await getBearer(cfg, forceRefresh);
    return fetchJson(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
        },
        body: payload,
      },
      cfg.timeoutMs,
    );
  };

  let { status, body } = await call(false);
  if (status === 401) {
    ({ status, body } = await call(true));
  }

  if (status < 200 || status >= 300) {
    const detail = typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body)?.slice(0, 300);
    throw new SankhyaError(
      `serviço ${serviceName} respondeu HTTP ${status}${detail ? `: ${detail}` : ""}`,
      "http",
      status,
      serviceName,
    );
  }

  const envelope = body as ServiceEnvelope | null;
  if (envelope?.status !== undefined && envelope.status !== "1") {
    throw new SankhyaError(
      `serviço ${serviceName} retornou erro: ${decodeStatusMessage(envelope.statusMessage)}`,
      "service",
      status,
      serviceName,
    );
  }

  return (envelope?.responseBody ?? body) as T;
}

// ─── loadRecords (CRUDServiceProvider) ─────────────────────────────────────

export interface LoadRecordsParams {
  /** Entidade raiz do dicionário Sankhya (ex.: "CabecalhoNota", "Parceiro"). */
  entity: string;
  /** Campos da entidade raiz (nomes de coluna, ex.: ["NUNOTA", "DTNEG"]). */
  fields: string[];
  /** Entidades relacionadas: path → campos (ex.: { Parceiro: ["NOMEPARC"] }). */
  related?: Record<string, string[]>;
  /** WHERE com "?" como placeholder (ex.: "this.DTNEG >= ?"). */
  criteria?: string;
  /** Valores dos placeholders, na ordem. */
  parameters?: Array<string | number | Date>;
  /** Limite de páginas por segurança (default 200). */
  maxPages?: number;
}

/** Uma linha normalizada: nome do campo → valor string (ou null). */
export type SankhyaRecord = Record<string, string | null>;

interface LoadRecordsResponseBody {
  entities?: {
    total?: string;
    hasMoreResult?: string;
    metadata?: { fields?: { field?: MetaField | MetaField[] } };
    entity?: RawEntity | RawEntity[];
  };
}

interface MetaField {
  name?: string;
}

type RawEntity = Record<string, { $?: string } | string | undefined>;

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function fmtParam(v: string | number | Date): { $: string; type: "S" | "I" | "D" } {
  if (v instanceof Date) {
    // Formato aceito pelos critérios do MGE: dd/MM/yyyy
    const dd = String(v.getUTCDate()).padStart(2, "0");
    const mm = String(v.getUTCMonth() + 1).padStart(2, "0");
    return { $: `${dd}/${mm}/${v.getUTCFullYear()}`, type: "D" };
  }
  if (typeof v === "number") return { $: String(v), type: "I" };
  return { $: v, type: "S" };
}

/**
 * Converte o formato posicional do loadRecords (f0/f1/… + metadata com a
 * ordem dos campos) em objetos { NOME_DO_CAMPO: valor }.
 */
export function normalizeLoadRecords(responseBody: LoadRecordsResponseBody): {
  rows: SankhyaRecord[];
  hasMore: boolean;
  total: number | null;
} {
  const entities = responseBody?.entities;
  const fieldNames = asArray(entities?.metadata?.fields?.field)
    .map((f) => f?.name ?? "")
    .filter(Boolean);
  const rows: SankhyaRecord[] = [];

  for (const raw of asArray(entities?.entity)) {
    const row: SankhyaRecord = {};
    fieldNames.forEach((name, i) => {
      const cell = raw?.[`f${i}`];
      const value = typeof cell === "object" && cell !== null ? cell.$ : (cell as string | undefined);
      row[name] = value === undefined || value === "" ? null : String(value);
    });
    rows.push(row);
  }

  return {
    rows,
    hasMore: entities?.hasMoreResult === "true",
    total: entities?.total !== undefined ? Number(entities.total) : null,
  };
}

/**
 * Consulta paginada via CRUDServiceProvider.loadRecords. Percorre todas as
 * páginas (offsetPage) até hasMoreResult=false e devolve as linhas
 * normalizadas por nome de campo.
 */
export async function loadRecords(params: LoadRecordsParams): Promise<SankhyaRecord[]> {
  const { entity, fields, related = {}, criteria, parameters = [], maxPages = 200 } = params;

  const entityList = [
    { path: "", fieldset: { list: fields.join(",") } },
    ...Object.entries(related).map(([path, list]) => ({ path, fieldset: { list: list.join(",") } })),
  ];

  const all: SankhyaRecord[] = [];
  for (let page = 0; page < maxPages; page++) {
    const body = await invokeService<LoadRecordsResponseBody>("CRUDServiceProvider.loadRecords", {
      dataSet: {
        rootEntity: entity,
        includePresentationFields: "N",
        ignoreCalculatedFields: "true",
        offsetPage: String(page),
        ...(criteria
          ? {
              criteria: {
                expression: { $: criteria },
                parameter: parameters.map(fmtParam),
              },
            }
          : {}),
        entity: entityList,
      },
    });

    const { rows, hasMore } = normalizeLoadRecords(body);
    all.push(...rows);
    if (!hasMore) return all;
  }

  throw new SankhyaError(
    `loadRecords(${entity}): mais de ${maxPages} páginas — restrinja o critério ou aumente maxPages`,
    "service",
    undefined,
    "CRUDServiceProvider.loadRecords",
  );
}

// ─── executeQuery (DbExplorerSP) ───────────────────────────────────────────

interface ExecuteQueryResponseBody {
  fieldsMetadata?: Array<{ name?: string; description?: string }>;
  rows?: unknown[][];
}

/**
 * SELECT livre via DbExplorerSP.executeQuery. É o caminho mais direto para
 * reproduzir os exports (joins TGFCAB/TGFITE/TGFFIN), mas o serviço precisa
 * estar liberado para o usuário da integração no ERP — se vier "serviço não
 * autorizado", pedir a liberação ou migrar a consulta para loadRecords.
 *
 * Somente leitura por contrato: recusa qualquer coisa que não comece com
 * SELECT/WITH (defesa local; o ERP também aplica as permissões dele).
 */
export async function executeQuery(sql: string): Promise<SankhyaRecord[]> {
  const normalized = sql.replace(/^\uFEFF/, "").trim();
  if (!/^(select|with)\b/i.test(normalized)) {
    throw new SankhyaError("executeQuery aceita apenas SELECT/WITH", "config");
  }

  const body = await invokeService<ExecuteQueryResponseBody>("DbExplorerSP.executeQuery", {
    sql: normalized,
  });

  const names = (body.fieldsMetadata ?? []).map((f, i) => f?.name || `COL${i}`);
  return (body.rows ?? []).map((cells) => {
    const row: SankhyaRecord = {};
    names.forEach((name, i) => {
      const v = cells?.[i];
      row[name] = v === null || v === undefined || v === "" ? null : String(v);
    });
    return row;
  });
}

// ─── Diagnóstico ───────────────────────────────────────────────────────────

export interface SankhyaStatus {
  configured: boolean;
  mode: "oauth" | "legacy" | null;
  baseUrl: string | null;
  authOk: boolean;
  queryOk: boolean;
  /** Ex.: nome do usuário/da empresa retornado pela consulta de teste. */
  sample: SankhyaRecord | null;
  error: string | null;
}

/**
 * Testa a integração de ponta a ponta: config → autenticação → uma consulta
 * mínima (1 registro de Parceiro, entidade que existe em qualquer base).
 * Nunca lança — devolve o diagnóstico para a tela/CLI exibir.
 */
export async function testConnection(): Promise<SankhyaStatus> {
  const status: SankhyaStatus = {
    configured: false,
    mode: null,
    baseUrl: null,
    authOk: false,
    queryOk: false,
    sample: null,
    error: null,
  };

  let cfg: SankhyaConfig | null;
  try {
    cfg = getSankhyaConfig();
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err);
    status.configured = true; // configurada porém inválida
    return status;
  }
  if (!cfg) {
    status.error = "variáveis SANKHYA_* não configuradas";
    return status;
  }
  status.configured = true;
  status.mode = cfg.mode;
  status.baseUrl = cfg.baseUrl;

  try {
    await getBearer(cfg, true);
    status.authOk = true;
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err);
    return status;
  }

  try {
    const rows = await loadRecords({
      entity: "Parceiro",
      fields: ["CODPARC", "NOMEPARC"],
      criteria: "this.CODPARC = ?",
      parameters: [0], // parceiro 0 (matriz) existe em toda base Sankhya
      maxPages: 1,
    });
    status.queryOk = true;
    status.sample = rows[0] ?? null;
  } catch (err) {
    status.error = err instanceof Error ? err.message : String(err);
  }

  return status;
}

/** Restrito a testes: limpa o cache de token entre casos. */
export function __resetTokenCacheForTests(): void {
  cachedToken = null;
}
