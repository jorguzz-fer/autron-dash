import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { dataTag } from "@/lib/cache";
import { normalizeClienteKey } from "@/lib/domain/kpiFinanceiro";
import { computeAbc, type ChurnStatus, type ClasseAbc } from "@/lib/domain/regiaoVendas";
import { aplicarNomeCliente, getNomeClientePorCodigo, codigoClienteKey } from "@/lib/services/clienteNomes";
import {
  getAnaliseRegional,
  type ClienteRegiaoRow,
  type FatMensalRow,
  type RegiaoVendasFilters,
} from "@/lib/services/regiaoVendas";

/**
 * Serviço da ANÁLISE DE CARTEIRA.
 *
 * A pergunta que ele responde é: "como foi o histórico dos clientes que ESTÃO
 * HOJE na carteira de cada vendedor?" — diferente da Carteira por Vendedor
 * (Análise Regional), que agrupa pelo vendedor da NF/pedido *da época*.
 *
 * Fonte da dona da carteira: o dataset `CARTEIRA_CLIENTE`, upload do relatório
 * Protheus "clientes com vendedor". O campo **nome vendedor** define o dono.
 * O cruzamento com o histórico é pelo NOME normalizado do cliente
 * (`normalizeClienteKey`), a mesma chave usada na Análise Regional — nem
 * `Faturamento` nem `Pedido` guardam código de cliente.
 *
 * Clientes com faturamento/pedido que não estão na base de carteira caem num
 * balde "Sem carteira", contabilizado como cobertura na tela.
 */

/** Rótulo usado quando o cliente não tem dono na base de carteira. */
export const SEM_CARTEIRA = "Sem carteira";

// ── Mapa cliente → dono da carteira ─────────────────────────────────────────

export interface CarteiraDono {
  /** Nome do dono da carteira (campo "nome vendedor" do Protheus). */
  dono: string;
  codVendedor: string | null;
  /** Nº de cadastros (código/loja) que sustentam essa atribuição. */
  cadastros: number;
}

export interface CarteiraBase {
  /** Pares [clienteKey, dono] — serializável (unstable_cache não guarda Map). */
  entries: [string, CarteiraDono][];
  /** Pares [fantasiaKey, dono] para clientes que só casam pelo nome fantasia. */
  fantasiaEntries: [string, CarteiraDono][];
  /** Total de cadastros importados no último upload. */
  totalCadastros: number;
  /** Cadastros sem "nome vendedor" preenchido. */
  cadastrosSemDono: number;
  /** Nomes distintos de donos de carteira, ordenados. */
  donos: string[];
  /** Clientes cujo nome aparece com DOIS donos diferentes (lojas divergentes). */
  conflitos: number;
}

/**
 * Base de carteira consolidada por NOME de cliente. Quando o mesmo nome tem
 * cadastros (lojas) com donos diferentes, vence o dono com mais cadastros —
 * empate resolve por ordem alfabética, para o resultado ser determinístico.
 * Cacheada; invalida no upload de CARTEIRA_CLIENTE.
 */
export async function getCarteiraBase(tenantId: string): Promise<CarteiraBase> {
  return unstable_cache(computeCarteiraBase, ["carteira-base"], {
    tags: [dataTag(tenantId, "CARTEIRA_CLIENTE")],
  })(tenantId);
}

async function computeCarteiraBase(tenantId: string): Promise<CarteiraBase> {
  const cadastros = await prisma.carteiraCliente.findMany({
    where: { tenantId },
    select: {
      clienteKey: true,
      fantasiaKey: true,
      codVendedor: true,
      nomeVendedor: true,
    },
  });

  // clienteKey → dono → contagem de cadastros (+ código do vendedor).
  const votos = new Map<string, Map<string, { cadastros: number; cod: string | null }>>();
  const votosFantasia = new Map<string, Map<string, { cadastros: number; cod: string | null }>>();
  let cadastrosSemDono = 0;

  for (const c of cadastros) {
    const dono = c.nomeVendedor?.trim();
    if (!dono) {
      cadastrosSemDono++;
      continue;
    }
    for (const [key, bag] of [
      [c.clienteKey, votos] as const,
      [c.fantasiaKey, votosFantasia] as const,
    ]) {
      if (!key) continue;
      let porDono = bag.get(key);
      if (!porDono) {
        porDono = new Map();
        bag.set(key, porDono);
      }
      const atual = porDono.get(dono);
      if (atual) atual.cadastros++;
      else porDono.set(dono, { cadastros: 1, cod: c.codVendedor });
    }
  }

  function consolidar(
    bag: Map<string, Map<string, { cadastros: number; cod: string | null }>>,
  ): { entries: [string, CarteiraDono][]; conflitos: number } {
    const entries: [string, CarteiraDono][] = [];
    let conflitos = 0;
    for (const [key, porDono] of bag) {
      if (porDono.size > 1) conflitos++;
      const vencedor = [...porDono.entries()].sort(
        (a, b) => b[1].cadastros - a[1].cadastros || a[0].localeCompare(b[0], "pt-BR"),
      )[0];
      entries.push([
        key,
        { dono: vencedor[0], codVendedor: vencedor[1].cod, cadastros: vencedor[1].cadastros },
      ]);
    }
    return { entries, conflitos };
  }

  const principal = consolidar(votos);
  const fantasia = consolidar(votosFantasia);

  const donos = Array.from(new Set(principal.entries.map(([, d]) => d.dono))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  return {
    entries: principal.entries,
    fantasiaEntries: fantasia.entries,
    totalCadastros: cadastros.length,
    cadastrosSemDono,
    donos,
    conflitos: principal.conflitos,
  };
}

/**
 * Resolvedor cliente → dono da carteira. Tenta o nome principal e, se não
 * casar, o nome fantasia. Retorna null quando o cliente não está na base.
 */
export function makeDonoResolver(base: CarteiraBase): (clienteKey: string) => CarteiraDono | null {
  const porNome = new Map(base.entries);
  const porFantasia = new Map(base.fantasiaEntries);
  return (clienteKey: string) => porNome.get(clienteKey) ?? porFantasia.get(clienteKey) ?? null;
}

/**
 * Reatribui linhas mês a mês (faturamento OU entrada de pedidos) ao DONO ATUAL
 * da carteira, preservando o formato `FatMensalRow` — assim o pivô do histórico
 * e os filtros da Análise Regional são reaproveitados sem alteração.
 */
export function reatribuirPorCarteira(
  rows: FatMensalRow[],
  resolver: (clienteKey: string) => CarteiraDono | null,
): FatMensalRow[] {
  return rows.map((r) => ({ ...r, vendedor: resolver(r.clienteKey)?.dono ?? SEM_CARTEIRA }));
}

// ── Entrada de pedidos por cliente ──────────────────────────────────────────

export interface PedidoClienteAgg {
  clienteKey: string;
  cliente: string;
  valorTotal: number;
  valorEmAberto: number;
  qtdPVs: number;
  ultimaEmissaoISO: string | null;
}

/**
 * Entrada de pedidos agregada por cliente no período (valor total, valor ainda
 * em aberto e nº de PVs). Complementa o faturamento na visão de carteira.
 *
 * `Pedido.cliente` é o CÓDIGO do cadastro Protheus, então o código é traduzido
 * para o nome antes de agregar — sem isso o pedido nunca casaria com o cliente
 * do faturamento nem com a base de carteira. Depois da tradução, os cadastros
 * (lojas) que compartilham o mesmo nome são somados numa linha só.
 * A agregação é cacheada e invalida no upload de PEDIDO.
 */
export async function getPedidosPorCliente(f: RegiaoVendasFilters): Promise<PedidoClienteAgg[]> {
  const [rows, nomes] = await Promise.all([
    unstable_cache(computePedidosPorCliente, ["carteira-pedidos-cliente"], {
      tags: [dataTag(f.tenantId, "PEDIDO")],
    })(f),
    getNomeClientePorCodigo(f.tenantId),
  ]);
  return consolidarPedidosPorCliente(aplicarNomeCliente(rows, new Map(nomes)));
}

/** Soma as linhas que, depois da tradução do código, viraram o mesmo cliente. */
function consolidarPedidosPorCliente(rows: PedidoClienteAgg[]): PedidoClienteAgg[] {
  const porChave = new Map<string, PedidoClienteAgg>();
  for (const r of rows) {
    const atual = porChave.get(r.clienteKey);
    if (!atual) {
      porChave.set(r.clienteKey, { ...r });
      continue;
    }
    atual.valorTotal += r.valorTotal;
    atual.valorEmAberto += r.valorEmAberto;
    atual.qtdPVs += r.qtdPVs;
    if (
      r.ultimaEmissaoISO &&
      (!atual.ultimaEmissaoISO || r.ultimaEmissaoISO > atual.ultimaEmissaoISO)
    ) {
      atual.ultimaEmissaoISO = r.ultimaEmissaoISO;
    }
  }
  return [...porChave.values()];
}

async function computePedidosPorCliente(f: RegiaoVendasFilters): Promise<PedidoClienteAgg[]> {
  const di = f.dataInicio ?? null;
  const df = f.dataFim ?? null;
  const rows = await prisma.$queryRaw<
    {
      cliente: string | null;
      valor_total: number;
      valor_aberto: number;
      qtd_pvs: number;
      ultima_emissao: Date | null;
    }[]
  >`
    SELECT
      NULLIF(TRIM("cliente"), '') AS cliente,
      COALESCE(SUM("vlrTotal"), 0)::float8 AS valor_total,
      COALESCE(SUM("vlrTotal") FILTER (WHERE "notaFiscal" IS NULL), 0)::float8 AS valor_aberto,
      COUNT(DISTINCT "numPedido")::int AS qtd_pvs,
      MAX("dtEmissao") AS ultima_emissao
    FROM "Pedido"
    WHERE "tenantId" = ${f.tenantId}
      AND (${di}::timestamp IS NULL OR "dtEmissao" >= ${di})
      AND (${df}::timestamp IS NULL OR "dtEmissao" <= ${df})
      AND NULLIF(TRIM("cliente"), '') IS NOT NULL
    GROUP BY 1
  `;
  return rows.map((r) => ({
    clienteKey: normalizeClienteKey(r.cliente),
    cliente: r.cliente ?? "(sem nome)",
    valorTotal: r.valor_total ?? 0,
    valorEmAberto: r.valor_aberto ?? 0,
    qtdPVs: r.qtd_pvs ?? 0,
    ultimaEmissaoISO: r.ultima_emissao ? r.ultima_emissao.toISOString() : null,
  }));
}

// ── Rollup da análise de carteira ───────────────────────────────────────────

export interface ClienteCarteiraRow {
  clienteKey: string;
  cliente: string;
  /** Dono ATUAL da carteira (base Protheus) — ou "Sem carteira". */
  dono: string;
  /** Vendedor da ÉPOCA (NF mais recente do período) — para comparação. */
  vendedorEpoca: string | null;
  /** true quando o cliente foi encontrado na base de carteira. */
  naBase: boolean;
  /** true quando o dono atual difere do vendedor da época. */
  trocouDeDono: boolean;
  receita: number;
  pedidos: number;
  pedidosEmAberto: number;
  churn: ChurnStatus;
  ultimaEmissaoISO: string | null;
  municipio: string | null;
  uf: string | null;
  /** Classe ABC DENTRO da carteira do dono atual. */
  classe: ClasseAbc;
}

export interface CarteiraResumo {
  dono: string;
  /** Classe ABC do dono no ranking de carteiras (Pareto por receita). */
  classe: ClasseAbc;
  receita: number;
  pedidos: number;
  pedidosEmAberto: number;
  qtdClientes: number;
  clientesA: number;
  clientesB: number;
  clientesC: number;
  ativos: number;
  emRisco: number;
  perdidos: number;
  ticketMedio: number;
  /** Clientes da carteira cujo faturamento veio de OUTRO vendedor na época. */
  herdados: number;
}

export interface AnaliseCarteiraData {
  clientes: ClienteCarteiraRow[];
  carteiras: CarteiraResumo[];
  totalReceita: number;
  totalPedidos: number;
  totalClientes: number;
  /** Clientes do histórico encontrados na base de carteira. */
  clientesNaBase: number;
  /** Receita dos clientes sem dono na base (balde "Sem carteira"). */
  receitaSemCarteira: number;
  /** Cadastros da base de carteira que não aparecem no histórico do período. */
  cadastrosSemHistorico: number;
  base: CarteiraBase;
  refDataISO: string;
}

/**
 * Rollup principal: cruza o histórico do período (faturamento + entrada de
 * pedidos, por cliente) com a base ATUAL de donos de carteira e monta o resumo
 * por carteira — ABC dos clientes dentro da carteira, churn, ticket médio e
 * quantos clientes foram "herdados" (faturados por outro vendedor na época).
 *
 * Reaproveita os pipelines já cacheados de `getAnaliseRegional` (faturamento,
 * geografia, churn) e `getPedidosPorCliente` — nenhuma varredura nova de NF.
 */
export async function getAnaliseCarteira(f: RegiaoVendasFilters): Promise<AnaliseCarteiraData> {
  const [regional, pedidos, base] = await Promise.all([
    getAnaliseRegional(f),
    getPedidosPorCliente(f),
    getCarteiraBase(f.tenantId),
  ]);

  const resolver = makeDonoResolver(base);
  const pedidosByKey = new Map(pedidos.map((p) => [p.clienteKey, p]));

  // Clientes com faturamento no período + clientes que só têm pedido.
  const fatByKey = new Map(regional.clientes.map((c) => [c.clienteKey, c]));
  const todasChaves = new Set<string>([...fatByKey.keys(), ...pedidosByKey.keys()]);

  type Parcial = Omit<ClienteCarteiraRow, "classe">;
  const parciais: Parcial[] = [];
  for (const key of todasChaves) {
    const fat: ClienteRegiaoRow | undefined = fatByKey.get(key);
    const ped = pedidosByKey.get(key);
    const dono = resolver(key);
    const vendedorEpoca = fat?.vendedorFaturamento?.trim() || null;
    parciais.push({
      clienteKey: key,
      cliente: fat?.cliente ?? ped?.cliente ?? "(sem nome)",
      dono: dono?.dono ?? SEM_CARTEIRA,
      vendedorEpoca,
      naBase: dono !== null,
      trocouDeDono: !!dono && !!vendedorEpoca && dono.dono !== vendedorEpoca,
      receita: fat?.receita ?? 0,
      pedidos: ped?.valorTotal ?? 0,
      pedidosEmAberto: ped?.valorEmAberto ?? 0,
      churn: fat?.churn ?? "SEM_HISTORICO",
      ultimaEmissaoISO: fat?.ultimaEmissaoISO ?? null,
      municipio: fat?.municipio ?? null,
      uf: fat?.uf ?? null,
    });
  }

  // Agrupa por dono e calcula a curva ABC DENTRO de cada carteira.
  const porDono = new Map<string, Parcial[]>();
  for (const p of parciais) {
    const arr = porDono.get(p.dono);
    if (arr) arr.push(p);
    else porDono.set(p.dono, [p]);
  }
  const classeInterna = new Map<string, ClasseAbc>();
  for (const arr of porDono.values()) {
    for (const row of computeAbc(
      arr.map((p) => ({ key: p.clienteKey, label: p.cliente, receita: p.receita })),
    )) {
      classeInterna.set(row.key, row.classe);
    }
  }
  const clientes: ClienteCarteiraRow[] = parciais.map((p) => ({
    ...p,
    classe: classeInterna.get(p.clienteKey) ?? "C",
  }));

  // ABC das carteiras entre si (por receita).
  const classeCarteira = new Map<string, ClasseAbc>();
  for (const row of computeAbc(
    [...porDono.entries()].map(([dono, arr]) => ({
      key: dono,
      label: dono,
      receita: arr.reduce((s, c) => s + c.receita, 0),
    })),
  )) {
    classeCarteira.set(row.key, row.classe);
  }

  const carteiras: CarteiraResumo[] = [...porDono.entries()].map(([dono, arr]) => {
    const receita = arr.reduce((s, c) => s + c.receita, 0);
    let clientesA = 0;
    let clientesB = 0;
    let clientesC = 0;
    for (const c of arr) {
      const cl = classeInterna.get(c.clienteKey) ?? "C";
      if (cl === "A") clientesA++;
      else if (cl === "B") clientesB++;
      else clientesC++;
    }
    return {
      dono,
      classe: classeCarteira.get(dono) ?? "C",
      receita,
      pedidos: arr.reduce((s, c) => s + c.pedidos, 0),
      pedidosEmAberto: arr.reduce((s, c) => s + c.pedidosEmAberto, 0),
      qtdClientes: arr.length,
      clientesA,
      clientesB,
      clientesC,
      ativos: arr.filter((c) => c.churn === "ATIVO").length,
      emRisco: arr.filter((c) => c.churn === "EM_RISCO").length,
      perdidos: arr.filter((c) => c.churn === "PERDIDO").length,
      ticketMedio: arr.length > 0 ? receita / arr.length : 0,
      herdados: arr.filter((c) => c.trocouDeDono).length,
    };
  });
  carteiras.sort((a, b) => b.receita - a.receita);

  const chavesComHistorico = new Set(clientes.filter((c) => c.naBase).map((c) => c.clienteKey));
  const cadastrosSemHistorico = base.entries.filter(([k]) => !chavesComHistorico.has(k)).length;

  return {
    clientes,
    carteiras,
    totalReceita: clientes.reduce((s, c) => s + c.receita, 0),
    totalPedidos: clientes.reduce((s, c) => s + c.pedidos, 0),
    totalClientes: clientes.length,
    clientesNaBase: clientes.filter((c) => c.naBase).length,
    receitaSemCarteira: clientes.filter((c) => !c.naBase).reduce((s, c) => s + c.receita, 0),
    cadastrosSemHistorico,
    base,
    refDataISO: regional.refDataISO,
  };
}

// ── Base detalhada para tabela dinâmica (faturamento + entrada de pedidos) ───

export interface VendaDetalheRow {
  origem: "Faturamento" | "Entrada de pedido";
  /** Código do cadastro (Protheus). Pedido já traz o código; faturamento cruza pelo nome. */
  codigo: string;
  cliente: string;
  ano: number;
  /** Competência "YYYY-MM". */
  mes: string;
  /** Vendedor da ÉPOCA (nomeVendedor da NF / do pedido). */
  vendedorEpoca: string | null;
  /** Vendedor ATUAL da carteira (dono, base CARTEIRA_CLIENTE); null = sem carteira. */
  vendedorCarteira: string | null;
  valor: number;
  /** Classe ABC do cliente sobre o faturamento do ano-base (null = sem fat. no ano). */
  classeAbc: ClasseAbc | null;
}

export interface BaseVendasDetalhada {
  abcAno: number;
  rows: VendaDetalheRow[];
}

/**
 * Base "achatada"/detalhada para tabela dinâmica no Excel, combinando
 * FATURAMENTO e ENTRADA DE PEDIDOS numa única lista (coluna `origem`), no grão
 * (cliente, mês, vendedor da época). Cada linha traz: código do cliente, nome,
 * vendedor da época, vendedor atual da carteira (dono) e a classe ABC do
 * cliente sobre o faturamento do ano-base (A ≤ 80%, B ≤ 95%, C o restante).
 *
 * Fontes (sem Ploomes): o código vem do cadastro `CarteiraCliente` — para o
 * faturamento, cruzando pelo nome normalizado; para o pedido, a própria coluna
 * "Cliente" já é o código, que é traduzido para o nome. O dono da carteira sai
 * de `getCarteiraBase`. Considera toda a história (sem recorte de período).
 */
export async function getBaseVendasDetalhada(
  tenantId: string,
  abcAno: number,
): Promise<BaseVendasDetalhada> {
  const [fat, ped, base, nomesPairs, cadastros] = await Promise.all([
    prisma.$queryRaw<{ cliente: string | null; mes: string; vendedor: string | null; valor: number }[]>`
      SELECT COALESCE(NULLIF(TRIM("razaoSocial"), ''), NULLIF(TRIM("nomeFantasia"), '')) AS cliente,
             to_char("emissao", 'YYYY-MM') AS mes,
             NULLIF(TRIM("nomeVendedor"), '') AS vendedor,
             COALESCE(SUM("faturamentoLiquido"), 0)::float8 AS valor
      FROM "Faturamento"
      WHERE "tenantId" = ${tenantId} AND "emissao" IS NOT NULL
        AND COALESCE(NULLIF(TRIM("razaoSocial"), ''), NULLIF(TRIM("nomeFantasia"), '')) IS NOT NULL
      GROUP BY 1, 2, 3`,
    prisma.$queryRaw<{ codigo: string | null; mes: string; vendedor: string | null; valor: number }[]>`
      SELECT NULLIF(TRIM("cliente"), '') AS codigo,
             to_char("dtEmissao", 'YYYY-MM') AS mes,
             NULLIF(TRIM("nomeVendedor"), '') AS vendedor,
             COALESCE(SUM("vlrTotal"), 0)::float8 AS valor
      FROM "Pedido"
      WHERE "tenantId" = ${tenantId} AND "dtEmissao" IS NOT NULL AND NULLIF(TRIM("cliente"), '') IS NOT NULL
      GROUP BY 1, 2, 3`,
    getCarteiraBase(tenantId),
    getNomeClientePorCodigo(tenantId),
    prisma.carteiraCliente.findMany({
      where: { tenantId, codigoCliente: { not: null } },
      select: { clienteKey: true, fantasiaKey: true, codigoCliente: true },
    }),
  ]);

  const resolverDono = makeDonoResolver(base);
  const nomePorCodigo = new Map(nomesPairs);

  // clienteKey / fantasiaKey → código do cadastro (primeiro cadastro vence).
  const codigoPorKey = new Map<string, string>();
  for (const c of cadastros) {
    const cod = c.codigoCliente?.trim();
    if (!cod) continue;
    if (c.clienteKey && !codigoPorKey.has(c.clienteKey)) codigoPorKey.set(c.clienteKey, cod);
    if (c.fantasiaKey && !codigoPorKey.has(c.fantasiaKey)) codigoPorKey.set(c.fantasiaKey, cod);
  }

  // Curva ABC sobre o faturamento do ano-base, por cliente (clienteKey).
  const fatAnoBase = new Map<string, { label: string; receita: number }>();
  for (const r of fat) {
    if (!r.cliente || !r.mes.startsWith(`${abcAno}-`)) continue;
    const key = normalizeClienteKey(r.cliente);
    if (!key) continue;
    const cur = fatAnoBase.get(key);
    if (cur) cur.receita += r.valor;
    else fatAnoBase.set(key, { label: r.cliente, receita: r.valor });
  }
  const classePorKey = new Map<string, ClasseAbc>();
  for (const row of computeAbc(
    [...fatAnoBase.entries()]
      .filter(([, v]) => v.receita > 0)
      .map(([key, v]) => ({ key, label: v.label, receita: v.receita })),
  )) {
    classePorKey.set(row.key, row.classe);
  }

  const rows: VendaDetalheRow[] = [];
  for (const r of fat) {
    if (!r.cliente) continue;
    const key = normalizeClienteKey(r.cliente);
    if (!key) continue;
    rows.push({
      origem: "Faturamento",
      codigo: codigoPorKey.get(key) ?? "",
      cliente: r.cliente,
      ano: Number(r.mes.slice(0, 4)),
      mes: r.mes,
      vendedorEpoca: r.vendedor,
      vendedorCarteira: resolverDono(key)?.dono ?? null,
      valor: r.valor,
      classeAbc: classePorKey.get(key) ?? null,
    });
  }
  for (const r of ped) {
    if (!r.codigo) continue;
    const nome = nomePorCodigo.get(codigoClienteKey(r.codigo)) ?? r.codigo;
    const key = normalizeClienteKey(nome);
    rows.push({
      origem: "Entrada de pedido",
      codigo: r.codigo,
      cliente: nome,
      ano: Number(r.mes.slice(0, 4)),
      mes: r.mes,
      vendedorEpoca: r.vendedor,
      vendedorCarteira: resolverDono(key)?.dono ?? null,
      valor: r.valor,
      classeAbc: classePorKey.get(key) ?? null,
    });
  }

  rows.sort(
    (a, b) =>
      a.cliente.localeCompare(b.cliente, "pt-BR") ||
      a.origem.localeCompare(b.origem) ||
      a.mes.localeCompare(b.mes),
  );

  return { abcAno, rows };
}
