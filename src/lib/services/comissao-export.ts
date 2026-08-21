// src/lib/services/comissao-export.ts
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { getExtratoVendedor } from "@/lib/services/comissao";

const MESES_LABEL = [
  "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
  "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
];

const FMT_BRL = '_-"R$ "#,##0.00_-;-"R$ "#,##0.00_-;"R$ "0.00';
const FMT_PCT = "0.0%";

/**
 * Gera o .xlsx do extrato de um vendedor/ano (pedido na reunião de ago/2026:
 * o vendedor recebe o arquivo como evidência auditável, e CSV é ruim de
 * tratar). Três abas espelhando a tela:
 *  - "Apuração"   → meses nas linhas: Meta, Gatilho, EP, % mês, % acum.,
 *                   Saldo, Saldo Acum., Habilita, Previsão[, A Receber]
 *  - "Programado" → faturado aguardando pagamento, janela × mês
 *  - "Pagos"      → pedidos pagos, janela × mês
 * Valores saem como número (formato R$/% na célula), não texto.
 *
 * Não retorna Response — só o buffer; a API route põe os headers.
 */
export async function gerarXlsxExtrato(
  tenantId: string,
  vend: string,
  ano: number,
): Promise<{ buffer: Buffer; filename: string } | null> {
  const extrato = await getExtratoVendedor(tenantId, vend, ano);
  if (!extrato) return null;
  const vendInfo = await prisma.comissaoVendedor.findFirst({
    where: { tenantId, codigoProtheus: vend },
    select: { nome: true, cargo: true },
  });
  const buffer = await montarXlsxExtrato(extrato, vendInfo, vend, ano);
  return { buffer, filename: `comissao-extrato-${vend}-${ano}.xlsx` };
}

/** Montagem pura do workbook (separada para testes — sem banco). */
export async function montarXlsxExtrato(
  extrato: NonNullable<Awaited<ReturnType<typeof getExtratoVendedor>>>,
  vendInfo: { nome: string; cargo: string } | null,
  vend: string,
  ano: number,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Autron Dash — Comissões";
  wb.created = new Date();

  const temGarantido = extrato.garantido != null;

  // ──────────────────────────────────────────────────────────────
  // Aba 1: Apuração
  // ──────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet("Apuração");
  ws.columns = [
    { width: 10 },
    ...Array.from({ length: 9 + (temGarantido ? 1 : 0) }, () => ({ width: 16 })),
  ];

  const titulo = ws.addRow([`Extrato de Comissão — ${vend} ${vendInfo?.nome ?? ""} — ${ano}`]);
  titulo.font = { size: 14, bold: true };
  ws.addRow([
    `Cargo: ${vendInfo?.cargo ?? "—"}`,
    `Comissão: ${(extrato.regra.comissaoPct * 100).toFixed(2)}%`,
    `Gatilho: ${extrato.regra.gatilhoPct > 0 ? `${(extrato.regra.gatilhoPct * 100).toFixed(0)}%` : "sem gatilho"}`,
    ...(extrato.membros.length > 1 ? [`Carteira: ${extrato.membros.join(" / ")}`] : []),
  ]);
  ws.addRow([]);

  const header = ws.addRow([
    "Mês", "Meta", "Gatilho", "EP", "% Meta (mês)", "% Meta (acum.)",
    "Saldo", "Saldo Acum.", "Habilita", "Previsão",
    ...(temGarantido ? ["A Receber"] : []),
  ]);
  header.font = { bold: true };

  for (const [i, m] of extrato.apuracao.entries()) {
    const r = ws.addRow([
      MESES_LABEL[m.mes - 1],
      m.meta,
      m.gatilho,
      m.ep,
      m.pctMes,
      m.pctAcumulado,
      m.saldo,
      m.saldoAcumulado,
      m.habilita ? "SIM" : "NÃO",
      m.previsao,
      ...(temGarantido ? [extrato.aReceber[i]] : []),
    ]);
    for (const col of [2, 3, 4, 7, 8, 10, ...(temGarantido ? [11] : [])]) {
      r.getCell(col).numFmt = FMT_BRL;
    }
    for (const col of [5, 6]) r.getCell(col).numFmt = FMT_PCT;
    // Vermelho quando o acumulado caiu abaixo do gatilho (mês não habilitado)
    if (!m.habilita) {
      r.getCell(9).font = { bold: true, color: { argb: "FFE11D48" } };
      r.getCell(6).font = { color: { argb: "FFE11D48" } };
    }
  }

  const { apuracao, aReceber } = extrato;
  const soma = (f: (m: (typeof apuracao)[number], i: number) => number) =>
    apuracao.reduce((s, m, i) => s + f(m, i), 0);
  const totalRow = ws.addRow([
    "TOTAL",
    soma((m) => m.meta),
    soma((m) => m.gatilho),
    soma((m) => m.ep),
    null,
    [...apuracao].reverse().find((m) => m.pctAcumulado != null)?.pctAcumulado ?? null,
    soma((m) => m.saldo),
    apuracao[11].saldoAcumulado,
    "",
    soma((m) => m.previsao),
    ...(temGarantido ? [soma((_, i) => aReceber[i])] : []),
  ]);
  totalRow.font = { bold: true };
  for (const col of [2, 3, 4, 7, 8, 10, ...(temGarantido ? [11] : [])]) {
    totalRow.getCell(col).numFmt = FMT_BRL;
  }
  totalRow.getCell(6).numFmt = FMT_PCT;

  // ──────────────────────────────────────────────────────────────
  // Abas 2 e 3: grids janela × mês
  // ──────────────────────────────────────────────────────────────
  addJanelaSheet(wb, "Programado", "Programado para Pagar (faturado, aguardando cliente)", extrato.programados);
  addJanelaSheet(wb, "Pagos", "Pedidos Pagos por Janela", extrato.pedidosPagos);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function addJanelaSheet(
  wb: ExcelJS.Workbook,
  nome: string,
  titulo: string,
  grid: Map<string, number[]>,
): void {
  const ws = wb.addWorksheet(nome);
  ws.columns = [{ width: 14 }, ...Array.from({ length: 13 }, () => ({ width: 14 }))];

  const t = ws.addRow([titulo]);
  t.font = { size: 12, bold: true };
  ws.addRow([]);

  const header = ws.addRow(["Janela", ...MESES_LABEL, "Total"]);
  header.font = { bold: true };

  const entradas = Array.from(grid.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [janela, valores] of entradas) {
    const total = valores.reduce((s, v) => s + v, 0);
    const r = ws.addRow([janela, ...valores, total]);
    for (let c = 2; c <= 14; c++) r.getCell(c).numFmt = FMT_BRL;
  }
  if (entradas.length === 0) {
    ws.addRow(["(sem registros no ano)"]);
  }
}
