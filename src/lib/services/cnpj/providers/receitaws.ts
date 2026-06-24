/**
 * Provedor ReceitaWS — fallback da Camada 1 (RFB).
 * GET https://receitaws.com.br/v1/cnpj/{cnpj}
 * Tier gratuito: 3 req/min (HTTP 429 quando excede). Token opcional via env.
 */
import {
  ProviderError,
  decimalOrNull,
  strOrNull,
  type CnpjData,
  type CnpjProvider,
} from "./types";

const BASE_URL = "https://receitaws.com.br/v1/cnpj";

interface ReceitaWsAtividade {
  code?: string;
  text?: string;
}
interface ReceitaWsSocio {
  nome?: string;
  qual?: string;
}
interface ReceitaWsResponse {
  status?: string; // "OK" | "ERROR"
  message?: string;
  cnpj?: string;
  nome?: string; // razão social
  fantasia?: string;
  situacao?: string;
  atividade_principal?: ReceitaWsAtividade[];
  atividades_secundarias?: ReceitaWsAtividade[];
  capital_social?: string | number;
  porte?: string;
  tipo?: string; // "MATRIZ" | "FILIAL"
  email?: string;
  telefone?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  qsa?: ReceitaWsSocio[];
}

/** Mapeia a resposta da ReceitaWS para o shape normalizado (puro, testável). */
export function mapReceitaWs(json: ReceitaWsResponse): CnpjData {
  const principal = json.atividade_principal?.[0];
  // telefone pode vir como "(11) 1234-5678 / (11) 99999-8888"
  const tels = strOrNull(json.telefone)?.split("/").map((t) => t.trim()).filter(Boolean) ?? [];

  return {
    cnpj: strOrNull(json.cnpj)?.replace(/\D+/g, "") ?? "",
    razaoSocial: strOrNull(json.nome),
    nomeFantasia: strOrNull(json.fantasia),
    situacao: strOrNull(json.situacao),
    cnaePrincipal: principal?.code ? principal.code.replace(/\D+/g, "") : null,
    cnaeDescricao: strOrNull(principal?.text),
    cnaesSecundarios: (json.atividades_secundarias ?? [])
      .filter((a) => a.code && !/^00/.test(a.code))
      .map((a) => ({ codigo: String(a.code).replace(/\D+/g, ""), descricao: strOrNull(a.text) })),
    capitalSocial: decimalOrNull(json.capital_social),
    porte: strOrNull(json.porte),
    matrizFilial: strOrNull(json.tipo)?.toUpperCase() ?? null,
    email: strOrNull(json.email),
    telefone1: tels[0] ?? null,
    telefone2: tels[1] ?? null,
    logradouro: strOrNull(json.logradouro),
    numero: strOrNull(json.numero),
    complemento: strOrNull(json.complemento),
    bairro: strOrNull(json.bairro),
    municipio: strOrNull(json.municipio),
    uf: strOrNull(json.uf),
    cep: strOrNull(json.cep)?.replace(/\D+/g, "") ?? null,
    socios: (json.qsa ?? []).map((s) => ({
      nome: strOrNull(s.nome) ?? "",
      qualificacao: strOrNull(s.qual),
    })).filter((s) => s.nome !== ""),
    raw: json,
  };
}

export function createReceitaWsProvider(minIntervalMs: number, token?: string): CnpjProvider {
  return {
    name: "receitaws",
    minIntervalMs,
    async fetch(cnpj: string, signal?: AbortSignal): Promise<CnpjData> {
      let res: Response;
      try {
        res = await fetch(`${BASE_URL}/${cnpj}`, {
          signal,
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
      } catch (err) {
        throw new ProviderError(`receitaws: falha de rede (${(err as Error).message})`, {
          retryable: true,
        });
      }

      if (res.status === 429) {
        throw new ProviderError("receitaws: limite de requisições (429)", { retryable: true, status: 429 });
      }
      if (res.status >= 500) {
        throw new ProviderError(`receitaws: HTTP ${res.status}`, { retryable: true, status: res.status });
      }
      if (!res.ok) {
        throw new ProviderError(`receitaws: HTTP ${res.status}`, { status: res.status });
      }

      const json = (await res.json()) as ReceitaWsResponse;
      if (json.status === "ERROR") {
        const msg = json.message ?? "erro";
        const notFound = /n[ãa]o\s+encontr|not\s+found|inexist/i.test(msg);
        throw new ProviderError(`receitaws: ${msg}`, { notFound });
      }
      return mapReceitaWs(json);
    },
  };
}
