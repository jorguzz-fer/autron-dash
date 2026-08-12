import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { csvCurrency, toCsv, type CsvRow } from "@/lib/csv";
import { getBaseClientesPivot } from "@/lib/services/regiaoVendas";

/**
 * GET /analise-regional/base-pivot
 * Base "achatada" (uma linha por cliente) para tabela dinâmica no Excel:
 * código, nome, dono (Ploomes), vendedor atual (faturamento) e vendedor do
 * último pedido; faturamento ano a ano (+ total) e entrada de pedidos ano a
 * ano (+ total); classe ABC sobre o faturamento do ano-base.
 * Considera toda a história (sem recorte de período). Ano-base ABC via ?abcAno=
 * (default: ano anterior ao atual).
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

  const { anos, clientes } = await getBaseClientesPivot(tenantId, abcAno);

  const headers = [
    "Codigo cliente",
    "Nome cliente",
    "Dono atual (Ploomes)",
    "Vendedor atual (faturamento)",
    "Vendedor ultimo pedido",
    "Cidade",
    "UF",
    `Classe ABC ${abcAno}`,
    ...anos.map((a) => `Faturamento ${a}`),
    "Faturamento total",
    ...anos.map((a) => `Pedidos ${a}`),
    "Pedidos total",
  ];

  const rows: CsvRow[] = clientes.map((c) => [
    c.codigo ?? "",
    c.cliente,
    c.dono ?? "",
    c.vendedorAtual ?? "",
    c.vendedorPedido ?? "",
    c.cidade ?? "",
    c.uf ?? "",
    c.classeAbc ?? "",
    ...anos.map((a) => (c.fatPorAno[a] ? csvCurrency(c.fatPorAno[a]) : "")),
    csvCurrency(c.fatTotal),
    ...anos.map((a) => (c.pedPorAno[a] ? csvCurrency(c.pedPorAno[a]) : "")),
    csvCurrency(c.pedTotal),
  ]);

  const body = toCsv(headers, rows);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="base-clientes-pivot.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
