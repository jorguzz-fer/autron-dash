import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getEnrichedPedidos } from "@/lib/services/dashboard";
import { parseDateInput } from "@/lib/sort";
import {
  applyProntidaoFilters,
  classifAtend,
  filterByStatus,
} from "@/lib/prontidao/filter";
import { csvCurrency, csvDate, toCsv, type CsvRow } from "@/lib/csv";

/**
 * GET /prontidao/export
 *
 * Retorna CSV com os pedidos da aba Prontidão, aplicando os MESMOS filtros
 * que a página (status/dispo/tipo/atend/mesFat/pronto/prazoEntr/q + período).
 * Colunas/ordem espelham a tabela. Use `?` com qualquer combinação.
 *
 * Exemplo: /prontidao/export?status=finalizado&q=cabo&dispo=NAO
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const u = req.nextUrl.searchParams;
  const dataInicio = parseDateInput(u.get("from") ?? undefined);
  const dataFim = parseDateInput(u.get("to") ?? undefined, true);

  const all = await getEnrichedPedidos({
    tenantId: session.user.tenantId,
    dataInicio,
    dataFim,
  });

  // Status (em aberto default; "finalizado" exibe os outros) + filtros da tabela.
  const universo = filterByStatus(all, u.get("status") ?? undefined);
  const filtered = applyProntidaoFilters(universo, {
    dispo: u.get("dispo") ?? undefined,
    tipo: u.get("tipo") ?? undefined,
    atend: u.get("atend") ?? undefined,
    mesFat: u.get("mesFat") ?? undefined,
    pronto: u.get("pronto") ?? undefined,
    prazoEntr: u.get("prazoEntr") ?? undefined,
    q: u.get("q") ?? undefined,
  });

  // Aplicar a MESMA ordenação default da página (erros e bloqueios primeiro).
  // Não aplicamos o sort por URL pois aqui o user só vê CSV — ele pode reordenar
  // no Excel se quiser.
  const ordemPront: Record<string, number> = {
    FINALIZADO: 99,
    Servico: 5,
    SIM: 4,
    "PARCIAL - Sem Follow-up": 3,
    "PARCIAL - Sem Estoque": 2,
    NAO: 1,
  };
  const sorted = [...filtered].sort((a, b) => {
    const eA = a.acaoNecessaria === "ERRO no CADASTRO" ? 0 : 1;
    const eB = b.acaoNecessaria === "ERRO no CADASTRO" ? 0 : 1;
    if (eA !== eB) return eA - eB;
    return (ordemPront[a.prontoParaFazer] ?? 0) - (ordemPront[b.prontoParaFazer] ?? 0);
  });

  // Headers na MESMA ORDEM da tabela visível na página.
  const headers = [
    "PV",
    "Item",
    "Cód. Cliente",
    "Cliente",
    "Produto",
    "Descrição",
    "Tipo",
    "Qtd",
    "Valor Total",
    "Disponível?",
    "SC / OP",
    "Ação",
    "Dt. Necessidade Cliente",
    "Prazo Entrega",
    "Dt. Confirma",
    "DT Chegada Autron",
    "Atendimento Prazo",
    "Semana",
    "Ped. Cliente",
  ];

  const rows: CsvRow[] = sorted.map((p) => {
    const scOp = p.numeroSC ? `SC ${p.numeroSC}` : p.numeroOP ? `OP ${p.numeroOP}` : "";
    const prazoEntrega =
      p.prazoRealEntrega instanceof Date
        ? csvDate(p.prazoRealEntrega)
        : p.prazoRealEntrega ?? "";
    const atendBucket = classifAtend(p);
    const atendLabel =
      atendBucket === "dentro"
        ? "Dentro do prazo"
        : atendBucket === "fora"
          ? "Fora do prazo"
          : "Sem prazo definido";

    return [
      p.numPedido,
      p.item,
      p.cliente ?? "",
      p.clienteNome ?? "",
      p.produto,
      p.descricaoProduto ?? "",
      p.tipoProduto,
      p.quantidade,
      csvCurrency(p.vlrTotal),
      p.disponibilidadeEstoque,
      scOp,
      p.acaoNecessaria,
      csvDate(p.dtFatCli),
      prazoEntrega,
      csvDate(p.fuDtConfirma),
      csvDate(p.fuDtChegadaAutron),
      atendLabel,
      p.semanaEntrega ?? "",
      p.pedCliente ?? "",
    ];
  });

  const body = toCsv(headers, rows);

  // Nome do arquivo: prontidao-YYYYMMDD-HHmm.csv
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const filename = `prontidao-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
