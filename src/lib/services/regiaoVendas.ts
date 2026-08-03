import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { dataTag } from "@/lib/cache";
import { normalizeClienteKey } from "@/lib/domain/kpiFinanceiro";
import {
  municipioKey,
  resolveRegiao,
  computeAbc,
  computeChurnStatus,
  type RegiaoDef,
  type ChurnStatus,
  type ClasseAbc,
} from "@/lib/domain/regiaoVendas";

/**
 * Serviço da Análise Regional de Vendas.
 *
 * O fato é o `Faturamento` (só tem UF). A CIDADE de cada cliente é DERIVADA de
 * fontes que já existem no Dash — `EnrichmentRecord.municipio` e
 * `PloomesOportunidade.cidadeCliente` — cruzando pelo NOME normalizado do
 * cliente (mesma `normalizeClienteKey` do KPI Financeiro). Correções manuais
 * ficam em `ClienteGeoOverride`. Regiões (territórios) ficam em `RegiaoVenda`.
 *
 * Tudo tenant-scoped; o rollup pesado é cacheado e invalidado no upload de
 * FATURAMENTO / PLOOMES (a base de enrich muda raramente e, quando muda, o
 * cache também é chaveado pelos filtros).
 */

// ── Tipos públicos ──────────────────────────────────────────────────────────

export type FonteGeo = "OVERRIDE" | "ENRIQUECIMENTO" | "PLOOMES" | "UF" | "NENHUMA";

export interface RegiaoVendasFilters {
  tenantId: string;
  dataInicio?: Date;
  dataFim?: Date;
  /** Janela (meses) para EM_RISCO. Padrão 6. */
  emRiscoMeses?: number;
  /** Janela (meses) para PERDIDO. Padrão 12. */
  perdidoMeses?: number;
  /** Data de referência do churn. Padrão: hoje (dia truncado). */
  refData?: Date;
}

export interface ClienteRegiaoRow {
  clienteKey: string;
  cliente: string;
  receita: number;
  ultimaEmissaoISO: string | null;
  municipio: string | null;
  uf: string | null;
  fonteGeo: FonteGeo;
  regiaoId: string | null;
  vendedorFaturamento: string | null;
  churn: ChurnStatus;
  /** Classe ABC DENTRO da sua região (Pareto por regionalidade). */
  classe: ClasseAbc;
}

export interface RegiaoInfo {
  id: string;
  nome: string;
  cor: string | null;
  vendedorCodigo: string | null;
  nomeVendedor: string | null;
}

export interface RegiaoResumo {
  /** id da região, ou null para "Sem região". */
  id: string | null;
  nome: string;
  cor: string | null;
  vendedorCodigo: string | null;
  nomeVendedor: string | null;
  receita: number;
  qtdClientes: number;
  clientesA: number;
  clientesB: number;
  clientesC: number;
  ativos: number;
  emRisco: number;
  perdidos: number;
  ticketMedio: number;
}

export interface AnaliseRegionalData {
  clientes: ClienteRegiaoRow[];
  regioes: RegiaoInfo[];
  resumoPorRegiao: RegiaoResumo[];
  totalReceita: number;
  totalClientes: number;
  /** Clientes sem cidade resolvida (fonte UF/NENHUMA) — cobertura do match. */
  naoResolvidos: number;
  /** Clientes que não casaram nenhuma região (regiaoId null). */
  semRegiao: number;
  ativos: number;
  emRisco: number;
  perdidos: number;
  refDataISO: string;
}

// ── Helpers internos ────────────────────────────────────────────────────────

/** Trunca uma data para 00:00 UTC do dia (estabiliza a chave de cache). */
function truncDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

interface FatClienteAgg {
  cliente: string;
  receita: number;
  ultimaEmissao: Date | null;
  uf: string | null;
  vendedor: string | null;
}

/**
 * Agrega o faturamento por cliente NO BANCO: soma líquida, última emissão e a
 * UF/vendedor da nota mais recente (ARRAY_AGG ... ORDER BY emissao DESC). O
 * nome do cliente = razaoSocial, com fallback nomeFantasia.
 */
async function aggFaturamentoPorCliente(f: RegiaoVendasFilters): Promise<FatClienteAgg[]> {
  const di = f.dataInicio ?? null;
  const df = f.dataFim ?? null;
  const rows = await prisma.$queryRaw<
    {
      cliente: string | null;
      receita: number;
      ultima_emissao: Date | null;
      uf: string | null;
      vendedor: string | null;
    }[]
  >`
    SELECT
      COALESCE(NULLIF(TRIM("razaoSocial"), ''), NULLIF(TRIM("nomeFantasia"), '')) AS cliente,
      COALESCE(SUM("faturamentoLiquido"), 0)::float8 AS receita,
      MAX("emissao") AS ultima_emissao,
      (ARRAY_AGG("uf" ORDER BY "emissao" DESC NULLS LAST))[1] AS uf,
      (ARRAY_AGG("nomeVendedor" ORDER BY "emissao" DESC NULLS LAST))[1] AS vendedor
    FROM "Faturamento"
    WHERE "tenantId" = ${f.tenantId}
      AND (${di}::timestamp IS NULL OR "emissao" >= ${di})
      AND (${df}::timestamp IS NULL OR "emissao" <= ${df})
      AND COALESCE(NULLIF(TRIM("razaoSocial"), ''), NULLIF(TRIM("nomeFantasia"), '')) IS NOT NULL
    GROUP BY 1
  `;
  return rows.map((r) => ({
    cliente: r.cliente ?? "(sem nome)",
    receita: r.receita ?? 0,
    ultimaEmissao: r.ultima_emissao,
    uf: r.uf,
    vendedor: r.vendedor,
  }));
}

/** Mapa nome-normalizado → {municipio, uf} a partir do Enriquecimento CNPJ. */
async function buildEnrichGeoMap(tenantId: string): Promise<Map<string, { municipio: string; uf: string | null }>> {
  const recs = await prisma.enrichmentRecord.findMany({
    where: { tenantId, municipio: { not: null } },
    select: { razaoSocial: true, nomeFantasia: true, inputName: true, municipio: true, uf: true },
  });
  const map = new Map<string, { municipio: string; uf: string | null }>();
  for (const r of recs) {
    if (!r.municipio) continue;
    const geo = { municipio: r.municipio, uf: r.uf };
    for (const nome of [r.razaoSocial, r.nomeFantasia, r.inputName]) {
      const key = normalizeClienteKey(nome);
      if (key && !map.has(key)) map.set(key, geo);
    }
  }
  return map;
}

/** Mapa nome-normalizado → {municipio, uf} a partir do Ploomes (cidade ganha). */
async function buildPloomesGeoMap(tenantId: string): Promise<Map<string, { municipio: string; uf: string | null }>> {
  const recs = await prisma.ploomesOportunidade.findMany({
    where: { tenantId, cidadeCliente: { not: null } },
    select: { cliente: true, cidadeCliente: true, ufCliente: true },
  });
  const map = new Map<string, { municipio: string; uf: string | null }>();
  for (const r of recs) {
    if (!r.cidadeCliente) continue;
    const key = normalizeClienteKey(r.cliente);
    if (key && !map.has(key)) map.set(key, { municipio: r.cidadeCliente, uf: r.ufCliente });
  }
  return map;
}

// ── Leitura das regiões (definições) ────────────────────────────────────────

export async function getRegioes(tenantId: string) {
  return prisma.regiaoVenda.findMany({
    where: { tenantId },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
}

// ── Rollup principal (cacheado) ─────────────────────────────────────────────

/** Tag do Data Cache da CONFIGURAÇÃO regional (regiões + overrides de geo). */
export function regiaoConfigTag(tenantId: string): string {
  return dataTag(tenantId, "REGIAO_VENDAS");
}

export async function getAnaliseRegional(f: RegiaoVendasFilters): Promise<AnaliseRegionalData> {
  const refData = truncDay(f.refData ?? new Date());
  const filters: RegiaoVendasFilters = { ...f, refData };
  return unstable_cache(computeAnaliseRegional, ["analise-regional"], {
    // Invalida no upload de FATURAMENTO/PLOOMES (fato + geo derivada) e quando a
    // configuração regional muda (regiões/overrides) — via regiaoConfigTag.
    tags: [dataTag(f.tenantId, "FATURAMENTO"), dataTag(f.tenantId, "PLOOMES"), regiaoConfigTag(f.tenantId)],
  })(filters);
}

async function computeAnaliseRegional(f: RegiaoVendasFilters): Promise<AnaliseRegionalData> {
  const refData = f.refData ?? truncDay(new Date());
  const emRiscoMeses = f.emRiscoMeses ?? 6;
  const perdidoMeses = f.perdidoMeses ?? 12;

  const [agg, regioesDb, overridesDb, enrichMap, ploomesMap] = await Promise.all([
    aggFaturamentoPorCliente(f),
    getRegioes(f.tenantId),
    prisma.clienteGeoOverride.findMany({ where: { tenantId: f.tenantId } }),
    buildEnrichGeoMap(f.tenantId),
    buildPloomesGeoMap(f.tenantId),
  ]);

  const regiaoDefs: RegiaoDef[] = regioesDb.map((r, i) => ({
    id: r.id,
    ufs: r.ufs,
    municipios: r.municipios,
    ordem: r.ordem ?? i,
  }));
  const regiaoIds = new Set(regiaoDefs.map((r) => r.id));

  const overrideMap = new Map(overridesDb.map((o) => [o.clienteKey, o]));

  // 1) Resolve geografia + região por cliente
  type Parcial = Omit<ClienteRegiaoRow, "classe">;
  const parciais: Parcial[] = agg.map((a) => {
    const clienteKey = normalizeClienteKey(a.cliente);
    let municipio: string | null = null;
    let uf: string | null = a.uf;
    let fonteGeo: FonteGeo = a.uf ? "UF" : "NENHUMA";
    let regiaoPin: string | null = null;

    const ov = overrideMap.get(clienteKey);
    if (ov && (ov.municipio || ov.uf || ov.regiaoId)) {
      if (ov.municipio) municipio = ov.municipio;
      if (ov.uf) uf = ov.uf;
      if (ov.regiaoId && regiaoIds.has(ov.regiaoId)) regiaoPin = ov.regiaoId;
      if (municipio) fonteGeo = "OVERRIDE";
    }
    if (!municipio) {
      const e = enrichMap.get(clienteKey);
      if (e) {
        municipio = e.municipio;
        uf = e.uf ?? uf;
        fonteGeo = "ENRIQUECIMENTO";
      } else {
        const p = ploomesMap.get(clienteKey);
        if (p) {
          municipio = p.municipio;
          uf = p.uf ?? uf;
          fonteGeo = "PLOOMES";
        }
      }
    }

    const regiaoId =
      regiaoPin ?? resolveRegiao({ municipioKey: municipioKey(municipio, uf), uf }, regiaoDefs);

    return {
      clienteKey,
      cliente: a.cliente,
      receita: a.receita,
      ultimaEmissaoISO: a.ultimaEmissao ? a.ultimaEmissao.toISOString() : null,
      municipio,
      uf,
      fonteGeo,
      regiaoId,
      vendedorFaturamento: a.vendedor,
      churn: computeChurnStatus(a.ultimaEmissao, refData, { emRiscoMeses, perdidoMeses }),
    };
  });

  // 2) Curva ABC DENTRO de cada região (Pareto por regionalidade)
  const porRegiao = new Map<string, Parcial[]>();
  for (const p of parciais) {
    const k = p.regiaoId ?? "__sem__";
    const arr = porRegiao.get(k);
    if (arr) arr.push(p);
    else porRegiao.set(k, [p]);
  }
  const classePorCliente = new Map<string, ClasseAbc>();
  for (const arr of porRegiao.values()) {
    const abc = computeAbc(arr.map((p) => ({ key: p.clienteKey, label: p.cliente, receita: p.receita })));
    for (const row of abc) classePorCliente.set(row.key, row.classe);
  }

  const clientes: ClienteRegiaoRow[] = parciais.map((p) => ({
    ...p,
    classe: classePorCliente.get(p.clienteKey) ?? "C",
  }));

  // 3) Resumo por região + KPIs globais
  const infoById = new Map(
    regioesDb.map((r) => [
      r.id,
      { id: r.id, nome: r.nome, cor: r.cor, vendedorCodigo: r.vendedorCodigo, nomeVendedor: r.nomeVendedor },
    ]),
  );
  const regioes: RegiaoInfo[] = regioesDb.map((r) => infoById.get(r.id)!);

  const resumoPorRegiao = buildResumo(clientes, regioesDb);

  const totalReceita = clientes.reduce((s, c) => s + c.receita, 0);
  const naoResolvidos = clientes.filter((c) => c.fonteGeo === "UF" || c.fonteGeo === "NENHUMA").length;
  const semRegiao = clientes.filter((c) => c.regiaoId == null).length;
  const ativos = clientes.filter((c) => c.churn === "ATIVO").length;
  const emRisco = clientes.filter((c) => c.churn === "EM_RISCO").length;
  const perdidos = clientes.filter((c) => c.churn === "PERDIDO").length;

  return {
    clientes,
    regioes,
    resumoPorRegiao,
    totalReceita,
    totalClientes: clientes.length,
    naoResolvidos,
    semRegiao,
    ativos,
    emRisco,
    perdidos,
    refDataISO: refData.toISOString(),
  };
}

// ── Histórico mês a mês (por vendedor / por cliente) ────────────────────────

export interface FatMensalRow {
  /** Nome normalizado do cliente (mesma chave de região/churn). */
  clienteKey: string;
  /** Nome exibível do cliente (razaoSocial, fallback nomeFantasia). */
  cliente: string;
  /** Mês da emissão "YYYY-MM". */
  mes: string;
  /** Vendedor da NF (nomeVendedor). */
  vendedor: string | null;
  /** Faturamento líquido somado no mês. */
  receita: number;
}

/**
 * Faturamento líquido por (cliente, mês, vendedor) — base do histórico
 * mês a mês da Análise Regional. Agregado NO BANCO (to_char + SUM); o
 * pivô por vendedor OU por cliente e o recorte por região são montados
 * na página reaproveitando o mapa cliente→região de getAnaliseRegional
 * (fonte única da atribuição regional). Cacheado por período; invalida no
 * upload de FATURAMENTO.
 */
export async function getFaturamentoMensalRegional(f: RegiaoVendasFilters): Promise<FatMensalRow[]> {
  return unstable_cache(computeFaturamentoMensalRegional, ["analise-regional-mensal"], {
    tags: [dataTag(f.tenantId, "FATURAMENTO")],
  })(f);
}

async function computeFaturamentoMensalRegional(f: RegiaoVendasFilters): Promise<FatMensalRow[]> {
  const di = f.dataInicio ?? null;
  const df = f.dataFim ?? null;
  const rows = await prisma.$queryRaw<
    { cliente: string | null; mes: string; vendedor: string | null; receita: number }[]
  >`
    SELECT
      COALESCE(NULLIF(TRIM("razaoSocial"), ''), NULLIF(TRIM("nomeFantasia"), '')) AS cliente,
      to_char("emissao", 'YYYY-MM') AS mes,
      NULLIF(TRIM("nomeVendedor"), '') AS vendedor,
      COALESCE(SUM("faturamentoLiquido"), 0)::float8 AS receita
    FROM "Faturamento"
    WHERE "tenantId" = ${f.tenantId}
      AND "emissao" IS NOT NULL
      AND (${di}::timestamp IS NULL OR "emissao" >= ${di})
      AND (${df}::timestamp IS NULL OR "emissao" <= ${df})
      AND COALESCE(NULLIF(TRIM("razaoSocial"), ''), NULLIF(TRIM("nomeFantasia"), '')) IS NOT NULL
    GROUP BY 1, 2, 3
  `;
  return rows.map((r) => ({
    clienteKey: normalizeClienteKey(r.cliente),
    cliente: r.cliente ?? "(sem nome)",
    mes: r.mes,
    vendedor: r.vendedor,
    receita: r.receita ?? 0,
  }));
}

function buildResumo(
  clientes: ClienteRegiaoRow[],
  regioesDb: Awaited<ReturnType<typeof getRegioes>>,
): RegiaoResumo[] {
  const base = new Map<string, RegiaoResumo>();
  for (const r of regioesDb) {
    base.set(r.id, {
      id: r.id,
      nome: r.nome,
      cor: r.cor,
      vendedorCodigo: r.vendedorCodigo,
      nomeVendedor: r.nomeVendedor,
      receita: 0,
      qtdClientes: 0,
      clientesA: 0,
      clientesB: 0,
      clientesC: 0,
      ativos: 0,
      emRisco: 0,
      perdidos: 0,
      ticketMedio: 0,
    });
  }
  const semRegiao: RegiaoResumo = {
    id: null,
    nome: "Sem região",
    cor: null,
    vendedorCodigo: null,
    nomeVendedor: null,
    receita: 0,
    qtdClientes: 0,
    clientesA: 0,
    clientesB: 0,
    clientesC: 0,
    ativos: 0,
    emRisco: 0,
    perdidos: 0,
    ticketMedio: 0,
  };

  for (const c of clientes) {
    const bucket = c.regiaoId ? base.get(c.regiaoId) ?? semRegiao : semRegiao;
    bucket.receita += c.receita;
    bucket.qtdClientes += 1;
    if (c.classe === "A") bucket.clientesA += 1;
    else if (c.classe === "B") bucket.clientesB += 1;
    else bucket.clientesC += 1;
    if (c.churn === "ATIVO") bucket.ativos += 1;
    else if (c.churn === "EM_RISCO") bucket.emRisco += 1;
    else if (c.churn === "PERDIDO") bucket.perdidos += 1;
  }

  const out = [...base.values()];
  if (semRegiao.qtdClientes > 0) out.push(semRegiao);
  for (const r of out) r.ticketMedio = r.qtdClientes > 0 ? r.receita / r.qtdClientes : 0;
  out.sort((a, b) => b.receita - a.receita);
  return out;
}
