import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";

/**
 * Gera um .xlsx com 2 abas a partir de uma Conciliacao:
 *  - "Resumo"      → totais, diferença, status, observações
 *  - "Divergencias" → tabela completa de NFs com saldos e lado
 *
 * Não retorna Response — só o buffer. O caller (API route) define o
 * Content-Disposition e devolve pro browser.
 */
export async function gerarXlsxConciliacao(
  conciliacaoId: string,
  tenantId: string,
): Promise<{ buffer: Buffer; filename: string } | null> {
  const conc = await prisma.conciliacao.findFirst({
    where: { id: conciliacaoId, tenantId },
    include: {
      divergencias: {
        orderBy: [{ lado: "asc" }, { diferenca: "desc" }],
      },
      user: { select: { name: true } },
    },
  });
  if (!conc) return null;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Autron Dash — Conciliação";
  wb.created = new Date();

  // ──────────────────────────────────────────────────────────────
  // Aba 1: Resumo
  // ──────────────────────────────────────────────────────────────
  const ws1 = wb.addWorksheet("Resumo");
  ws1.columns = [
    { key: "label", width: 32 },
    { key: "valor", width: 32 },
  ];

  // Título
  const titulo = ws1.addRow(["Conciliação Financeiro × Contábil"]);
  ws1.mergeCells(`A${titulo.number}:B${titulo.number}`);
  titulo.font = { size: 14, bold: true, color: { argb: "FF1F2937" } };
  titulo.alignment = { vertical: "middle" };
  titulo.height = 26;
  ws1.addRow([]); // linha em branco

  const rows: [string, string | number | Date | null][] = [
    ["Conta Contábil", conc.contaContabil],
    ["Descrição da Conta", conc.descricaoConta ?? ""],
    ["Data de Referência", conc.dataReferencia],
    ["Status", statusLabel(conc.status)],
    ["Processada por", conc.user?.name ?? "—"],
    ["Processada em", conc.createdAt],
    ["", ""],
    ["Total Financeiro (R$)", Number(conc.totalFinanceiro)],
    ["Total Contábil (R$)", Number(conc.totalContabil)],
    ["Diferença Total (R$)", Number(conc.diferencaTotal)],
    ["Qtd. de Divergências", conc.qtdDivergencias],
    ["", ""],
    ["Arquivo Financeiro", conc.financeiroFileName],
    ["Arquivo Contábil", conc.contabilFileName],
  ];

  for (const [label, valor] of rows) {
    const r = ws1.addRow({ label, valor });
    if (label === "") continue;
    r.getCell(1).font = { bold: true, color: { argb: "FF374151" } };
    if (typeof valor === "number" && label.includes("R$")) {
      r.getCell(2).numFmt = '_-"R$ "#,##0.00_-;-"R$ "#,##0.00_-;"R$ "0.00';
      r.getCell(2).alignment = { horizontal: "right" };
    }
    if (valor instanceof Date) {
      r.getCell(2).numFmt = "dd/mm/yyyy";
    }
  }

  // Observações em bloco separado
  if (conc.observacoes) {
    ws1.addRow([]);
    const labelObs = ws1.addRow(["Observações:", ""]);
    labelObs.getCell(1).font = { bold: true, color: { argb: "FF374151" } };
    const obsRow = ws1.addRow(["", conc.observacoes]);
    ws1.mergeCells(`A${obsRow.number}:B${obsRow.number}`);
    obsRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
    obsRow.height = Math.max(40, Math.min(300, conc.observacoes.length / 4));
  }

  // ──────────────────────────────────────────────────────────────
  // Aba 2: Divergências
  // ──────────────────────────────────────────────────────────────
  const ws2 = wb.addWorksheet("Divergencias");
  ws2.columns = [
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "NF", key: "nf", width: 14 },
    { header: "Parcelas", key: "parcelas", width: 16 },
    { header: "Código Cliente", key: "codigo", width: 16 },
    { header: "Cliente", key: "cliente", width: 36 },
    { header: "Saldo Financeiro (R$)", key: "salFin", width: 22 },
    { header: "Saldo Contábil (R$)", key: "salCont", width: 22 },
    { header: "Diferença (R$)", key: "dif", width: 22 },
  ];

  // Header style
  ws2.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF363636" }, // marca Autron
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws2.getRow(1).height = 22;

  for (const d of conc.divergencias) {
    const row = ws2.addRow({
      tipo: ladoLabel(d.lado),
      nf: d.numeroNF,
      parcelas: d.parcelas ?? "",
      codigo: d.codigoCliente ?? "",
      cliente: d.nomeCliente ?? "",
      salFin: d.saldoFinanceiro == null ? null : Number(d.saldoFinanceiro),
      salCont: d.saldoContabil == null ? null : Number(d.saldoContabil),
      dif: d.diferenca == null ? null : Number(d.diferenca),
    });

    // Formato monetário nas colunas R$ (saldoFin=6, saldoCont=7, dif=8 após inserir Parcelas).
    [6, 7, 8].forEach((col) => {
      const c = row.getCell(col);
      c.numFmt = '_-"R$ "#,##0.00_-;-"R$ "#,##0.00_-;"-"';
      c.alignment = { horizontal: "right" };
    });

    // Realce de linha por tipo
    const bg =
      d.lado === "DIVERGENTE" ? "FFFEE2E2" // vermelho claro
        : d.lado === "SO_CONTABIL" ? "FFFEF3C7" // amarelo claro
        : d.lado === "NF_ANTERIOR" ? "FFE0F2FE" // azul claro — informativo
        : "FFF3F4F6"; // cinza claro

    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    });
  }

  // Auto filter (8 colunas agora: Tipo, NF, Parcelas, CodCli, Cliente, SalFin, SalCont, Dif)
  ws2.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: ws2.rowCount, column: 8 },
  };

  // Linha de total no final
  if (conc.divergencias.length > 0) {
    const totalSalFin = conc.divergencias.reduce(
      (a, d) => a + (d.saldoFinanceiro ? Number(d.saldoFinanceiro) : 0),
      0,
    );
    const totalSalCont = conc.divergencias.reduce(
      (a, d) => a + (d.saldoContabil ? Number(d.saldoContabil) : 0),
      0,
    );
    const totalDif = conc.divergencias.reduce(
      (a, d) => a + (d.diferenca ? Number(d.diferenca) : 0),
      0,
    );
    ws2.addRow([]);
    const totRow = ws2.addRow({
      tipo: "TOTAIS",
      nf: "",
      parcelas: "",
      codigo: "",
      cliente: "",
      salFin: totalSalFin,
      salCont: totalSalCont,
      dif: totalDif,
    });
    totRow.font = { bold: true };
    [6, 7, 8].forEach((col) => {
      totRow.getCell(col).numFmt = '_-"R$ "#,##0.00_-;-"R$ "#,##0.00_-;"-"';
    });
  }

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const filename = buildFilename(conc.contaContabil, conc.dataReferencia);

  return { buffer: Buffer.from(buffer), filename };
}

function statusLabel(s: string): string {
  if (s === "OK") return "Conciliada";
  if (s === "DIVERGENTE") return "Divergente";
  return "Rascunho";
}

function ladoLabel(lado: string): string {
  if (lado === "DIVERGENTE") return "Saldo divergente";
  if (lado === "SO_CONTABIL") return "Só no contábil";
  if (lado === "SO_FINANCEIRO") return "Só no financeiro";
  if (lado === "NF_ANTERIOR") return "NF anterior ao período contábil";
  return lado;
}

function buildFilename(conta: string, dataRef: Date): string {
  const safeConta = conta.replace(/[^a-zA-Z0-9.-]/g, "_");
  const y = dataRef.getUTCFullYear();
  const m = String(dataRef.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dataRef.getUTCDate()).padStart(2, "0");
  return `conciliacao-${safeConta}-${y}${m}${d}.xlsx`;
}
