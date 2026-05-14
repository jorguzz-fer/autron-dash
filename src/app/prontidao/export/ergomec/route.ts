import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import { getPrazosEngByTenant } from "@/lib/services/prazoEngenhariaIND21";
import { parseDateInput } from "@/lib/sort";
import { classifAtend, filterByStatus } from "@/lib/prontidao/filter";
import { csvCurrency, csvDate, toCsv, type CsvRow } from "@/lib/csv";

/**
 * GET /prontidao/export/ergomec
 *
 * CSV dos pedidos Ergomec (IND21) aplicando os mesmos filtros da tabela:
 * eAtend, eMesFat, eSearch + status/período.
 * Inclui a coluna "Prazo Engenharia" do mapa de prazos.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const u = req.nextUrl.searchParams;
  const dataInicio = parseDateInput(u.get("from") ?? undefined);
  const dataFim = parseDateInput(u.get("to") ?? undefined, true);

  const [all, prazosMap] = await Promise.all([
    getEnrichedPedidos({ tenantId: session.user.tenantId, dataInicio, dataFim }),
    getPrazosEngByTenant(session.user.tenantId),
  ]);

  // Filtros em cascata — igual ao page.tsx
  const universo = filterByStatus(all, u.get("status") ?? undefined);
  const ergomecBase = universo.filter((p) => p.unidadeNegocio === "IND21");

  const eAtend = u.get("eAtend") ?? undefined;
  const eMesFat = u.get("eMesFat") ?? undefined;
  const eSearch = u.get("eSearch")?.toLowerCase() ?? undefined;

  const filtered = ergomecBase.filter((p) => {
    if (eAtend && classifAtend(p) !== eAtend) return false;
    if (eMesFat) {
      const m = p.dtEntrega
        ? p.dtEntrega.getMonth() + 1
        : p.dtFatCli
          ? p.dtFatCli.getMonth() + 1
          : null;
      if (m == null || m !== Number(eMesFat)) return false;
    }
    if (eSearch) {
      const hay = [p.numPedido, p.produto, p.descricaoProduto, p.clienteNome, p.cliente]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(eSearch)) return false;
    }
    return true;
  });

  // Ordenação padrão: prazo engenharia ASC, depois dtFatCli ASC
  const sorted = [...filtered].sort((a, b) => {
    const pa = prazosMap.get(a.numPedido)?.prazoAtual?.getTime() ?? Number.POSITIVE_INFINITY;
    const pb = prazosMap.get(b.numPedido)?.prazoAtual?.getTime() ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    const fa = a.dtFatCli?.getTime() ?? Number.POSITIVE_INFINITY;
    const fb = b.dtFatCli?.getTime() ?? Number.POSITIVE_INFINITY;
    return fa - fb;
  });

  const headers = [
    "PV",
    "Item",
    "Produto",
    "Descrição",
    "Cód. Cliente",
    "Cliente",
    "Qtd",
    "Valor Total",
    "Dt. Ofertada",
    "Dt. Fat. Cli.",
    "Atendimento Prazo",
    "Pronto?",
    "Prazo Engenharia",
    "Últ. Atualização Prazo",
  ];

  const rows: CsvRow[] = sorted.map((p) => {
    const atendBucket = classifAtend(p);
    const atendLabel =
      atendBucket === "dentro"
        ? "Dentro do prazo"
        : atendBucket === "fora"
          ? "Fora do prazo"
          : "Sem prazo definido";

    const prazoEng = prazosMap.get(p.numPedido);

    return [
      p.numPedido,
      p.item,
      p.produto,
      p.descricaoProduto ?? "",
      p.cliente ?? "",
      p.clienteNome ?? "",
      p.quantidade,
      csvCurrency(p.vlrTotal),
      csvDate(p.dtOfertada),
      csvDate(p.dtFatCli),
      atendLabel,
      p.prontoParaFazer,
      csvDate(prazoEng?.prazoAtual),
      csvDate(prazoEng?.ultimaAtualizacao),
    ];
  });

  const body = toCsv(headers, rows);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const filename = `ergomec-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
