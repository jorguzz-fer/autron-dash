import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import DataTable, { type Column } from "@/components/UI/DataTable";
import StatusBadge from "@/components/UI/StatusBadge";
import { fmtNum } from "@/lib/format";
import { parseSort, sortRows } from "@/lib/sort";
import { canAccessModule } from "@/lib/pageAccess";
import { getUserAllowedModules } from "@/lib/services/users";
import { formatCnpj } from "@/lib/domain/cnpj";
import ImportCard from "./ImportCard";
import BatchProgress from "./BatchProgress";

export const metadata = { title: "Enriquecimento CNPJ — Autron Dash" };

const MAX_ROWS = 500;

interface SP {
  batch?: string;
  sort?: string;
  dir?: string;
  rstatus?: string;
}

export default async function EnriquecimentoPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const allowed = await getUserAllowedModules(session.user.tenantId, session.user.id);
  if (
    !canAccessModule(
      { role: session.user.role, allowedModules: allowed, email: session.user.email },
      "ENRIQUECIMENTO",
    )
  ) {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const tenantId = session.user.tenantId;
  // Módulo restrito a ADMIN + e-mails liberados (ver pageAccess). Quem passou no
  // guard acima tem acesso total ao enriquecimento, incluindo importar/rodar.
  const canWrite = true;
  const sortState = parseSort(sp.sort, sp.dir);

  const batches = await prisma.enrichmentBatch.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: { select: { name: true } } },
  });

  const selectedId = sp.batch ?? batches[0]?.id ?? null;
  const selected = selectedId ? batches.find((b) => b.id === selectedId) ?? null : null;

  // Registros do batch selecionado (limitado — exportar para a base completa).
  const recStatus = sp.rstatus?.toUpperCase();
  const validStatus = ["PENDING", "DONE", "ERROR", "SKIPPED"].includes(recStatus ?? "")
    ? (recStatus as "PENDING" | "DONE" | "ERROR" | "SKIPPED")
    : undefined;

  const registros = selectedId
    ? await prisma.enrichmentRecord.findMany({
        where: { batchId: selectedId, tenantId, ...(validStatus ? { status: validStatus } : {}) },
        orderBy: { rowIndex: "asc" },
        take: MAX_ROWS,
      })
    : [];

  const recRows: RecRow[] = registros.map((r) => ({
    id: r.id,
    rowIndex: r.rowIndex,
    origem: r.origem ?? "",
    codigo: r.inputCodigo ?? "",
    nome: r.razaoSocial ?? r.inputName ?? "",
    cnpj: r.tipoDoc === "CNPJ" ? formatCnpj(r.cnpj) : r.cnpj,
    situacao: r.situacao ?? "",
    local: [r.municipio, r.uf].filter(Boolean).join(" / "),
    grauRisco: r.grauRisco,
    email: r.email ?? "",
    telefone: r.telefone1 ?? "",
    status: r.status,
    source: r.source ?? "",
  }));
  const recTabela = sortRows(
    recRows as unknown as Record<string, unknown>[],
    sortState,
  ) as unknown as RecRow[];

  return (
    <AppShell
      title="Enriquecimento de Base por CNPJ"
      subtitle="Importe cadastros (nome + CNPJ) e enriqueça com dados da Receita Federal."
    >
      <div className="space-y-6">
        {!canWrite && (
          <div
            className="rounded-xl border px-4 py-3 text-[13px]"
            style={{
              color: "#b45309",
              backgroundColor: "color-mix(in srgb, #f59e0b 8%, transparent)",
              borderColor: "color-mix(in srgb, #f59e0b 30%, transparent)",
            }}
          >
            Seu papel ({session.user.role}) é somente leitura. Apenas ADMIN, DIRETOR,
            GERENTE e OPERADOR podem importar e enriquecer.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ImportCard disabled={!canWrite} />
          {selected && (
            <BatchProgress
              batchId={selected.id}
              filename={selected.filename}
              canWrite={canWrite}
              initial={{
                status: selected.status,
                total: selected.total,
                processed: selected.processed,
                succeeded: selected.succeeded,
                failed: selected.failed,
                skipped: selected.skipped,
              }}
            />
          )}
        </div>

        {/* Histórico de lotes */}
        <DataTable
          caption={
            <h2 className="text-[14px] font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
              Lotes importados
            </h2>
          }
          columns={batchCols(selectedId)}
          rows={batches.map((b) => ({
            id: b.id,
            filename: b.filename,
            userName: b.user.name,
            createdAt: b.createdAt,
            status: b.status,
            total: b.total,
            succeeded: b.succeeded,
            failed: b.failed,
            skipped: b.skipped,
          }))}
          rowKey={(b) => b.id}
          emptyMessage="Nenhum lote importado ainda."
          maxHeight={null}
        />

        {/* Registros do lote selecionado */}
        {selected && (
          <DataTable
            caption={
              <div className="flex items-center justify-between gap-3">
                <div className="leading-tight">
                  <h2 className="text-[14px] font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
                    Registros — {selected.filename}
                  </h2>
                  <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
                    Mostrando até {fmtNum(MAX_ROWS)} de {fmtNum(selected.total)}. Use
                    “Exportar Excel” para a base completa.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[12px]">
                  <FilterLink batchId={selected.id} label="Todos" status={undefined} active={!validStatus} />
                  <FilterLink batchId={selected.id} label="OK" status="DONE" active={validStatus === "DONE"} />
                  <FilterLink batchId={selected.id} label="Erros" status="ERROR" active={validStatus === "ERROR"} />
                  <FilterLink batchId={selected.id} label="Ignorados" status="SKIPPED" active={validStatus === "SKIPPED"} />
                </div>
              </div>
            }
            columns={recCols}
            rows={recTabela}
            rowKey={(r) => r.id}
            emptyMessage="Nenhum registro."
          />
        )}
      </div>
    </AppShell>
  );
}

interface RecRow {
  id: string;
  rowIndex: number;
  origem: string;
  codigo: string;
  nome: string;
  cnpj: string;
  situacao: string;
  local: string;
  grauRisco: number | null;
  email: string;
  telefone: string;
  status: "PENDING" | "DONE" | "ERROR" | "SKIPPED";
  source: string;
}

interface BatchRow {
  id: string;
  filename: string;
  userName: string;
  createdAt: Date;
  status: string;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

function batchStatusTone(s: string) {
  if (s === "DONE") return "success" as const;
  if (s === "RUNNING") return "brand" as const;
  if (s === "FAILED") return "danger" as const;
  return "warning" as const;
}

function recStatusTone(s: RecRow["status"]) {
  if (s === "DONE") return "success" as const;
  if (s === "ERROR") return "danger" as const;
  if (s === "SKIPPED") return "muted" as const;
  return "warning" as const;
}

function FilterLink({
  batchId,
  label,
  status,
  active,
}: {
  batchId: string;
  label: string;
  status?: "DONE" | "ERROR" | "SKIPPED";
  active: boolean;
}) {
  const href = status
    ? `/enriquecimento?batch=${batchId}&rstatus=${status}`
    : `/enriquecimento?batch=${batchId}`;
  return (
    <Link
      href={href}
      className="rounded-md px-2 py-0.5"
      style={{
        color: active ? "var(--color-brand-700)" : "var(--fg-muted)",
        backgroundColor: active ? "color-mix(in srgb, var(--color-brand-500) 12%, transparent)" : "var(--surface-2)",
      }}
    >
      {label}
    </Link>
  );
}

function batchCols(selectedId: string | null): Column<BatchRow>[] {
  return [
    {
      key: "arquivo",
      header: "Arquivo",
      sortKey: "filename",
      cell: (b) => (
        <Link
          href={`/enriquecimento?batch=${b.id}`}
          className="block max-w-xs truncate font-medium"
          title={b.filename}
          style={{ color: b.id === selectedId ? "var(--color-brand-700)" : "var(--fg)" }}
        >
          {b.filename}
        </Link>
      ),
    },
    { key: "quem", header: "Quem", sortKey: "userName", cell: (b) => <span style={{ color: "var(--fg)" }}>{b.userName}</span> },
    {
      key: "quando",
      header: "Quando",
      sortKey: "createdAt",
      cell: (b) => (
        <span className="numeric whitespace-nowrap text-[12px]" style={{ color: "var(--fg)" }}>
          {b.createdAt.toLocaleString("pt-BR")}
        </span>
      ),
    },
    { key: "total", header: "Total", sortKey: "total", align: "right", cell: (b) => <span className="numeric">{fmtNum(b.total)}</span> },
    { key: "ok", header: "OK", sortKey: "succeeded", align: "right", cell: (b) => <span className="numeric" style={{ color: "#059669" }}>{fmtNum(b.succeeded)}</span> },
    { key: "erro", header: "Erros", sortKey: "failed", align: "right", cell: (b) => <span className="numeric" style={{ color: "#e11d48" }}>{fmtNum(b.failed)}</span> },
    { key: "ign", header: "Ignorados", sortKey: "skipped", align: "right", cell: (b) => <span className="numeric" style={{ color: "var(--fg-muted)" }}>{fmtNum(b.skipped)}</span> },
    {
      key: "status",
      header: "Status",
      sortKey: "status",
      cell: (b) => <StatusBadge tone={batchStatusTone(b.status)}>{b.status}</StatusBadge>,
    },
  ];
}

const recCols: Column<RecRow>[] = [
  { key: "rowIndex", header: "#", sortKey: "rowIndex", align: "right", cell: (r) => <span className="numeric" style={{ color: "var(--fg-muted)" }}>{r.rowIndex + 1}</span> },
  { key: "origem", header: "Origem", sortKey: "origem", cell: (r) => <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>{r.origem}</span> },
  { key: "codigo", header: "Código", sortKey: "codigo", cell: (r) => <span className="font-mono text-[11px]" style={{ color: "var(--fg-muted)" }}>{r.codigo}</span> },
  {
    key: "nome",
    header: "Razão Social / Nome",
    sortKey: "nome",
    cell: (r) => (
      <span className="block max-w-xs truncate" title={r.nome} style={{ color: "var(--fg-strong)" }}>{r.nome}</span>
    ),
  },
  { key: "cnpj", header: "CNPJ/CPF", sortKey: "cnpj", cell: (r) => <span className="numeric whitespace-nowrap" style={{ color: "var(--fg)" }}>{r.cnpj}</span> },
  { key: "situacao", header: "Situação", sortKey: "situacao", cell: (r) => <span className="text-[12px]" style={{ color: "var(--fg)" }}>{r.situacao}</span> },
  { key: "local", header: "Município/UF", sortKey: "local", cell: (r) => <span className="text-[12px]" style={{ color: "var(--fg)" }}>{r.local}</span> },
  { key: "grau", header: "Grau Risco", sortKey: "grauRisco", align: "right", cell: (r) => <span className="numeric" style={{ color: "var(--fg)" }}>{r.grauRisco ?? ""}</span> },
  { key: "email", header: "E-mail", sortKey: "email", cell: (r) => <span className="block max-w-[12rem] truncate text-[12px]" title={r.email} style={{ color: "var(--fg)" }}>{r.email}</span> },
  { key: "tel", header: "Telefone", sortKey: "telefone", cell: (r) => <span className="numeric text-[12px]" style={{ color: "var(--fg)" }}>{r.telefone}</span> },
  {
    key: "status",
    header: "Status",
    sortKey: "status",
    cell: (r) => <StatusBadge tone={recStatusTone(r.status)}>{r.status}{r.source ? ` · ${r.source}` : ""}</StatusBadge>,
  },
];
