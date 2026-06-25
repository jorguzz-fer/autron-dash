import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getVendedores, getExtratoVendedor, getCodigosSemCadastro } from "@/lib/services/comissao";
import { getUserAccess } from "@/lib/services/perfis";
import KPICard from "@/components/UI/KPICard";
import CardSection from "@/components/UI/CardSection";
import DataTable, { type Column } from "@/components/UI/DataTable";
import { fmtCurrency, fmtPct, fmtNum } from "@/lib/format";
import { Users, TrendingUp, CheckCircle2 } from "lucide-react";

export const metadata = { title: "Comissões — Visão Geral · Autron Dash" };

interface VendorRow {
  codigo: string;
  nome: string;
  cargo: string;
  metaYTD: number;
  epYTD: number;
  atingimentoPct: number | null;
  elegivelUltimo: boolean | null; // null = sem regra
  previsaoYTD: number;
  temRegra: boolean;
}

export default async function ComissoesPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const access = await getUserAccess(session.user.tenantId, session.user.id);
  if (!access.capabilities.includes("ACCESS_COMISSOES")) redirect("/dashboard");

  const tenantId = session.user.tenantId;
  const ano = new Date().getFullYear();

  // Fetch all vendedores (active + inactive) — service returns ordered ativo desc, nome asc
  const vendedores = await getVendedores(tenantId);
  const ativos = vendedores.filter((v) => v.ativo);

  // Códigos com dados carregados (metas/analítico) mas sem cadastro de vendedor —
  // guia o usuário quando o upload trouxe dados mas a apuração está vazia.
  const semCadastro = await getCodigosSemCadastro(tenantId);

  // Parallel extratos for all active vendors
  const extratos = await Promise.all(
    ativos.map((v) => getExtratoVendedor(tenantId, v.codigoProtheus, ano)),
  );

  // Build rows
  const rows: VendorRow[] = ativos.map((v, i) => {
    const extrato = extratos[i];
    if (!extrato) {
      return {
        codigo: v.codigoProtheus,
        nome: v.nome,
        cargo: v.cargo,
        metaYTD: 0,
        epYTD: 0,
        atingimentoPct: null,
        elegivelUltimo: null,
        previsaoYTD: 0,
        temRegra: false,
      };
    }
    const { apuracao } = extrato;
    const metaYTD = apuracao.reduce((a, m) => a + m.meta, 0);
    const epYTD = apuracao.reduce((a, m) => a + m.ep, 0);
    const previsaoYTD = apuracao.reduce((a, m) => a + (m.previsao ?? 0), 0);
    const atingimentoPct = metaYTD > 0 ? (epYTD / metaYTD) * 100 : null;
    // Last non-zero month habilita — look for latest month with meta or ep > 0
    const mesAtual = new Date().getMonth(); // 0-indexed → index in apuracao
    const elegivelUltimo = apuracao[mesAtual]?.habilita ?? apuracao[mesAtual > 0 ? mesAtual - 1 : 0]?.habilita ?? false;
    return {
      codigo: v.codigoProtheus,
      nome: v.nome,
      cargo: v.cargo,
      metaYTD,
      epYTD,
      atingimentoPct,
      elegivelUltimo,
      previsaoYTD,
      temRegra: true,
    };
  });

  // ── KPIs ──────────────────────────────────────────────────────────────
  const previsaoTotal = rows.reduce((a, r) => a + r.previsaoYTD, 0);
  const qtdElegiveis = rows.filter((r) => r.elegivelUltimo === true).length;
  const qtdAtivos = ativos.length;

  const vendorCols: Column<VendorRow>[] = [
    {
      key: "codigo",
      header: "Código",
      width: "80px",
      cell: (r) => (
        <code className="font-mono text-[12px]" style={{ color: "var(--fg-muted)" }}>
          {r.codigo}
        </code>
      ),
    },
    {
      key: "nome",
      header: "Nome",
      cell: (r) => (
        <Link
          href={`/comissoes/extrato?vend=${encodeURIComponent(r.codigo)}&ano=${ano}`}
          className="text-[13px] font-medium hover:underline"
          style={{ color: "var(--color-brand-500)" }}
        >
          {r.nome}
        </Link>
      ),
    },
    {
      key: "cargo",
      header: "Cargo",
      cell: (r) => (
        <span className="text-[12px]" style={{ color: "var(--fg)" }}>
          {r.cargo}
        </span>
      ),
    },
    {
      key: "metaYTD",
      header: "Meta YTD",
      align: "right",
      cell: (r) => (
        <span className="numeric text-[12px]">
          {r.metaYTD > 0 ? fmtCurrency(r.metaYTD, { decimals: 0 }) : "—"}
        </span>
      ),
    },
    {
      key: "epYTD",
      header: "EP YTD",
      align: "right",
      cell: (r) => (
        <span className="numeric text-[12px]">
          {r.epYTD > 0 ? fmtCurrency(r.epYTD, { decimals: 0 }) : "—"}
        </span>
      ),
    },
    {
      key: "atingimento",
      header: "Atingimento",
      align: "right",
      cell: (r) => {
        if (r.atingimentoPct == null)
          return (
            <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
              —
            </span>
          );
        const color =
          r.atingimentoPct >= 100
            ? "#10b981"
            : r.atingimentoPct >= 70
            ? "#f59e0b"
            : "#e11d48";
        return (
          <span className="numeric text-[12px] font-medium" style={{ color }}>
            {fmtPct(r.atingimentoPct, 1)}
          </span>
        );
      },
    },
    {
      key: "elegivel",
      header: "Elegível?",
      align: "center",
      cell: (r) => {
        if (r.elegivelUltimo === null)
          return (
            <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
              —
            </span>
          );
        return (
          <span
            className="text-[12px] font-semibold"
            style={{ color: r.elegivelUltimo ? "#10b981" : "#e11d48" }}
          >
            {r.elegivelUltimo ? "Sim" : "Não"}
          </span>
        );
      },
    },
    {
      key: "previsaoYTD",
      header: "Previsão YTD",
      align: "right",
      cell: (r) => (
        <span className="numeric text-[12px]" style={{ color: "var(--fg-strong)" }}>
          {r.previsaoYTD > 0 ? fmtCurrency(r.previsaoYTD, { decimals: 0 }) : "—"}
        </span>
      ),
    },
    {
      key: "link",
      header: "",
      width: "60px",
      cell: (r) => (
        <Link
          href={`/comissoes/extrato?vend=${encodeURIComponent(r.codigo)}&ano=${ano}`}
          className="text-[11px] font-medium hover:underline"
          style={{ color: "var(--fg-muted)" }}
        >
          Extrato →
        </Link>
      ),
    },
  ];

  return (
    <AppShell
      title="Comissões"
      subtitle={`Visão Geral · ${ano} · ${qtdAtivos} vendedores ativos`}
    >
      <div className="space-y-8">
        {/* ── Aviso: dados carregados sem cadastro de vendedor ── */}
        {semCadastro.length > 0 && (
          <div
            className="rounded-xl border px-5 py-4"
            style={{
              backgroundColor: "color-mix(in srgb, #f59e0b 10%, var(--surface))",
              borderColor: "color-mix(in srgb, #f59e0b 35%, var(--border-soft))",
            }}
          >
            <p className="text-[13.5px] font-semibold" style={{ color: "var(--fg-strong)" }}>
              {semCadastro.length} vendedor{semCadastro.length !== 1 ? "es" : ""} com dados carregados, mas sem cadastro
            </p>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
              O upload trouxe metas/analítico para os códigos abaixo, mas eles ainda não foram
              cadastrados (cargo, %, gatilho). Enquanto não houver cadastro, não entram na apuração.
            </p>
            <p className="mt-2 font-mono text-[12px]" style={{ color: "var(--fg)" }}>
              {semCadastro.join("  ·  ")}
            </p>
            <Link
              href="/comissoes/vendedores"
              className="mt-3 inline-block text-[12.5px] font-medium hover:underline"
              style={{ color: "var(--color-brand-500)" }}
            >
              Cadastrar vendedores →
            </Link>
          </div>
        )}

        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KPICard
            label="Previsão Total YTD"
            value={fmtCurrency(previsaoTotal, { decimals: 0 })}
            hint="soma de todos os vendedores"
            tone="brand"
            icon={<TrendingUp className="size-4" />}
          />
          <KPICard
            label="Vendedores Elegíveis"
            value={fmtNum(qtdElegiveis)}
            hint="elegível no mês atual"
            tone={qtdElegiveis > 0 ? "success" : "warning"}
            icon={<CheckCircle2 className="size-4" />}
          />
          <KPICard
            label="Vendedores Ativos"
            value={fmtNum(qtdAtivos)}
            hint="com cadastro ativo"
            tone="neutral"
            icon={<Users className="size-4" />}
          />
        </div>

        {/* ── Tabela ── */}
        <CardSection
          title={`Vendedores — ${ano}`}
          subtitle="Clique no nome para abrir o extrato detalhado"
        >
          <DataTable
            columns={vendorCols}
            rows={rows}
            rowKey={(r) => r.codigo}
            emptyMessage="Nenhum vendedor ativo cadastrado."
          />
        </CardSection>
      </div>
    </AppShell>
  );
}
