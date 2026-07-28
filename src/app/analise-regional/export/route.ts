import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { csvCurrency, csvDate, toCsv, type CsvRow } from "@/lib/csv";
import { getAnaliseRegional } from "@/lib/services/regiaoVendas";
import { getFaturamentoDateBounds } from "@/lib/services/faturamento";
import { parseDateInput } from "@/lib/sort";

const CHURN_LABEL: Record<string, string> = {
  ATIVO: "Ativo",
  EM_RISCO: "Em risco",
  PERDIDO: "Perdido",
  SEM_HISTORICO: "Sem histórico",
};

/**
 * GET /analise-regional/export
 * CSV com uma linha por cliente: região, geografia (derivada), receita líquida,
 * classe ABC (dentro da região) e status de churn. Respeita os filtros de
 * período/churn da tela (query params from/to/churn).
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

  const data = await getAnaliseRegional({ tenantId, dataInicio, dataFim, ...windows });
  const nomePorRegiao = new Map(data.regioes.map((r) => [r.id, r.nome]));

  const headers = [
    "Cliente",
    "Regiao",
    "Vendedor (faturamento)",
    "Cidade",
    "UF",
    "Fonte geografia",
    "Classe ABC",
    "Receita liquida",
    "Ultima NF",
    "Status churn",
  ];

  const rows: CsvRow[] = [...data.clientes]
    .sort((a, b) => b.receita - a.receita)
    .map((c) => [
      c.cliente,
      c.regiaoId ? nomePorRegiao.get(c.regiaoId) ?? c.regiaoId : "Sem regiao",
      c.vendedorFaturamento ?? "",
      c.municipio ?? "",
      c.uf ?? "",
      c.fonteGeo,
      c.classe,
      csvCurrency(c.receita),
      c.ultimaEmissaoISO ? csvDate(new Date(c.ultimaEmissaoISO)) : "",
      CHURN_LABEL[c.churn] ?? c.churn,
    ]);

  const body = toCsv(headers, rows);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="analise-regional-por-cliente.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
