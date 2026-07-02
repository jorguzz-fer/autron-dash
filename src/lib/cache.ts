import type { Dataset } from "@prisma/client";

/**
 * Tag do Next.js Data Cache por dataset e tenant.
 *
 * Cada função de leitura cacheada declara as tags dos datasets de que
 * depende; o upload (processUpload) invalida `dataTag(tenantId, dataset)`
 * do dataset que acabou de substituir. Como os dados só mudam via upload,
 * isso mantém o cache sempre correto sem TTL.
 */
export function dataTag(tenantId: string, dataset: Dataset | string): string {
  return `data:${tenantId}:${dataset}`;
}
