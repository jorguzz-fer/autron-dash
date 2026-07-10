import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { derivarSst } from "@/lib/domain/sst";
import { getProviderChain } from "./providers";
import { ProviderError, type CnpjData, type CnpjProvider } from "./providers/types";
import { getIeFetcher, resumoIe } from "./providers/receitaws-ccc";

const LEASE_MS = 60_000; // validade do lease (renovado a cada chunk)
const CHUNK = 50; // registros PENDING por iteração
const FETCH_TIMEOUT_MS = 15_000;
const IE_TIMEOUT_MS = Number(process.env.CNPJ_IE_TIMEOUT_MS ?? 30_000);
const MAX_ATTEMPTS = Number(process.env.CNPJ_ENRICH_MAX_ATTEMPTS ?? 3);

// Identidade deste processo/execução (parte do mutex via lease).
const RUNNER_ID = crypto.randomUUID();

// Throttle por provedor (módulo-level): próximo instante (ms epoch) permitido.
const nextAllowedAt = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle(provider: { name: string; minIntervalMs: number }): Promise<void> {
  const now = Date.now();
  const next = nextAllowedAt.get(provider.name) ?? 0;
  if (next > now) await sleep(next - now);
  nextAllowedAt.set(provider.name, Date.now() + provider.minIntervalMs);
}

/** Consulta um CNPJ percorrendo a cadeia de provedores. */
async function fetchFromChain(
  cnpj: string,
  chain: CnpjProvider[],
): Promise<{ data: CnpjData; source: string }> {
  let lastError: ProviderError | Error | null = null;
  let sawNotFound = false;

  for (const provider of chain) {
    await throttle(provider);
    try {
      const data = await provider.fetch(cnpj, AbortSignal.timeout(FETCH_TIMEOUT_MS));
      return { data, source: provider.name };
    } catch (err) {
      lastError = err as Error;
      if (err instanceof ProviderError && err.notFound) sawNotFound = true;
      // tenta o próximo provedor independente do tipo de erro
    }
  }

  if (sawNotFound) {
    throw new ProviderError("CNPJ não encontrado na Receita Federal", { notFound: true });
  }
  throw lastError ?? new ProviderError("falha desconhecida ao consultar CNPJ", { retryable: true });
}

/** Monta os campos normalizados (Camada 1 + SST derivada) a partir do CnpjData. */
function buildEnrichedData(data: CnpjData, source: string): Prisma.EnrichmentRecordUpdateInput {
  const sst = derivarSst({ cnae: data.cnaePrincipal, porte: data.porte });
  return {
    status: "DONE",
    source,
    errorMessage: null,
    enrichedAt: new Date(),
    attempts: { increment: 1 },
    razaoSocial: data.razaoSocial,
    nomeFantasia: data.nomeFantasia,
    situacao: data.situacao,
    cnaePrincipal: data.cnaePrincipal,
    cnaeDescricao: data.cnaeDescricao,
    cnaesSecundarios: data.cnaesSecundarios as unknown as Prisma.InputJsonValue,
    capitalSocial: data.capitalSocial,
    porte: data.porte,
    matrizFilial: data.matrizFilial,
    email: data.email,
    telefone1: data.telefone1,
    telefone2: data.telefone2,
    logradouro: data.logradouro,
    numero: data.numero,
    complemento: data.complemento,
    bairro: data.bairro,
    municipio: data.municipio,
    uf: data.uf,
    cep: data.cep,
    socios: data.socios as unknown as Prisma.InputJsonValue,
    grauRisco: sst.grauRisco,
    cnaeSst: sst.cnaeSst,
    sesmtProvavel: sst.sesmtProvavel,
    rhEstruturadoProvavel: sst.rhEstruturadoProvavel,
    raw: (data.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
  };
}

/** Reaproveita um CNPJ já enriquecido no mesmo tenant (evita chamada externa). */
async function tryCache(
  tenantId: string,
  cnpj: string,
): Promise<Prisma.EnrichmentRecordUpdateInput | null> {
  const hit = await prisma.enrichmentRecord.findFirst({
    where: { tenantId, cnpj, status: "DONE" },
    orderBy: { enrichedAt: "desc" },
  });
  if (!hit) return null;
  return {
    status: "DONE",
    source: "cache",
    errorMessage: null,
    enrichedAt: new Date(),
    attempts: { increment: 1 },
    razaoSocial: hit.razaoSocial,
    nomeFantasia: hit.nomeFantasia,
    situacao: hit.situacao,
    cnaePrincipal: hit.cnaePrincipal,
    cnaeDescricao: hit.cnaeDescricao,
    cnaesSecundarios: (hit.cnaesSecundarios ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    capitalSocial: hit.capitalSocial,
    porte: hit.porte,
    matrizFilial: hit.matrizFilial,
    email: hit.email,
    telefone1: hit.telefone1,
    telefone2: hit.telefone2,
    logradouro: hit.logradouro,
    numero: hit.numero,
    complemento: hit.complemento,
    bairro: hit.bairro,
    municipio: hit.municipio,
    uf: hit.uf,
    cep: hit.cep,
    socios: (hit.socios ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    grauRisco: hit.grauRisco,
    cnaeSst: hit.cnaeSst,
    sesmtProvavel: hit.sesmtProvavel,
    rhEstruturadoProvavel: hit.rhEstruturadoProvavel,
    inscricoesEstaduais: (hit.inscricoesEstaduais ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    ieResumo: hit.ieResumo,
    raw: (hit.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
  };
}

/** Recalcula contadores do batch a partir dos registros (sem drift). */
async function recomputeCounters(batchId: string, tenantId: string): Promise<void> {
  const groups = await prisma.enrichmentRecord.groupBy({
    by: ["status"],
    where: { batchId, tenantId },
    _count: { _all: true },
  });
  let succeeded = 0, failed = 0, skipped = 0;
  for (const g of groups) {
    if (g.status === "DONE") succeeded = g._count._all;
    else if (g.status === "ERROR") failed = g._count._all;
    else if (g.status === "SKIPPED") skipped = g._count._all;
  }
  await prisma.enrichmentBatch.updateMany({
    where: { id: batchId, tenantId },
    data: { succeeded, failed, skipped, processed: succeeded + failed + skipped },
  });
}

/** Renova o lease. Retorna false se o lease foi perdido (outro runner assumiu). */
async function renewLease(batchId: string, tenantId: string): Promise<boolean> {
  const res = await prisma.enrichmentBatch.updateMany({
    where: { id: batchId, tenantId, leaseOwner: RUNNER_ID },
    data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) },
  });
  return res.count > 0;
}

/**
 * Processa um batch até não restarem registros PENDING. Idempotente e
 * retomável: usa lease para evitar execução concorrente e só seleciona PENDING,
 * então registros já DONE nunca são reprocessados.
 */
export async function runBatch(batchId: string, tenantId: string): Promise<void> {
  const now = new Date();
  // Claim do lease: assume se PENDING/RUNNING e (sem dono OU lease expirado).
  const claim = await prisma.enrichmentBatch.updateMany({
    where: {
      id: batchId,
      tenantId,
      status: { in: ["PENDING", "RUNNING"] },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    data: {
      status: "RUNNING",
      leaseOwner: RUNNER_ID,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      startedAt: now,
    },
  });
  if (claim.count === 0) return; // outro runner detém o lease, ou batch já concluído

  const chain = getProviderChain();
  const ieFetcher = getIeFetcher(); // null = IE desabilitada (env)
  let ieDisabled = false; // desliga IE no restante do run após 402/403 (conta)

  try {
    for (;;) {
      const pendentes = await prisma.enrichmentRecord.findMany({
        where: { batchId, tenantId, status: "PENDING" },
        orderBy: { rowIndex: "asc" },
        take: CHUNK,
      });
      if (pendentes.length === 0) break;

      for (const rec of pendentes) {
        try {
          const cached = await tryCache(tenantId, rec.cnpj);
          let data: Prisma.EnrichmentRecordUpdateInput;
          if (cached) {
            data = cached;
          } else {
            const { data: cnpjData, source } = await fetchFromChain(rec.cnpj, chain);
            data = buildEnrichedData(cnpjData, source);
            // Enriquecimento opcional de Inscrições Estaduais (ReceitaWS CCC).
            // Falha de IE NÃO reprova o registro (Camada 1 já teve sucesso).
            if (ieFetcher && !ieDisabled) {
              try {
                await throttle(ieFetcher);
                const regs = await ieFetcher.fetch(rec.cnpj, AbortSignal.timeout(IE_TIMEOUT_MS));
                data.inscricoesEstaduais = regs as unknown as Prisma.InputJsonValue;
                data.ieResumo = resumoIe(regs);
              } catch (ieErr) {
                if (ieErr instanceof ProviderError && (ieErr.status === 402 || ieErr.status === 403)) {
                  ieDisabled = true; // sem crédito/token inválido: para de tentar IE
                }
              }
            }
          }
          await prisma.enrichmentRecord.update({ where: { id: rec.id }, data });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await prisma.enrichmentRecord.update({
            where: { id: rec.id },
            data: { status: "ERROR", errorMessage: message.slice(0, 500), attempts: { increment: 1 } },
          });
        }
      }

      await recomputeCounters(batchId, tenantId);
      const stillOwned = await renewLease(batchId, tenantId);
      if (!stillOwned) return; // perdemos o lease — outro runner continua
    }

    await recomputeCounters(batchId, tenantId);
    await prisma.enrichmentBatch.updateMany({
      where: { id: batchId, tenantId, leaseOwner: RUNNER_ID },
      data: { status: "DONE", finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, lastError: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.enrichmentBatch.updateMany({
      where: { id: batchId, tenantId, leaseOwner: RUNNER_ID },
      data: { lastError: message.slice(0, 500), leaseOwner: null, leaseExpiresAt: null },
    });
    throw err;
  }
}

/**
 * Dispara o processamento em background (fire-and-forget). A rota responde na
 * hora; o runner roda no processo Node (Coolify single-process). Erros são
 * logados — o batch fica re-disparável (lease expira).
 */
export function kickBatch(batchId: string, tenantId: string): void {
  void runBatch(batchId, tenantId).catch((err) => {
    console.error(`[cnpj-runner] batch ${batchId} falhou:`, err);
  });
}

/** Reseta registros ERROR (com tentativas < MAX) para PENDING e re-dispara. */
export async function retryFailed(batchId: string, tenantId: string): Promise<number> {
  const res = await prisma.enrichmentRecord.updateMany({
    where: { batchId, tenantId, status: "ERROR", attempts: { lt: MAX_ATTEMPTS } },
    data: { status: "PENDING", errorMessage: null },
  });
  if (res.count > 0) {
    await prisma.enrichmentBatch.updateMany({
      where: { id: batchId, tenantId },
      data: { status: "PENDING", finishedAt: null },
    });
    await recomputeCounters(batchId, tenantId);
    kickBatch(batchId, tenantId);
  }
  return res.count;
}
