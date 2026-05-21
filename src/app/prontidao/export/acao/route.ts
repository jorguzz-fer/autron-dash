import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import { parseDateInput } from "@/lib/sort";
import { filterByStatus } from "@/lib/prontidao/filter";
import { csvDate, toCsv, type CsvRow } from "@/lib/csv";

/**
 * GET /prontidao/export/acao
 *
 * CSV ENXUTO da tabela dedicada de Ação Necessária (aba Prontidão).
 * Independente dos filtros da tabela principal — usa só status/período
 * + a categoria de ação selecionada (?acao=...).
 *
 * Exemplo: /prontidao/export/acao?acao=SC%20gerada%20-%20Aguardando&status=&from=&to=
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const u = req.nextUrl.searchParams;
  const acao = u.get("acao") ?? undefined;
  if (!acao) {
    return NextResponse.json({ error: "Parâmetro 'acao' obrigatório" }, { status: 400 });
  }

  const dataInicio = parseDateInput(u.get("from") ?? undefined);
  const dataFim = parseDateInput(u.get("to") ?? undefined, true);

  const all = await getEnrichedPedidos({
    tenantId: session.user.tenantId,
    dataInicio,
    dataFim,
  });

  const universo = filterByStatus(all, u.get("status") ?? undefined);
  const filtered = universo.filter((p) => p.acaoNecessaria === acao);

  // Colunas espelham a tabela dedicada (enxuta).
  const headers = [
    "PV",
    "Item",
    "Produto",
    "Descrição",
    "Cliente",
    "Qtd",
    "Ação",
    "SC / OP",
    "Prazo Entrega",
    "Dt. Confirma",
    "Dt. Necessidade Cliente",
  ];

  const rows: CsvRow[] = filtered.map((p) => {
    const scOp = p.numeroSC ? `SC ${p.numeroSC}` : p.numeroOP ? `OP ${p.numeroOP}` : "";
    const prazoEntrega =
      p.prazoRealEntrega instanceof Date
        ? csvDate(p.prazoRealEntrega)
        : p.prazoRealEntrega ?? "";
    return [
      p.numPedido,
      p.item,
      p.produto,
      p.descricaoProduto ?? "",
      p.clienteNome ?? p.cliente ?? "",
      p.quantidade,
      p.acaoNecessaria,
      scOp,
      prazoEntrega,
      csvDate(p.fuDtConfirma),
      csvDate(p.dtFatCli),
    ];
  });

  const body = toCsv(headers, rows);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const slug = acao
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const filename = `prontidao-acao-${slug}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
