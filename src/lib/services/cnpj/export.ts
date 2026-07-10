import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { formatCnpj } from "@/lib/domain/cnpj";

/**
 * Gera um .xlsx com os registros enriquecidos de um EnrichmentBatch.
 * Retorna só o buffer + nome do arquivo; o caller (API route) define o
 * Content-Disposition.
 */
export async function gerarXlsxEnriquecimento(
  batchId: string,
  tenantId: string,
): Promise<{ buffer: Buffer; filename: string } | null> {
  const batch = await prisma.enrichmentBatch.findFirst({
    where: { id: batchId, tenantId },
  });
  if (!batch) return null;

  const registros = await prisma.enrichmentRecord.findMany({
    where: { batchId, tenantId },
    orderBy: { rowIndex: "asc" },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Autron Dash — Enriquecimento CNPJ";
  wb.created = new Date();

  const ws = wb.addWorksheet("Enriquecimento");
  ws.columns = [
    { header: "Origem", key: "origem", width: 14 },
    { header: "Código", key: "codigo", width: 12 },
    { header: "Loja", key: "loja", width: 8 },
    { header: "Nome (planilha)", key: "inputName", width: 34 },
    { header: "CNPJ/CPF", key: "cnpj", width: 20 },
    { header: "Status", key: "status", width: 12 },
    { header: "Fonte", key: "source", width: 12 },
    { header: "Razão Social", key: "razaoSocial", width: 34 },
    { header: "Nome Fantasia", key: "nomeFantasia", width: 26 },
    { header: "Situação", key: "situacao", width: 14 },
    { header: "CNAE", key: "cnae", width: 12 },
    { header: "CNAE Descrição", key: "cnaeDesc", width: 34 },
    { header: "CNAEs Secundários", key: "cnaeSec", width: 44 },
    { header: "Capital Social", key: "capital", width: 18 },
    { header: "Porte", key: "porte", width: 14 },
    { header: "Matriz/Filial", key: "matrizFilial", width: 14 },
    { header: "Grau de Risco (NR-4)", key: "grauRisco", width: 18 },
    { header: "SESMT provável", key: "sesmt", width: 16 },
    { header: "RH estruturado provável", key: "rh", width: 22 },
    { header: "E-mail", key: "email", width: 28 },
    { header: "Telefone 1", key: "tel1", width: 18 },
    { header: "Telefone 2", key: "tel2", width: 18 },
    { header: "Logradouro", key: "logradouro", width: 30 },
    { header: "Número", key: "numero", width: 10 },
    { header: "Complemento", key: "complemento", width: 18 },
    { header: "Bairro", key: "bairro", width: 20 },
    { header: "Município", key: "municipio", width: 22 },
    { header: "UF", key: "uf", width: 6 },
    { header: "CEP", key: "cep", width: 12 },
    { header: "Inscrições Estaduais", key: "ie", width: 44 },
    { header: "Observação", key: "obs", width: 36 },
  ];

  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF363636" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws.getRow(1).height = 22;

  const boolLabel = (v: boolean | null) => (v === null ? "" : v ? "Sim" : "Não");
  const fmtCnaesSec = (v: unknown): string => {
    if (!Array.isArray(v)) return "";
    return v
      .map((c) => {
        const o = c as { codigo?: unknown; descricao?: unknown };
        return `${o?.codigo ?? ""} ${o?.descricao ?? ""}`.trim();
      })
      .filter(Boolean)
      .join("; ");
  };

  for (const r of registros) {
    const row = ws.addRow({
      origem: r.origem ?? "",
      codigo: r.inputCodigo ?? "",
      loja: r.inputLoja ?? "",
      inputName: r.inputName ?? "",
      cnpj: r.tipoDoc === "CNPJ" ? formatCnpj(r.cnpj) : r.cnpj,
      status: r.status,
      source: r.source ?? "",
      razaoSocial: r.razaoSocial ?? "",
      nomeFantasia: r.nomeFantasia ?? "",
      situacao: r.situacao ?? "",
      cnae: r.cnaePrincipal ?? "",
      cnaeDesc: r.cnaeDescricao ?? "",
      cnaeSec: fmtCnaesSec(r.cnaesSecundarios),
      capital: r.capitalSocial == null ? null : Number(r.capitalSocial),
      porte: r.porte ?? "",
      matrizFilial: r.matrizFilial ?? "",
      grauRisco: r.grauRisco ?? "",
      sesmt: boolLabel(r.sesmtProvavel),
      rh: boolLabel(r.rhEstruturadoProvavel),
      email: r.email ?? "",
      tel1: r.telefone1 ?? "",
      tel2: r.telefone2 ?? "",
      logradouro: r.logradouro ?? "",
      numero: r.numero ?? "",
      complemento: r.complemento ?? "",
      bairro: r.bairro ?? "",
      municipio: r.municipio ?? "",
      uf: r.uf ?? "",
      cep: r.cep ?? "",
      ie: r.ieResumo ?? "",
      obs: r.errorMessage ?? "",
    });
    const capCell = row.getCell("capital");
    capCell.numFmt = '_-"R$ "#,##0.00_-;-"R$ "#,##0.00_-;"-"';
    capCell.alignment = { horizontal: "right" };
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const safeName = batch.filename.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9.-]/g, "_");
  return { buffer: Buffer.from(buffer), filename: `enriquecimento-${safeName}.xlsx` };
}
