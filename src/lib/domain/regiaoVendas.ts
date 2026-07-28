/**
 * Lógica pura da Análise Regional de Vendas — sem I/O, fácil de testar.
 *
 * Três blocos independentes:
 *  1. Geografia/região — normaliza cidade+UF numa chave canônica e resolve a
 *     qual região (território) um cliente pertence (município vence UF).
 *  2. Curva ABC — Pareto acumulado de receita por cliente (classes A/B/C).
 *  3. Churn — status de (in)atividade do cliente por janelas configuráveis.
 *
 * A cidade do cliente NÃO existe no faturamento (só UF); ela é derivada fora
 * daqui (enrich/Ploomes). Estas funções recebem os dados já montados.
 */

// ─── 1. Geografia / resolução de região ─────────────────────────────────────

/** Normaliza um token de texto (cidade/UF): sem acento, caixa alta, 1 espaço. */
export function normalizeGeoToken(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chave canônica de município: "CIDADE/UF" (ambos normalizados). Retorna null
 * quando falta a cidade — nesse caso o cliente só é resolvível por UF.
 *   municipioKey("São José dos Campos", "sp") → "SAO JOSE DOS CAMPOS/SP"
 */
export function municipioKey(
  cidade: string | null | undefined,
  uf: string | null | undefined,
): string | null {
  const c = normalizeGeoToken(cidade);
  if (!c) return null;
  const u = normalizeGeoToken(uf);
  return u ? `${c}/${u}` : c;
}

/** Geografia resolvida de um cliente (entrada da resolução de região). */
export interface ClienteGeo {
  /** Chave "CIDADE/UF" quando a cidade é conhecida; null se só há UF. */
  municipioKey: string | null;
  /** UF (2 letras, já normalizada ou não). */
  uf: string | null;
}

/** Definição mínima de região para a resolução (o que o algoritmo precisa). */
export interface RegiaoDef {
  id: string;
  /** UFs inteiras da região (serão normalizadas na comparação). */
  ufs: string[];
  /** Chaves "CIDADE/UF" da região (serão normalizadas na comparação). */
  municipios: string[];
  /** Ordem de desempate quando mais de uma região casa (menor vence). */
  ordem?: number;
}

/**
 * Resolve a região de um cliente a partir da sua geografia.
 *
 * Precedência: um MUNICÍPIO listado numa região vence uma correspondência só
 * por UF — assim dá pra recortar SP em litoral/Vale/interior sem que a região
 * estadual "SP" roube os clientes. Empates (duas regiões reivindicando o mesmo
 * município/UF) resolvem por `ordem` asc e depois `id` — determinístico.
 *
 * Retorna o id da região, ou null quando nada casa ("Sem região").
 */
export function resolveRegiao(
  geo: ClienteGeo,
  regioes: RegiaoDef[],
): string | null {
  const mkey = geo.municipioKey ? normalizeGeoToken(geo.municipioKey) : null;
  const uf = normalizeGeoToken(geo.uf);

  const ordered = [...regioes].sort(
    (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.id.localeCompare(b.id),
  );

  // 1ª passada: match por município (mais específico).
  if (mkey) {
    for (const r of ordered) {
      if (r.municipios.some((m) => normalizeGeoToken(m) === mkey)) return r.id;
    }
  }
  // 2ª passada: match por UF.
  if (uf) {
    for (const r of ordered) {
      if (r.ufs.some((u) => normalizeGeoToken(u) === uf)) return r.id;
    }
  }
  return null;
}

// ─── 2. Curva ABC ───────────────────────────────────────────────────────────

export type ClasseAbc = "A" | "B" | "C";

export interface AbcInput {
  key: string;
  label: string;
  receita: number;
}

export interface AbcRow extends AbcInput {
  /** Participação individual (%) sobre o total — 0..100. */
  pctIndividual: number;
  /** Participação acumulada (%) até este cliente, inclusive — 0..100. */
  pctAcumulado: number;
  classe: ClasseAbc;
}

export interface AbcOptions {
  /** Corte da classe A por participação ACUMULADA (fração 0..1). Padrão 0.80. */
  aCutoff?: number;
  /** Corte da classe B por participação ACUMULADA (fração 0..1). Padrão 0.95. */
  bCutoff?: number;
}

/**
 * Curva ABC (Pareto) de clientes por receita.
 *
 * Ordena por receita desc e classifica pela participação acumulada ANTES de
 * incluir o cliente: o cliente que "cruza" os 80% ainda entra em A (os clientes
 * que juntos formam ~80% da receita). Clientes com receita <= 0 nunca são A/B —
 * vão pra C (não distorcem a curva). Total <= 0 → todos C.
 */
export function computeAbc(clientes: AbcInput[], opts: AbcOptions = {}): AbcRow[] {
  const aCutoff = opts.aCutoff ?? 0.8;
  const bCutoff = opts.bCutoff ?? 0.95;

  const total = clientes.reduce((s, c) => s + (c.receita > 0 ? c.receita : 0), 0);

  // Ordena por receita desc; estável no desempate (mantém a ordem de entrada).
  const ordered = clientes
    .map((c, i) => ({ c, i }))
    .sort((x, y) => y.c.receita - x.c.receita || x.i - y.i)
    .map((x) => x.c);

  const rows: AbcRow[] = [];
  let running = 0; // fração acumulada ANTES do cliente atual
  for (const c of ordered) {
    const pctInd = total > 0 && c.receita > 0 ? c.receita / total : 0;
    let classe: ClasseAbc;
    if (c.receita <= 0 || total <= 0) {
      classe = "C";
    } else if (running < aCutoff) {
      classe = "A";
    } else if (running < bCutoff) {
      classe = "B";
    } else {
      classe = "C";
    }
    running += pctInd;
    rows.push({
      key: c.key,
      label: c.label,
      receita: c.receita,
      pctIndividual: pctInd * 100,
      pctAcumulado: running * 100,
      classe,
    });
  }
  return rows;
}

/** Contagem de clientes por classe (para KPIs/resumos). */
export function contarPorClasse(rows: AbcRow[]): Record<ClasseAbc, number> {
  const out: Record<ClasseAbc, number> = { A: 0, B: 0, C: 0 };
  for (const r of rows) out[r.classe] += 1;
  return out;
}

// ─── 3. Churn (inatividade) ─────────────────────────────────────────────────

export type ChurnStatus = "ATIVO" | "EM_RISCO" | "PERDIDO" | "SEM_HISTORICO";

export interface ChurnOptions {
  /** Meses sem faturar para virar EM_RISCO. Padrão 6. */
  emRiscoMeses?: number;
  /** Meses sem faturar para virar PERDIDO (churn). Padrão 12. */
  perdidoMeses?: number;
}

/** Subtrai `n` meses de uma data (UTC), normalizando overflow de dia. */
export function subMonths(date: Date, n: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - n, date.getUTCDate()),
  );
}

/**
 * Status de churn a partir da última emissão de nota do cliente.
 *
 *   ATIVO   — faturou dentro da janela de risco (padrão: últimos 6 meses)
 *   EM_RISCO— última compra entre as duas janelas (6–12 meses)
 *   PERDIDO — sem faturar há mais que a janela de perda (padrão: 12 meses)
 *   SEM_HISTORICO — nunca faturou (ultimaEmissao nula)
 *
 * As janelas são configuráveis (o cliente pediu 6 e 12). Comparação por datas
 * de corte (refData − N meses), sem ambiguidade de "mês fracionário".
 */
export function computeChurnStatus(
  ultimaEmissao: Date | null | undefined,
  refData: Date,
  opts: ChurnOptions = {},
): ChurnStatus {
  if (!ultimaEmissao) return "SEM_HISTORICO";
  const emRiscoMeses = opts.emRiscoMeses ?? 6;
  const perdidoMeses = opts.perdidoMeses ?? 12;

  const cutoffEmRisco = subMonths(refData, emRiscoMeses);
  const cutoffPerdido = subMonths(refData, perdidoMeses);

  if (ultimaEmissao.getTime() >= cutoffEmRisco.getTime()) return "ATIVO";
  if (ultimaEmissao.getTime() >= cutoffPerdido.getTime()) return "EM_RISCO";
  return "PERDIDO";
}
