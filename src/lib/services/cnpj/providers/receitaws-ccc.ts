/**
 * ReceitaWS — Cadastro Centralizado de Contribuinte (CCC / Inscrições Estaduais).
 * GET https://receitaws.com.br/v1/ccc/{cnpj}/days/{days}
 *
 * Retorna as Inscrições Estaduais (IE) da empresa em TODOS os estados numa única
 * chamada. Requer token (Bearer). É um enriquecimento OPCIONAL da Camada 1 —
 * habilitado por env (CNPJ_ENRICH_IE) porque é cobrado por consulta.
 *
 * `days` = defasagem máxima aceita dos dados. Valor alto (ex.: 365) prefere o
 * cache da ReceitaWS (billing.free/database), reduzindo custo e latência.
 */
import { ProviderError, strOrNull } from "./types";

const BASE_URL = "https://receitaws.com.br/v1/ccc";

export interface InscricaoEstadual {
  uf: string | null;
  ie: string | null;
  tipoIe: string | null;
  situacaoIe: string | null; // "Habilitado" | "Não Habilitado"
  dataSituacao: string | null;
  regimeIcms: string | null;
  situacaoCnpj: string | null;
  dataAtualizacao: string | null;
}

interface CccRegistro {
  uf?: string;
  ie?: string;
  tipo_ie?: string;
  situacao_ie?: string;
  data_situacao?: string;
  regime_icms?: string;
  situacao_cnpj?: string;
  data_atualizacao?: string;
}
interface CccResponse {
  status?: string; // "OK"
  message?: string;
  cnpj?: string;
  ultima_atualizacao?: string;
  registros?: CccRegistro[];
}

/** true só quando a IE está efetivamente habilitada (não casa "Não Habilitado"). */
export function ieHabilitada(situacao: string | null): boolean {
  return (situacao ?? "").trim().toLowerCase() === "habilitado";
}

/** Mapeia a resposta CCC para a lista normalizada de IEs (puro, testável). */
export function mapCcc(json: CccResponse): InscricaoEstadual[] {
  return (json.registros ?? []).map((r) => ({
    uf: strOrNull(r.uf),
    ie: strOrNull(r.ie),
    tipoIe: strOrNull(r.tipo_ie),
    situacaoIe: strOrNull(r.situacao_ie),
    dataSituacao: strOrNull(r.data_situacao),
    regimeIcms: strOrNull(r.regime_icms),
    situacaoCnpj: strOrNull(r.situacao_cnpj),
    dataAtualizacao: strOrNull(r.data_atualizacao),
  }));
}

/** Resumo textual (habilitadas primeiro) para a tabela e o Excel. */
export function resumoIe(regs: InscricaoEstadual[]): string | null {
  if (regs.length === 0) return null;
  const ordered = [...regs].sort(
    (a, b) => Number(ieHabilitada(b.situacaoIe)) - Number(ieHabilitada(a.situacaoIe)),
  );
  return ordered
    .map((r) => `${r.uf ?? "?"} ${r.ie ?? ""} (${r.situacaoIe ?? "?"})`.replace(/\s+/g, " ").trim())
    .join("; ");
}

export interface IeFetcher {
  name: string;
  minIntervalMs: number;
  fetch(cnpj: string, signal?: AbortSignal): Promise<InscricaoEstadual[]>;
}

export function createIeFetcher(opts: {
  token: string;
  days: number;
  minIntervalMs: number;
}): IeFetcher {
  return {
    name: "receitaws-ccc",
    minIntervalMs: opts.minIntervalMs,
    async fetch(cnpj: string, signal?: AbortSignal): Promise<InscricaoEstadual[]> {
      let res: Response;
      try {
        res = await fetch(`${BASE_URL}/${cnpj}/days/${opts.days}`, {
          signal,
          headers: { Accept: "application/json", Authorization: `Bearer ${opts.token}` },
        });
      } catch (err) {
        throw new ProviderError(`receitaws-ccc: falha de rede (${(err as Error).message})`, {
          retryable: true,
        });
      }

      // 402 (sem crédito) / 403 (token inválido): erros de conta — o runner usa o
      // status para desligar a IE no restante da execução (não adianta re-tentar).
      if (res.status === 402 || res.status === 403) {
        throw new ProviderError(`receitaws-ccc: HTTP ${res.status} (token/crédito)`, {
          status: res.status,
        });
      }
      if (res.status === 429) {
        throw new ProviderError("receitaws-ccc: limite de requisições (429)", {
          retryable: true,
          status: 429,
        });
      }
      if (res.status >= 500) {
        throw new ProviderError(`receitaws-ccc: HTTP ${res.status}`, {
          retryable: true,
          status: res.status,
        });
      }
      if (!res.ok) {
        throw new ProviderError(`receitaws-ccc: HTTP ${res.status}`, { status: res.status });
      }

      const json = (await res.json()) as CccResponse;
      // status != OK (ou vazio): trata como "sem inscrições" (não é erro fatal).
      if (json.status && json.status !== "OK") return [];
      return mapCcc(json);
    },
  };
}

/**
 * Constrói o fetcher de IE a partir do ambiente. Retorna null (IE desabilitada)
 * quando CNPJ_ENRICH_IE não está ligado ou não há RECEITAWS_TOKEN.
 */
export function getIeFetcher(): IeFetcher | null {
  const enabled = /^(1|true|yes|on)$/i.test(process.env.CNPJ_ENRICH_IE ?? "");
  const token = process.env.RECEITAWS_TOKEN?.trim();
  if (!enabled || !token) return null;

  const days = Number(process.env.CNPJ_IE_DAYS);
  const minInterval = Number(process.env.CNPJ_RECEITAWS_CCC_MIN_INTERVAL_MS);
  return createIeFetcher({
    token,
    days: Number.isFinite(days) && days >= 0 ? days : 365,
    minIntervalMs: Number.isFinite(minInterval) && minInterval >= 0 ? minInterval : 1500,
  });
}
