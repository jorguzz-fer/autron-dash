import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getExtratoVendedor } from "@/lib/services/comissao";
import { csvCurrency, toCsv, type CsvRow } from "@/lib/csv";
import { getUserAccess } from "@/lib/services/perfis";

const MESES_LABEL = [
  "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
  "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
];

/**
 * GET /comissoes/extrato/export?vend=000022&ano=2026
 *
 * Retorna CSV com o extrato completo de um vendedor/ano:
 * - Seção 1: Apuração mensal (Meta, Gatilho, EP, Saldo, Saldo Acum., Habilita, Previsão[, A Receber])
 * - Seção 2: Programado para pagar (faturado, aguardando cliente) por janela
 * - Seção 3: Pedidos pagos por janela (linhas × meses)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await getUserAccess(session.user.tenantId, session.user.id);
  if (!access.capabilities.includes("ACCESS_COMISSOES")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const u = req.nextUrl.searchParams;
  const vend = u.get("vend") ?? "";
  const anoRaw = u.get("ano");
  const ano = anoRaw ? parseInt(anoRaw, 10) : new Date().getFullYear();

  if (!vend) {
    return NextResponse.json({ error: "Parâmetro vend é obrigatório" }, { status: 400 });
  }

  const extrato = await getExtratoVendedor(session.user.tenantId, vend, ano);
  if (!extrato) {
    return NextResponse.json(
      { error: "Vendedor não encontrado ou sem dados para o ano informado" },
      { status: 404 },
    );
  }

  const temGarantido = extrato.garantido != null;

  // ── Seção 1: Apuração ──
  const apuracaoHeaders = [
    "Mês", "Meta", "Gatilho", "EP", "Saldo", "Saldo Acum.", "Habilita", "Previsão",
    ...(temGarantido ? ["A Receber"] : []),
  ];

  const apuracaoRows: CsvRow[] = extrato.apuracao.map((m, i) => [
    MESES_LABEL[m.mes - 1],
    csvCurrency(m.meta),
    csvCurrency(m.gatilho),
    csvCurrency(m.ep),
    csvCurrency(m.saldo),
    csvCurrency(m.saldoAcumulado),
    m.habilita ? "SIM" : "NÃO",
    csvCurrency(m.previsao),
    ...(temGarantido ? [csvCurrency(extrato.aReceber[i])] : []),
  ]);

  // ── Grids por janela (Programado e Pago) ──
  const janelaHeaders = ["Janela", ...MESES_LABEL, "Total"];
  const janelaRows = (grid: Map<string, number[]>): CsvRow[] =>
    Array.from(grid.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([janela, valores]) => {
        const total = valores.reduce((s, v) => s + v, 0);
        return [janela, ...valores.map((v) => csvCurrency(v)), csvCurrency(total)];
      });

  // ── Montar CSV com seções separadas por linhas em branco ──
  const csvParts: string[] = [];

  // Cabeçalho de carteira (quando gestor)
  if (extrato.membros.length > 1) {
    csvParts.push(`Carteira;${extrato.membros.join(" / ")}`);
    csvParts.push("");
  }

  // Seção 1: Apuração
  csvParts.push(apuracaoHeaders.join(";"));
  for (const row of apuracaoRows) {
    csvParts.push(row.map(fieldEscape).join(";"));
  }

  // Seção 2: Programado para pagar (faturado, aguardando cliente)
  if (extrato.programados.size > 0) {
    csvParts.push("");
    csvParts.push("Programado para Pagar (faturado, aguardando cliente)");
    csvParts.push(janelaHeaders.join(";"));
    for (const row of janelaRows(extrato.programados)) {
      csvParts.push(row.map(fieldEscape).join(";"));
    }
  }

  // Seção 3: Pedidos pagos
  csvParts.push("");
  csvParts.push("Pedidos Pagos por Janela");
  csvParts.push(janelaHeaders.join(";"));
  for (const row of janelaRows(extrato.pedidosPagos)) {
    csvParts.push(row.map(fieldEscape).join(";"));
  }

  const body = "﻿" + csvParts.join("\r\n") + "\r\n";
  const filename = `comissao-extrato-${vend}-${ano}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function fieldEscape(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = typeof v === "number" ? String(v) : v;
  if (/[";\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
