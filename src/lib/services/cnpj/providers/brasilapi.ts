/**
 * Provedor BrasilAPI (gratuito, sem chave) — fonte principal da Camada 1 (RFB).
 * GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}
 */
import {
  ProviderError,
  decimalOrNull,
  strOrNull,
  type CnpjData,
  type CnpjProvider,
} from "./types";

const BASE_URL = "https://brasilapi.com.br/api/cnpj/v1";

interface BrasilApiCnae {
  codigo?: number | string;
  descricao?: string;
}
interface BrasilApiSocio {
  nome_socio?: string;
  qualificacao_socio?: string;
}
interface BrasilApiResponse {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  situacao_cadastral?: string | number;
  cnae_fiscal?: number | string;
  cnae_fiscal_descricao?: string;
  cnaes_secundarios?: BrasilApiCnae[];
  capital_social?: number | string;
  porte?: string;
  descricao_identificador_matriz_filial?: string;
  email?: string;
  ddd_telefone_1?: string;
  ddd_telefone_2?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  qsa?: BrasilApiSocio[];
}

/** Mapeia a resposta da BrasilAPI para o shape normalizado (puro, testável). */
export function mapBrasilApi(json: BrasilApiResponse): CnpjData {
  return {
    cnpj: strOrNull(json.cnpj)?.replace(/\D+/g, "") ?? "",
    razaoSocial: strOrNull(json.razao_social),
    nomeFantasia: strOrNull(json.nome_fantasia),
    situacao: strOrNull(json.descricao_situacao_cadastral),
    cnaePrincipal: json.cnae_fiscal != null ? String(json.cnae_fiscal) : null,
    cnaeDescricao: strOrNull(json.cnae_fiscal_descricao),
    cnaesSecundarios: (json.cnaes_secundarios ?? [])
      .filter((c) => c.codigo != null && String(c.codigo) !== "0")
      .map((c) => ({ codigo: String(c.codigo), descricao: strOrNull(c.descricao) })),
    capitalSocial: decimalOrNull(json.capital_social),
    porte: strOrNull(json.porte),
    matrizFilial: strOrNull(json.descricao_identificador_matriz_filial),
    email: strOrNull(json.email),
    telefone1: strOrNull(json.ddd_telefone_1),
    telefone2: strOrNull(json.ddd_telefone_2),
    logradouro: strOrNull(json.logradouro),
    numero: strOrNull(json.numero),
    complemento: strOrNull(json.complemento),
    bairro: strOrNull(json.bairro),
    municipio: strOrNull(json.municipio),
    uf: strOrNull(json.uf),
    cep: strOrNull(json.cep)?.replace(/\D+/g, "") ?? null,
    socios: (json.qsa ?? []).map((s) => ({
      nome: strOrNull(s.nome_socio) ?? "",
      qualificacao: strOrNull(s.qualificacao_socio),
    })).filter((s) => s.nome !== ""),
    raw: json,
  };
}

export function createBrasilApiProvider(minIntervalMs: number): CnpjProvider {
  return {
    name: "brasilapi",
    minIntervalMs,
    async fetch(cnpj: string, signal?: AbortSignal): Promise<CnpjData> {
      let res: Response;
      try {
        res = await fetch(`${BASE_URL}/${cnpj}`, {
          signal,
          headers: { Accept: "application/json" },
        });
      } catch (err) {
        throw new ProviderError(`brasilapi: falha de rede (${(err as Error).message})`, {
          retryable: true,
        });
      }

      if (res.status === 404) {
        throw new ProviderError("brasilapi: CNPJ não encontrado", { notFound: true, status: 404 });
      }
      if (res.status === 429 || res.status >= 500) {
        throw new ProviderError(`brasilapi: HTTP ${res.status}`, { retryable: true, status: res.status });
      }
      if (!res.ok) {
        throw new ProviderError(`brasilapi: HTTP ${res.status}`, { status: res.status });
      }

      const json = (await res.json()) as BrasilApiResponse;
      return mapBrasilApi(json);
    },
  };
}
