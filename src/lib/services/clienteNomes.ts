import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { dataTag } from "@/lib/cache";
import { normalizeClienteKey } from "@/lib/domain/kpiFinanceiro";

/**
 * Lookup CÓDIGO Protheus → NOME do cliente.
 *
 * A coluna "Cliente" do relatório de entrada de pedidos traz o CÓDIGO do
 * cadastro (ex.: "C009280"), não a razão social — diferente do faturamento,
 * que já vem com `razaoSocial`. Sem essa tradução, toda tela baseada em
 * `Pedido.cliente` mostra código e, pior, não cruza com faturamento, região
 * ou carteira (o cruzamento é por nome normalizado).
 *
 * Fontes, em ordem de precedência:
 *   1. `CarteiraCliente`  — cadastro do Protheus (clientes_com_vendedor.xlsx)
 *   2. `EnrichmentRecord` — planilha de cadastros do Enriquecimento CNPJ
 *   3. `PloomesOportunidade` — CRM (cobertura parcial, mas já existia)
 *
 * Cacheado; invalida no upload de CARTEIRA_CLIENTE/PLOOMES e expira em 1h
 * (o Enriquecimento grava fora do fluxo de upload).
 */

/** Normaliza o código pra comparação (trim + maiúsculas). */
export function codigoClienteKey(valor: string | null | undefined): string {
  return (valor ?? "").trim().toUpperCase();
}

/**
 * Pares [códigoNormalizado, nome]. Serializável — `unstable_cache` não guarda
 * `Map`; monte com `new Map(...)` no chamador.
 */
export async function getNomeClientePorCodigo(tenantId: string): Promise<[string, string][]> {
  return unstable_cache(computeNomeClientePorCodigo, ["cliente-nomes-por-codigo"], {
    tags: [dataTag(tenantId, "CARTEIRA_CLIENTE"), dataTag(tenantId, "PLOOMES")],
    revalidate: 3600,
  })(tenantId);
}

async function computeNomeClientePorCodigo(tenantId: string): Promise<[string, string][]> {
  const [carteira, enriquecidos, ploomes] = await Promise.all([
    prisma.carteiraCliente.findMany({
      where: { tenantId, codigoCliente: { not: null } },
      select: { codigoCliente: true, cliente: true },
    }),
    prisma.enrichmentRecord.findMany({
      where: { tenantId, inputCodigo: { not: null } },
      select: { inputCodigo: true, razaoSocial: true, inputName: true },
    }),
    prisma.ploomesOportunidade.findMany({
      where: { tenantId, codigoCliente: { not: null } },
      select: { codigoCliente: true, cliente: true },
    }),
  ]);

  // Precedência por ordem de inserção: quem chega primeiro fica.
  const map = new Map<string, string>();
  const add = (codigo: string | null, nome: string | null | undefined) => {
    const key = codigoClienteKey(codigo);
    const valor = nome?.trim();
    if (!key || !valor || map.has(key)) return;
    map.set(key, valor);
  };

  for (const c of carteira) add(c.codigoCliente, c.cliente);
  for (const e of enriquecidos) add(e.inputCodigo, e.razaoSocial ?? e.inputName);
  for (const p of ploomes) add(p.codigoCliente, p.cliente);

  return [...map.entries()];
}

/**
 * Troca código por nome nas linhas que vieram de `Pedido`. Linhas cujo código
 * não está no lookup ficam como estão (o valor já pode ser um nome, quando o
 * relatório traz razão social). `clienteKey` é recalculado junto para que a
 * linha passe a cruzar com faturamento, região e carteira.
 */
export function aplicarNomeCliente<T extends { cliente: string; clienteKey: string }>(
  rows: T[],
  nomes: Map<string, string>,
): T[] {
  if (nomes.size === 0) return rows;
  return rows.map((r) => {
    const nome = nomes.get(codigoClienteKey(r.cliente));
    if (!nome) return r;
    return { ...r, cliente: nome, clienteKey: normalizeClienteKey(nome) };
  });
}
