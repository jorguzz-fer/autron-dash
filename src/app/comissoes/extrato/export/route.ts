import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getExtratoVendedor } from "@/lib/services/comissao";
import { csvCurrency, toCsv, type CsvRow } from "@/lib/csv";
import { type Role } from "@/lib/authz";

const ALLOWED_ROLES: Role[] = ["ADMIN", "DIRETOR", "CONTROLADORIA"];

const MESES_LABEL = [
  "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
  "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
];

/**
 * GET /comissoes/extrato/export?vend=000022&ano=2026
 *
 * Retorna CSV com o extrato completo de um vendedor/ano:
 * - Seção 1: Apuração mensal (Meta, Gatilho, EP, Saldo, Saldo Acum., Habilita, Previsão)
 * - Seção 2: Pedidos pagos por janela (linhas × meses)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role as Role;
  if (!ALLOWED_ROLES.includes(role)) {
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

  // ── Seção 1: Apuração ──
  const apuracaoHeaders = [
    "Mês", "Meta", "Gatilho", "EP", "Saldo", "Saldo Acum.", "Habilita", "Previsão",
  ];

  const apuracaoRows: CsvRow[] = extrato.apuracao.map((m) => [
    MESES_LABEL[m.mes - 1],
    csvCurrency(m.meta),
    csvCurrency(m.gatilho),
    csvCurrency(m.ep),
    csvCurrency(m.saldo),
    csvCurrency(m.saldoAcumulado),
    m.habilita ? "SIM" : "NÃO",
    csvCurrency(m.previsao),
  ]);

  // ── Seção 2: Pedidos Pagos por Janela ──
  const pagosHeaders = ["Janela", ...MESES_LABEL, "Total"];

  const pagosRows: CsvRow[] = Array.from(extrato.pedidosPagos.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([janela, valores]) => {
      const total = valores.reduce((s, v) => s + v, 0);
      return [janela, ...valores.map((v) => csvCurrency(v)), csvCurrency(total)];
    });

  // ── Montar CSV com duas seções separadas por linhas em branco ──
  // Seção 1
  const csvParts: string[] = [];
  csvParts.push(apuracaoHeaders.join(";"));
  for (const row of apuracaoRows) {
    csvParts.push(row.map(fieldEscape).join(";"));
  }

  // Separador
  csvParts.push("");
  csvParts.push("Pedidos Pagos por Janela");

  // Seção 2
  csvParts.push(pagosHeaders.join(";"));
  for (const row of pagosRows) {
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
