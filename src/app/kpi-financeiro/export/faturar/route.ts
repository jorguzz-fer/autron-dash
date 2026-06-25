import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getUserAccess } from "@/lib/services/perfis";
import { csvCurrency, toCsv, type CsvRow } from "@/lib/csv";
import { getAFaturar } from "@/lib/services/kpiFinanceiro";
import { AGING_BUCKETS, type AFaturarBase } from "@/lib/domain/kpiFinanceiro";

/**
 * GET /kpi-financeiro/export/faturar?base=emissao|entrega
 * CSV de "A Faturar" (carteira EM ABERTO) agrupado por cliente, com aging.
 * Acesso: capacidade ACCESS_KPI_FINANCEIRO.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await getUserAccess(session.user.tenantId, session.user.id);
  if (!access.capabilities.includes("ACCESS_KPI_FINANCEIRO")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const base: AFaturarBase = req.nextUrl.searchParams.get("base") === "entrega" ? "entrega" : "emissao";
  const clientes = await getAFaturar(session.user.tenantId, base);

  const headers = [
    "Cliente",
    "PVs",
    "Itens",
    "Total a Faturar",
    "Prazo médio emissão→entrega (dias)",
    ...AGING_BUCKETS.map((b) => `${b} dias`),
    "Sem data",
    "Maior aging (dias)",
  ];

  const rows: CsvRow[] = clientes.map((c) => [
    c.cliente,
    c.qtdPedidos,
    c.qtdItens,
    csvCurrency(c.total),
    c.leadMedioDias != null ? Math.round(c.leadMedioDias) : "",
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
