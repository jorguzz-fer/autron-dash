import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { csvCurrency, csvDate, toCsv, type CsvRow } from "@/lib/csv";
import { getAnaliseCarteira } from "@/lib/services/carteira";
import { getFaturamentoDateBounds } from "@/lib/services/faturamento";
import { parseDateInput } from "@/lib/sort";

const CHURN_LABEL: Record<string, string> = {
  ATIVO: "Ativo",
  EM_RISCO: "Em risco",
  PERDIDO: "Perdido",
  SEM_HISTORICO: "Sem histórico",
};

/**
 * GET /analise-regional/carteiras/export
 * CSV com uma linha por cliente: dono ATUAL da carteira, vendedor da época,
 * faturamento e entrada de pedidos no período, classe ABC dentro da carteira e
 * status de churn. Respeita os filtros da tela (from/to/churn/cart).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = session.user.tenantId;

  const url = new URL(req.url);
  const churnPreset = url.searchParams.get("churn");
  const windows =
    churnPreset === "6"
      ? { emRiscoMeses: 3, perdidoMeses: 6 }
      : churnPreset === "24"
        ? { emRiscoMeses: 12, perdidoMeses: 24 }
        : { emRiscoMeses: 6, perdidoMeses: 12 };

  const bounds = await getFaturamentoDateBounds(tenantId);
  const dataInicio = parseDateInput(url.searchParams.get("from") ?? undefined) ?? bounds.min ?? undefined;
  const dataFim = parseDateInput(url.searchParams.get("to") ?? undefined) ?? bounds.max ?? undefined;
  const carteira = url.searchParams.get("cart")?.trim() || null;

  const data = await getAnaliseCarteira({ tenantId, dataInicio, dataFim, ...windows });

  const headers = [
    "Cliente",
    "Carteira (dono atual)",
    "Vendedor da epoca",
    "Herdado",
    "Na base de carteira",
    "Classe ABC",
    "Faturamento liquido",
    "Entrada de pedidos",
    "Pedidos em aberto",
    "Cidade",
    "UF",
    "Ultima NF",
    "Status churn",
  ];

  const rows: CsvRow[] = data.clientes
    .filter((c) => !carteira || c.dono === carteira)
    .sort((a, b) => b.receita - a.receita)
    .map((c) => [
      c.cliente,
      c.dono,
      c.vendedorEpoca ?? "",
      c.trocouDeDono ? "Sim" : "Nao",
      c.naBase ? "Sim" : "Nao",
      c.classe,
      csvCurrency(c.receita),
      csvCurrency(c.pedidos),
      csvCurrency(c.pedidosEmAberto),
      c.municipio ?? "",
      c.uf ?? "",
      c.ultimaEmissaoISO ? csvDate(new Date(c.ultimaEmissaoISO)) : "",
      CHURN_LABEL[c.churn] ?? c.churn,
    ]);

  const body = toCsv(headers, rows);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analise-carteira-por-cliente.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
