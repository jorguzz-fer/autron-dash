import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getVendedores, getExtratoVendedor } from "@/lib/services/comissao";
import { fmtCurrency } from "@/lib/format";
import { type Role } from "@/lib/authz";
import CardSection from "@/components/UI/CardSection";
import FilterSelect from "@/components/UI/FilterSelect";
import PrintButton from "@/components/UI/PrintButton";
import { FileDown } from "lucide-react";

export const metadata = { title: "Extrato por Vendedor — Comissões" };

const ALLOWED_ROLES: Role[] = ["ADMIN", "DIRETOR", "CONTROLADORIA"];

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

interface SP {
  vend?: string;
  ano?: string;
}

export default async function ExtratoPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role as Role;
  if (!ALLOWED_ROLES.includes(role)) redirect("/");
  const tenantId = session.user.tenantId;

  const sp = await searchParams;
  const vendSelecionado = sp.vend ?? "";
  const anoAtual = new Date().getFullYear();
  const ano = sp.ano ? parseInt(sp.ano, 10) : anoAtual;

  const vendedores = await getVendedores(tenantId);

  const extrato =
    vendSelecionado
      ? await getExtratoVendedor(tenantId, vendSelecionado, ano)
      : null;

  // Build year options: current year ± 2
  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - 2 + i);

  // Vendor info for title
  const vendInfo = vendedores.find((v) => v.codigoProtheus === vendSelecionado);

  return (
    <AppShell
      title="Extrato por Vendedor"
      subtitle="Apuração mensal · Pedidos pagos por janela"
    >
      <div className="space-y-8">

        {/* ── Seletores ── */}
        <CardSection>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-64">
              <FilterSelect
                name="vend"
                label="Vendedor"
                options={vendedores.map((v) => ({
                  value: v.codigoProtheus,
                  label: `${v.codigoProtheus} — ${v.nome}`,
                }))}
                value={vendSelecionado}
                allLabel="Selecione um vendedor…"
              />
            </div>
            <div className="w-36">
              <FilterSelect
                name="ano"
                label="Ano"
                options={anos.map((y) => ({ value: String(y), label: String(y) }))}
                value={String(ano)}
                allLabel=""
              />
            </div>

            {vendSelecionado && extrato && (
              <div className="ml-auto flex items-end gap-2">
                <a
                  href={`/comissoes/extrato/export?vend=${encodeURIComponent(vendSelecionado)}&ano=${ano}`}
                  className="ring-focus inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors hover:brightness-110"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--color-brand-500) 10%, transparent)",
                    borderColor:
                      "color-mix(in srgb, var(--color-brand-500) 30%, transparent)",
                    color: "var(--color-brand-600)",
                  }}
                >
                  <FileDown className="size-3.5" />
                  Exportar CSV
                </a>
                <PrintButton label="Imprimir" />
              </div>
            )}
          </div>
        </CardSection>

        {!vendSelecionado && (
          <div
            className="rounded-xl border px-6 py-10 text-center text-[14px]"
            style={{
              borderColor: "var(--border-soft)",
              color: "var(--fg-muted)",
              backgroundColor: "var(--surface)",
            }}
          >
            Selecione um vendedor para ver o extrato.
          </div>
        )}

        {vendSelecionado && !extrato && (
          <div
            className="rounded-xl border px-6 py-10 text-center text-[14px]"
            style={{
              borderColor: "var(--border-soft)",
              color: "var(--fg-muted)",
              backgroundColor: "var(--surface)",
            }}
          >
            Nenhum dado de comissão encontrado para esse vendedor/ano.
          </div>
        )}

        {extrato && vendInfo && (
          <div id="print-area" className="space-y-8">
            {/* Cabeçalho do extrato */}
            <div
              className="rounded-xl border px-5 py-3"
              style={{
                borderColor: "var(--border-soft)",
                backgroundColor: "var(--surface)",
              }}
            >
              <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
                <span className="font-semibold" style={{ color: "var(--fg-strong)" }}>
                  {vendInfo.codigoProtheus} — {vendInfo.nome}
                </span>
                {" · "}Cargo: <strong>{vendInfo.cargo}</strong>
                {" · "}Comissão:{" "}
                <strong>
                  {(extrato.regra.comissaoPct * 100).toFixed(2).replace(".", ",")}%
                </strong>
                {" · "}Gatilho:{" "}
                <strong>
                  {extrato.regra.gatilhoPct > 0
                    ? `${(extrato.regra.gatilhoPct * 100).toFixed(0)}%`
                    : "sem gatilho"}
                </strong>
                {" · Ano: "}
                <strong>{ano}</strong>
                {extrato.membros.length > 1 && (
                  <>
                    {" · "}Carteira:{" "}
                    <strong>{extrato.membros.length} membros</strong>{" "}
                    <span style={{ color: "var(--fg-subtle)" }}>
                      ({extrato.membros.join(", ")})
                    </span>
                  </>
                )}
                {extrato.garantido && (
                  <>
                    {" · "}Garantido:{" "}
                    <strong>
                      {fmtCurrency(extrato.garantido.valor, { decimals: 0 })}/mês ·{" "}
                      {extrato.garantido.meses}m a partir de{" "}
                      {String(extrato.garantido.inicioMes).padStart(2, "0")}/
                      {extrato.garantido.inicioAno}
                    </strong>
                  </>
                )}
              </p>
              {extrato.membros.length > 1 && (
                <p className="mt-1 text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
                  Apuração agregada da carteira (vendas e metas somadas; gatilho 70% sobre o total).
                </p>
              )}
            </div>

            {/* ── Grid 1: Apuração ── */}
            <SectionBlock title="Apuração Mensal">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr
                      className="text-[10.5px] uppercase tracking-wider"
                      style={{
                        color: "var(--fg-muted)",
                        backgroundColor: "var(--surface-2)",
                        borderBottom: "1px solid var(--border-soft)",
                      }}
                    >
                      <th
                        className="px-3 py-2.5 text-left font-semibold"
                        style={{ minWidth: 130 }}
                      >
                        —
                      </th>
                      {MESES.map((m) => (
                        <th
                          key={m}
                          className="px-2 py-2.5 text-right font-semibold"
                          style={{ minWidth: 80, color: "var(--fg-muted)" }}
                        >
                          {m}
                        </th>
                      ))}
                      <th
                        className="px-2 py-2.5 text-right font-semibold"
                        style={{ minWidth: 88, color: "var(--fg-strong)" }}
                      >
                        TOTAL
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Meta */}
                    <ApuracaoRow
                      label="Meta"
                      values={extrato.apuracao.map((m) => m.meta)}
                      totalFn="sum"
                    />
                    {/* Gatilho */}
                    <ApuracaoRow
                      label="Gatilho"
                      values={extrato.apuracao.map((m) => m.gatilho)}
                      totalFn="sum"
                    />
                    {/* EP (Entradas Pagas) */}
                    <ApuracaoRow
                      label="EP"
                      values={extrato.apuracao.map((m) => m.ep)}
                      totalFn="sum"
                    />
                    {/* Saldo */}
                    <ApuracaoRow
                      label="Saldo"
                      values={extrato.apuracao.map((m) => m.saldo)}
                      totalFn="sum"
                    />
                    {/* Saldo Acum. — total = último valor */}
                    <ApuracaoRow
                      label="Saldo Acum."
                      values={extrato.apuracao.map((m) => m.saldoAcumulado)}
                      totalFn="last"
                    />
                    {/* Habilita — SIM / NÃO, sem total */}
                    <tr style={{ borderTop: "1px solid var(--border-soft)" }}>
                      <td
                        className="px-3 py-2 font-medium"
                        style={{ color: "var(--fg)" }}
                      >
                        Habilita
                      </td>
                      {extrato.apuracao.map((m, i) => (
                        <td
                          key={i}
                          className="px-2 py-2 text-right"
                          style={{
                            color: m.habilita ? "#10b981" : "#e11d48",
                            fontWeight: 600,
                          }}
                        >
                          {m.habilita ? "SIM" : "NÃO"}
                        </td>
                      ))}
                      <td
                        className="px-2 py-2 text-right text-[10.5px]"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        —
                      </td>
                    </tr>
                    {/* Previsão */}
                    <ApuracaoRow
                      label="Previsão"
                      values={extrato.apuracao.map((m) => m.previsao)}
                      totalFn="sum"
                      bold
                    />
                    {/* A Receber (com piso do garantido) — só quando há garantido */}
                    {extrato.garantido && (
                      <ApuracaoRow
                        label="A Receber"
                        values={extrato.aReceber}
                        totalFn="sum"
                        bold
                      />
                    )}
                  </tbody>
                </table>
              </div>
            </SectionBlock>

            {/* ── Grid: Programado para Pagar (faturado, aguardando cliente) ── */}
            {extrato.programados.size > 0 && (
              <SectionBlock title="Programado para Pagar (faturado · aguardando cliente)">
                <JanelaGrid grid={extrato.programados} />
                <p className="px-2 text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>
                  Pedidos já faturados, com pagamento previsto pela data de vencimento.
                  Ainda não caíram — dependem do cliente pagar.
                </p>
              </SectionBlock>
            )}

            {/* ── Grid 2: Pedidos Pagos por Janela ── */}
            {extrato.pedidosPagos.size > 0 && (
              <SectionBlock title="Pedidos Pagos por Janela">
                <JanelaGrid grid={extrato.pedidosPagos} />
              </SectionBlock>
            )}

            {extrato.pedidosPagos.size === 0 && (
              <SectionBlock title="Pedidos Pagos por Janela">
                <p
                  className="px-2 py-4 text-center text-[13px]"
                  style={{ color: "var(--fg-muted)" }}
                >
                  Nenhum pedido pago registrado para esse ano.
                </p>
              </SectionBlock>
            )}
          </div>
        )}

      </div>
    </AppShell>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function JanelaGrid({ grid }: { grid: Map<string, number[]> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr
            className="text-[10.5px] uppercase tracking-wider"
            style={{
              color: "var(--fg-muted)",
              backgroundColor: "var(--surface-2)",
              borderBottom: "1px solid var(--border-soft)",
            }}
          >
            <th className="px-3 py-2.5 text-left font-semibold" style={{ minWidth: 130 }}>
              Janela
            </th>
            {MESES.map((m) => (
              <th
                key={m}
                className="px-2 py-2.5 text-right font-semibold"
                style={{ minWidth: 80, color: "var(--fg-muted)" }}
              >
                {m}
              </th>
            ))}
            <th
              className="px-2 py-2.5 text-right font-semibold"
              style={{ minWidth: 88, color: "var(--fg-strong)" }}
            >
              TOTAL
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from(grid.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([janela, valores]) => {
              const total = valores.reduce((s, v) => s + v, 0);
              return (
                <tr key={janela} style={{ borderTop: "1px solid var(--border-soft)" }}>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--fg-strong)" }}>
                    {janela}
                  </td>
                  {valores.map((v, i) => (
                    <td
                      key={i}
                      className="numeric px-2 py-2 text-right"
                      style={{ color: v ? "var(--fg)" : "var(--fg-muted)" }}
                    >
                      {v ? fmtCurrency(v, { decimals: 0 }) : "—"}
                    </td>
                  ))}
                  <td
                    className="numeric px-2 py-2 text-right font-semibold"
                    style={{ color: "var(--fg-strong)" }}
                  >
                    {fmtCurrency(total, { decimals: 0 })}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

function ApuracaoRow({
  label,
  values,
  totalFn,
  bold = false,
}: {
  label: string;
  values: number[];
  totalFn: "sum" | "last";
  bold?: boolean;
}) {
  const total =
    totalFn === "sum"
      ? values.reduce((s, v) => s + v, 0)
      : (values[values.length - 1] ?? 0);

  return (
    <tr
      style={{
        borderTop: "1px solid var(--border-soft)",
        backgroundColor: bold
          ? "color-mix(in srgb, var(--color-brand-500) 5%, var(--surface))"
          : undefined,
      }}
    >
      <td
        className={`px-3 py-2 ${bold ? "font-semibold" : "font-medium"}`}
        style={{ color: bold ? "var(--fg-strong)" : "var(--fg)" }}
      >
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className="numeric px-2 py-2 text-right"
          style={{
            color: bold ? "var(--fg-strong)" : "var(--fg)",
            fontWeight: bold && v ? 600 : undefined,
          }}
        >
          {v ? fmtCurrency(v, { decimals: 0 }) : "—"}
        </td>
      ))}
      <td
        className="numeric px-2 py-2 text-right font-semibold"
        style={{ color: "var(--fg-strong)" }}
      >
        {total ? fmtCurrency(total, { decimals: 0 }) : "—"}
      </td>
    </tr>
  );
}

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="space-y-4 rounded-2xl px-6 py-5"
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--color-brand-500) 4%, var(--canvas))",
        border:
          "1px solid color-mix(in srgb, var(--color-brand-500) 14%, var(--border-soft))",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="block h-6 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: "var(--color-brand-500)" }}
        />
        <h2
          className="text-[20px] font-bold tracking-tight"
          style={{ color: "var(--fg-strong)" }}
        >
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}
