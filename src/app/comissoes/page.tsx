import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getVendedores, getExtratoVendedor } from "@/lib/services/comissao";
import KPICard from "@/components/UI/KPICard";
import CardSection from "@/components/UI/CardSection";
import DataTable, { type Column } from "@/components/UI/DataTable";
import { fmtCurrency, fmtPct, fmtNum } from "@/lib/format";
import { Users, TrendingUp, CheckCircle2 } from "lucide-react";

export const metadata = { title: "Comissões — Visão Geral · Autron Dash" };

const ALLOWED_ROLES = ["ADMIN", "DIRETOR", "CONTROLADORIA"];

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
  if (!ALLOWED_ROLES.includes(session.user.role ?? "")) redirect("/dashboard");

  const tenantId = session.user.tenantId;
  const ano = new Date().getFullYear();

  // Fetch all vendedores (active + inactive) — service returns ordered ativo desc, nome asc
  const vendedores = await getVendedores(tenantId);
  const ativos = vendedores.filter((v) => v.ativo);

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
