import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { csvCurrency, toCsv, type CsvRow } from "@/lib/csv";
import { getBaseVendasDetalhada } from "@/lib/services/carteira";

/**
 * GET /analise-regional/base-pivot
 * Base detalhada para tabela dinâmica no Excel, combinando FATURAMENTO e
 * ENTRADA DE PEDIDOS numa lista só (coluna "Origem"), no grão
 * (cliente, mês, vendedor da época). Cada linha: código do cliente, nome,
 * vendedor da época, vendedor atual da carteira (dono), valor e classe ABC do
 * cliente sobre o faturamento do ano-base.
 * Considera toda a história. Ano-base ABC via ?abcAno= (default: ano anterior).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = session.user.tenantId;

  const url = new URL(req.url);
  const abcAnoParam = Number(url.searchParams.get("abcAno"));
  const abcAno =
    Number.isInteger(abcAnoParam) && abcAnoParam >= 2000 && abcAnoParam <= 2100
      ? abcAnoParam
      : new Date().getFullYear() - 1;

  const { rows: dados } = await getBaseVendasDetalhada(tenantId, abcAno);

  const headers = [
    "Origem",
    "Codigo cliente",
    "Nome cliente",
    "Cidade",
    "UF",
    "Ano",
    "Mes",
    "Vendedor da epoca",
    "Vendedor atual da carteira",
    "Valor",
    `Classe ABC ${abcAno}`,
  ];

  const rows: CsvRow[] = dados.map((r) => [
    r.origem,
    r.codigo,
    r.cliente,
    r.cidade ?? "",
    r.uf ?? "",
    r.ano ?? "",
    r.mes,
    r.vendedorEpoca ?? "",
    r.vendedorCarteira ?? "",
    csvCurrency(r.valor),
    r.classeAbc ?? "",
  ]);

  const body = toCsv(headers, rows);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="base-vendas-detalhada.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
