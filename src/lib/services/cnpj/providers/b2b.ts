/**
 * Stub do provedor B2B pago (fase 2 — Camadas 2/3/4: contatos, decisores,
 * inteligência comercial). Só é incluído na cadeia quando CNPJ_B2B_API_KEY está
 * definido. A integração concreta (Speedio/Econodata/Cortex/CNPJá...) será
 * implementada aqui sem alterar o runner.
 */
import { ProviderError, type CnpjData, type CnpjProvider } from "./types";

export function createB2bProvider(
  minIntervalMs: number,
  _config: { apiUrl: string; apiKey: string },
): CnpjProvider {
  return {
    name: "b2b",
    minIntervalMs,
    async fetch(_cnpj: string, _signal?: AbortSignal): Promise<CnpjData> {
      // TODO(fase 2): chamar o provedor pago e mapear contatos/decisores.
      throw new ProviderError("provedor b2b ainda não implementado (fase 2)", {
        retryable: false,
      });
    },
  };
}
