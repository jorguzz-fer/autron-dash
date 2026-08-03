import { fmtCurrency } from "@/lib/format";
import type { FatMensalRow } from "@/lib/services/regiaoVendas";
import type { HistoricoDim } from "./histTypes";

const MES_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "YYYY-MM" → "mmm/aa" (ex.: 2026-08 → ago/26). */
function fmtMesLabel(mes: string): string {
  const [ano, m] = mes.split("-");
  const idx = Number(m) - 1;
  return `${MES_LABELS[idx] ?? m}/${(ano ?? "").slice(2)}`;
}

interface PivotRow {
  chave: string;
  porMes: Record<string, number>;
  total: number;
}

interface Props {
  /** Linhas mês-a-mês JÁ filtradas pelo recorte de região da página. */
  rows: FatMensalRow[];
  dim: HistoricoDim;
  /** Máx. de linhas exibidas (top N por total do período). */
  limit?: number;
}

/**
 * Tabela-pivô do histórico mês a mês: linhas = vendedor OU cliente,
 * colunas = meses, células = faturamento líquido. Primeira coluna e a
 * linha de total ficam "grudadas" (sticky) para leitura em janelas largas.
 * Componente de servidor puro — o toggle vendedor/cliente é URL-driven.
 */
export default function HistoricoMensal({ rows, dim, limit = 40 }: Props) {
  // Pivô por dimensão escolhida.
  const mesesSet = new Set<string>();
  const totalPorMes: Record<string, number> = {};
  const byChave = new Map<string, PivotRow>();
  let totalGeral = 0;

  for (const r of rows) {
    const chave =
      dim === "vendedor" ? r.vendedor ?? "Sem vendedor" : r.cliente || "Sem cliente";
    mesesSet.add(r.mes);
    totalPorMes[r.mes] = (totalPorMes[r.mes] ?? 0) + r.receita;
    totalGeral += r.receita;

    let row = byChave.get(chave);
    if (!row) {
      row = { chave, porMes: {}, total: 0 };
      byChave.set(chave, row);
    }
    row.porMes[r.mes] = (row.porMes[r.mes] ?? 0) + r.receita;
    row.total += r.receita;
  }

  const meses = Array.from(mesesSet).sort();
  const allRows = Array.from(byChave.values()).sort((a, b) => b.total - a.total);
  const shown = allRows.slice(0, limit);

  if (shown.length === 0 || meses.length === 0) {
    return (
      <p className="py-8 text-center text-[13px]" style={{ color: "var(--fg-muted)" }}>
        Sem faturamento no período/recorte selecionado.
      </p>
    );
  }

  const colLabel = dim === "vendedor" ? "Vendedor" : "Cliente";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr
            className="text-[10.5px] uppercase tracking-wider"
            style={{
              color: "var(--fg-muted)",
              backgroundColor: "var(--surface-2)",
              borderBottom: "1px solid var(--border-soft)",
            }}
          >
            <th
              className="sticky left-0 z-10 px-3 py-2.5 text-left font-semibold"
              style={{ minWidth: 220, backgroundColor: "var(--surface-2)" }}
            >
              {colLabel}
            </th>
            {meses.map((m) => (
              <th key={m} className="px-2 py-2.5 text-right font-semibold" style={{ minWidth: 78 }}>
                {fmtMesLabel(m)}
              </th>
            ))}
            <th
              className="px-3 py-2.5 text-right font-bold"
              style={{ minWidth: 100, color: "var(--fg-strong)" }}
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.chave} style={{ borderTop: "1px solid var(--border-soft)" }}>
              <td
                className="sticky left-0 z-10 px-3 py-2 font-medium"
                style={{ color: "var(--fg)", backgroundColor: "var(--surface)" }}
                title={row.chave}
              >
                <span className="block max-w-[260px] truncate">{row.chave}</span>
              </td>
              {meses.map((m) => {
                const v = row.porMes[m];
                return (
                  <td
                    key={m}
                    className="numeric px-2 py-2 text-right"
                    style={{ color: v ? "var(--fg)" : "var(--fg-muted)" }}
                  >
                    {v ? fmtCurrency(v, { compact: true }) : "—"}
                  </td>
                );
              })}
              <td
                className="numeric px-3 py-2 text-right font-semibold"
                style={{ color: "var(--color-brand-500)" }}
              >
                {fmtCurrency(row.total, { decimals: 0 })}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr
            style={{
              borderTop: "2px solid var(--border-strong)",
              backgroundColor: "color-mix(in srgb, var(--color-brand-500) 5%, var(--surface))",
            }}
          >
            <td
              className="sticky left-0 z-10 px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-wider"
              style={{
                color: "var(--fg-strong)",
                backgroundColor: "color-mix(in srgb, var(--color-brand-500) 5%, var(--surface))",
              }}
            >
              Total
            </td>
            {meses.map((m) => (
              <td
                key={m}
                className="numeric px-2 py-2.5 text-right text-[11px] font-bold"
                style={{ color: "var(--fg-strong)" }}
              >
                {totalPorMes[m] ? fmtCurrency(totalPorMes[m], { compact: true }) : "—"}
              </td>
            ))}
            <td
              className="numeric px-3 py-2.5 text-right text-[11px] font-bold"
              style={{ color: "var(--color-brand-500)" }}
            >
              {fmtCurrency(totalGeral, { decimals: 0 })}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Nº de chaves distintas (para a legenda "top N de M"). */
export function contarChaves(rows: FatMensalRow[], dim: HistoricoDim): number {
  const set = new Set<string>();
  for (const r of rows) {
    set.add(dim === "vendedor" ? r.vendedor ?? "Sem vendedor" : r.cliente || "Sem cliente");
  }
  return set.size;
}
