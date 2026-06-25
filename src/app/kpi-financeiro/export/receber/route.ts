import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserAccess } from "@/lib/services/perfis";
import { csvCurrency, toCsv, type CsvRow } from "@/lib/csv";
import { getAReceber } from "@/lib/services/kpiFinanceiro";
import { AGING_BUCKETS } from "@/lib/domain/kpiFinanceiro";

/**
 * GET /kpi-financeiro/export/receber
 * CSV de "A Receber" agrupado por cliente (uma linha por cliente), com aging
 * de vencidos e a vencer. Acesso: capacidade ACCESS_KPI_FINANCEIRO.
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await getUserAccess(session.user.tenantId, session.user.id);
  if (!access.capabilities.includes("ACCESS_KPI_FINANCEIRO")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clientes, dataReferencia } = await getAReceber(session.user.tenantId);

  const headers = [
    "Cliente",
    "Cadastros",
    "Unidades",
    "Códigos",
    "Títulos",
    "Vencido",
    "Em Cartório",
    "A Vencer",
    "Total",
    "Maior Atraso (dias)",
    ...AGING_BUCKETS.map((b) => `Vencido ${b}`),
    ...AGING_BUCKETS.map((b) => `Cartório ${b}`),
    ...AGING_BUCKETS.map((b) => `A Vencer ${b}`),
  ];

  const rows: CsvRow[] = clientes.map((c) => [
    c.cliente,
    c.qtdCadastros,
    c.unidades.join(" · "),
    c.codigos.join(" "),
    c.qtdTitulos,
    csvCurrency(c.totalVencido),
    csvCurrency(c.totalCartorio),
    csvCurrency(c.totalAVencer),
    csvCurrency(c.total),
    c.maiorAtraso,
    ...AGING_BUCKETS.map((b) => csvCurrency(c.agingVencido[b])),
    ...AGING_BUCKETS.map((b) => csvCurrency(c.agingCartorio[b])),
    ...AGING_BUCKETS.map((b) => csvCurrency(c.agingAVencer[b])),
  ]);

  const refTag = dataReferencia
    ? `-${dataReferencia.toISOString().slice(0, 10)}`
    : "";
  const body = toCsv(headers, rows);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="a-receber-por-cliente${refTag}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
