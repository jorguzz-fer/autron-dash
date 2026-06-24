/**
 * Monta a cadeia de provedores a partir das variáveis de ambiente.
 * Ordem definida por CNPJ_ENRICH_PROVIDERS (1º = preferido). Default:
 * "brasilapi,receitaws". O provedor b2b (pago) só entra se houver chave.
 */
import { createBrasilApiProvider } from "./brasilapi";
import { createReceitaWsProvider } from "./receitaws";
import { createB2bProvider } from "./b2b";
import type { CnpjProvider } from "./types";

function intervalFromEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function getProviderChain(): CnpjProvider[] {
  const order = (process.env.CNPJ_ENRICH_PROVIDERS ?? "brasilapi,receitaws")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const b2bUrl = process.env.CNPJ_B2B_API_URL?.trim();
  const b2bKey = process.env.CNPJ_B2B_API_KEY?.trim();

  const chain: CnpjProvider[] = [];
  for (const name of order) {
    if (name === "brasilapi") {
      chain.push(createBrasilApiProvider(intervalFromEnv("CNPJ_BRASILAPI_MIN_INTERVAL_MS", 250)));
    } else if (name === "receitaws") {
      chain.push(
        createReceitaWsProvider(
          intervalFromEnv("CNPJ_RECEITAWS_MIN_INTERVAL_MS", 21000),
          process.env.RECEITAWS_TOKEN?.trim() || undefined,
        ),
      );
    } else if (name === "b2b" && b2bUrl && b2bKey) {
      chain.push(
        createB2bProvider(intervalFromEnv("CNPJ_B2B_MIN_INTERVAL_MS", 1000), {
          apiUrl: b2bUrl,
          apiKey: b2bKey,
        }),
      );
    }
  }

  // Garante ao menos a BrasilAPI se a env vier vazia/errada.
  if (chain.length === 0) {
    chain.push(createBrasilApiProvider(250));
  }
  return chain;
}
