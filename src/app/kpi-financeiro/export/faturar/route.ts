import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { canSeeKpiFinanceiro } from "@/lib/kpiAccess";
import { csvCurrency, toCsv, type CsvRow } from "@/lib/csv";
import { getAFaturar } from "@/lib/services/kpiFinanceiro";
import { AGING_BUCKETS, type AFaturarBase } from "@/lib/domain/kpiFinanceiro";

/**
 * GET /kpi-financeiro/export/faturar?base=emissao|entrega
 * CSV de "A Faturar" (carteira EM ABERTO) agrupado por cliente, com aging.
 * Acesso: ADMIN + Controladoria (Daiana).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeKpiFinanceiro(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const base: AFaturarBase = req.nextUrl.searchParams.get("base") === "entrega" ? "entrega" : "emissao";
  const clientes = await getAFaturar(session.user.tenantId, base);

  const headers = [
    "Cliente",
    "PVs",
    "Itens",
    "Total a Faturar",
    ...AGING_BUCKETS.map((b) => `${b} dias`),
    "Sem data",
    "Maior aging (dias)",
  ];

  const rows: CsvRow[] = clientes.map((c) => [
    c.cliente,
    c.qtdPedidos,
    c.qtdItens,
    csvCurrency(c.total),
    ...AGING_BUCKETS.map((b) => csvCurrency(c.aging[b])),
    csvCurrency(c.semData),
    c.diasMax,
  ]);

  const body = toCsv(headers, rows);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="a-faturar-por-cliente-${base}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
