/**
 * Lógica pura da seção KPI Financeiro — sem I/O, fácil de testar.
 *
 * Dois indicadores:
 *  1. A RECEBER  — títulos já faturados, ainda não recebidos (vencidos + a
 *     vencer). Vem do relatório FINR130 (dataset TITULO_RECEBER).
 *  2. A FATURAR  — pedidos em carteira ainda sem nota fiscal (EM ABERTO). Vem
 *     dos Pedidos (entrada_pedido) já carregados no Dash.
 *
 * Em ambos agrupamos por CLIENTE numa única linha — clientes com filiais têm
 * mais de um cadastro (CNPJ) com o mesmo nome no Protheus; somamos todos.
 */

// Faixas de aging (idênticas ao modelo manual da controladoria).
export const AGING_BUCKETS = ["0-29", "30-60", "61-90", "91-120", ">120"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** Classifica uma quantidade de dias numa faixa de aging. */
export function agingBucket(dias: number): AgingBucket {
  if (dias <= 29) return "0-29";
  if (dias <= 60) return "30-60";
  if (dias <= 90) return "61-90";
  if (dias <= 120) return "91-120";
  return ">120";
}

/** Mapa de aging zerado (todas as faixas em 0). */
export function emptyAging(): Record<AgingBucket, number> {
  return { "0-29": 0, "30-60": 0, "61-90": 0, "91-120": 0, ">120": 0 };
}

/** Diferença em dias inteiros (to − from), ignorando horas. */
export function diffDays(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((b - a) / 86_400_000);
}

/**
 * Chave de agrupamento por nome do cliente — normaliza caixa/acentos/espaços
 * pra fundir filiais cadastradas com o mesmo nome ("3M - SUMARE" × "3M - SUMARE").
 */
export function normalizeClienteKey(nome: string | null | undefined): string {
  if (!nome) return "";
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ─── A Receber ──────────────────────────────────────────────────────────────

export interface TituloReceberItem {
  codigoCliente: string | null;
  loja: string | null;
  nomeCliente: string | null;
  saldoVencido: number;
  saldoAVencer: number;
  diasAtraso: number;
  vencimento: Date | null;
}

export interface ClienteAReceber {
  cliente: string;
  codigos: string[];
  qtdCadastros: number;
  qtdTitulos: number;
  totalVencido: number;
  totalAVencer: number;
  total: number;
  /** Maior dias de atraso entre os títulos vencidos do cliente (0 se nenhum). */
  maiorAtraso: number;
  /** Aging dos VENCIDOS por dias de atraso. */
  agingVencido: Record<AgingBucket, number>;
  /** Aging dos A VENCER por dias até o vencimento. */
  agingAVencer: Record<AgingBucket, number>;
}

/**
 * Agrupa títulos a receber por cliente (uma linha por cliente). `hoje` é a data
 * de referência usada pra calcular quantos dias faltam pros títulos a vencer.
 */
export function groupAReceber(
  titulos: TituloReceberItem[],
  hoje: Date,
): ClienteAReceber[] {
  const map = new Map<string, ClienteAReceber & { _cadastros: Set<string>; _codigos: Set<string> }>();

  for (const t of titulos) {
    const nome = t.nomeCliente?.trim() || t.codigoCliente || "—";
    const key = normalizeClienteKey(t.nomeCliente) || t.codigoCliente || "—";

    let g = map.get(key);
    if (!g) {
      g = {
        cliente: nome,
        codigos: [],
        qtdCadastros: 0,
        qtdTitulos: 0,
        totalVencido: 0,
        totalAVencer: 0,
        total: 0,
        maiorAtraso: 0,
        agingVencido: emptyAging(),
        agingAVencer: emptyAging(),
        _cadastros: new Set<string>(),
        _codigos: new Set<string>(),
      };
      map.set(key, g);
    }

    if (t.codigoCliente) {
      g._codigos.add(t.codigoCliente);
      g._cadastros.add(`${t.codigoCliente}-${t.loja ?? ""}`);
    }
    g.qtdTitulos += 1;
    g.totalVencido += t.saldoVencido;
    g.totalAVencer += t.saldoAVencer;
    g.total += t.saldoVencido + t.saldoAVencer;

    if (t.saldoVencido > 0) {
      const dias = t.diasAtraso > 0 ? t.diasAtraso : 0;
      g.maiorAtraso = Math.max(g.maiorAtraso, dias);
      g.agingVencido[agingBucket(dias)] += t.saldoVencido;
    }
    if (t.saldoAVencer > 0) {
      const dias = t.vencimento ? Math.max(0, diffDays(hoje, t.vencimento)) : 0;
      g.agingAVencer[agingBucket(dias)] += t.saldoAVencer;
    }
  }

  return Array.from(map.values())
    .map((g) => {
      g.codigos = Array.from(g._codigos).sort();
      g.qtdCadastros = g._cadastros.size;
      const { _cadastros: _c, _codigos: _k, ...rest } = g;
      void _c;
      void _k;
      return rest;
    })
    .sort((a, b) => b.total - a.total);
}

// ─── A Faturar ──────────────────────────────────────────────────────────────

export type AFaturarBase = "emissao" | "entrega";

export interface PedidoAFaturarItem {
  numPedido: string;
  cliente: string;
  vlrTotal: number;
  dtEmissao: Date | null;
  dtEntrega: Date | null;
}

export interface ClienteAFaturar {
  cliente: string;
  qtdPedidos: number;
  qtdItens: number;
  total: number;
  /** Maior aging (dias) entre os itens do cliente. */
  diasMax: number;
  aging: Record<AgingBucket, number>;
  /** Valor de itens sem a data de referência escolhida (não entram no aging). */
  semData: number;
}

/**
 * Agrupa pedidos a faturar (carteira EM ABERTO) por cliente. `base` define a
 * data de referência do aging: emissão do pedido (idade em carteira) ou entrega
 * prevista (atraso vs. a previsão de faturamento). Dias negativos (entrega
 * futura) caem na primeira faixa.
 */
export function groupAFaturar(
  pedidos: PedidoAFaturarItem[],
  base: AFaturarBase,
  hoje: Date,
): ClienteAFaturar[] {
  const map = new Map<
    string,
    ClienteAFaturar & { _pedidos: Set<string> }
  >();

  for (const p of pedidos) {
    const nome = p.cliente?.trim() || "—";
    const key = normalizeClienteKey(p.cliente) || "—";

    let g = map.get(key);
    if (!g) {
      g = {
        cliente: nome,
        qtdPedidos: 0,
        qtdItens: 0,
        total: 0,
        diasMax: 0,
        aging: emptyAging(),
        semData: 0,
        _pedidos: new Set<string>(),
      };
      map.set(key, g);
    }

    g._pedidos.add(p.numPedido);
    g.qtdItens += 1;
    g.total += p.vlrTotal;

    const ref = base === "emissao" ? p.dtEmissao : p.dtEntrega;
    if (!ref) {
      g.semData += p.vlrTotal;
      continue;
    }
    const dias = Math.max(0, diffDays(ref, hoje));
    g.diasMax = Math.max(g.diasMax, dias);
    g.aging[agingBucket(dias)] += p.vlrTotal;
  }

  return Array.from(map.values())
    .map((g) => {
      g.qtdPedidos = g._pedidos.size;
      const { _pedidos: _p, ...rest } = g;
      void _p;
      return rest;
    })
    .sort((a, b) => b.total - a.total);
}

/** Soma um campo de aging em todas as linhas → total por faixa. */
export function sumAging<T>(
  rows: T[],
  pick: (r: T) => Record<AgingBucket, number>,
): Record<AgingBucket, number> {
  const out = emptyAging();
  for (const r of rows) {
    const a = pick(r);
    for (const b of AGING_BUCKETS) out[b] += a[b] ?? 0;
  }
  return out;
}
