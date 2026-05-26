import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Dataset } from "@prisma/client";
import { DATASET_LABELS } from "@/lib/parsers";
import UploadCard from "@/app/uploads/UploadCard";
import DataTable, { type Column } from "@/components/UI/DataTable";
import StatusBadge from "@/components/UI/StatusBadge";
import { fmtNum } from "@/lib/format";
import { parseSort, sortRows } from "@/lib/sort";

export const metadata = { title: "Upload — Comissões | Autron Dash" };

const COMISSAO_DATASETS: Dataset[] = ["COMISSAO_ANALITICO", "COMISSAO_META"];

const ROLES_WRITE = new Set(["ADMIN", "DIRETOR", "CONTROLADORIA"]);

interface SP {
  sort?: string;
  dir?: string;
}

interface UploadRow {
  id: string;
  startedAt: Date;
  userName: string;
  dataset: string;
  filename: string;
  rowCount: number;
  status: "PROCESSING" | "SUCCESS" | "FAILED";
  errorMessage: string | null;
}

export default async function ComissoesUploadPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const sortState = parseSort(sp.sort, sp.dir);

  const canUpload = ROLES_WRITE.has(session.user.role);

  const uploads = await prisma.dataUpload.findMany({
    where: {
      tenantId: session.user.tenantId,
      dataset: { in: COMISSAO_DATASETS },
    },
    orderBy: { startedAt: "desc" },
    take: 30,
    include: { user: { select: { name: true, email: true } } },
  });

  const lastByDataset = new Map<Dataset, (typeof uploads)[number]>();
  for (const u of uploads) {
    if (u.status === "SUCCESS" && !lastByDataset.has(u.dataset)) {
      lastByDataset.set(u.dataset, u);
    }
  }

  const tableRows: UploadRow[] = uploads.map((u) => ({
    id: u.id,
    startedAt: u.startedAt,
    userName: u.user.name,
    dataset: u.dataset,
    filename: u.filename,
    rowCount: u.rowCount,
    status: u.status,
    errorMessage: u.errorMessage,
  }));

  const tabela = sortRows(
    tableRows as unknown as Record<string, unknown>[],
    sortState,
  ) as unknown as UploadRow[];

  return (
    <AppShell
      title="Upload — Comissões"
      subtitle="Envie as planilhas de analítico e metas para apuração de comissões."
    >
      <div className="space-y-6">
        {!canUpload && (
          <div
            className="rounded-xl border px-4 py-3 text-[13px]"
            style={{
              color: "#b45309",
              backgroundColor: "color-mix(in srgb, #f59e0b 8%, transparent)",
              borderColor: "color-mix(in srgb, #f59e0b 30%, transparent)",
            }}
          >
            Seu papel ({session.user.role}) não tem permissão para upload. Apenas ADMIN,
            DIRETOR e CONTROLADORIA podem enviar planilhas.
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {COMISSAO_DATASETS.map((ds) => {
            const last = lastByDataset.get(ds);
            return (
              <UploadCard
                key={ds}
                dataset={ds}
                label={DATASET_LABELS[ds]}
                disabled={!canUpload}
                lastUpload={
                  last
                    ? {
                        filename: last.filename,
                        rowCount: last.rowCount,
                        finishedAt: last.finishedAt?.toISOString() ?? null,
                        userName: last.user.name,
                      }
                    : null
                }
              />
            );
          })}
        </section>

        <DataTable
          caption={
            <div className="flex items-center justify-between">
              <div className="leading-tight">
                <h2
                  className="text-[14px] font-semibold tracking-tight"
                  style={{ color: "var(--fg-strong)" }}
                >
                  Histórico recente — Comissões
                </h2>
                <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
                  Últimas 30 tentativas — clique nas colunas pra ordenar.
                </p>
              </div>
              <span
                className="numeric rounded-md px-2 py-0.5 text-[11px]"
                style={{
                  color: "var(--fg-muted)",
                  backgroundColor: "var(--surface-2)",
                }}
              >
                {uploads.length}
              </span>
            </div>
          }
          columns={historicoCols}
          rows={tabela}
          rowKey={(u) => u.id}
          emptyMessage="Nenhum upload ainda."
        />
      </div>
    </AppShell>
  );
}

function StatusUpload({
  status,
}: {
  status: "PROCESSING" | "SUCCESS" | "FAILED";
}) {
  if (status === "SUCCESS")
    return <StatusBadge tone="success">Sucesso</StatusBadge>;
  if (status === "FAILED")
    return <StatusBadge tone="danger">Falha</StatusBadge>;
  return <StatusBadge tone="warning">Processando</StatusBadge>;
}

const historicoCols: Column<UploadRow>[] = [
  {
    key: "quando",
    header: "Quando",
    sortKey: "startedAt",
    cell: (u) => (
      <span
        className="numeric whitespace-nowrap text-[12px]"
        style={{ color: "var(--fg)" }}
      >
        {u.startedAt.toLocaleString("pt-BR")}
      </span>
    ),
  },
  {
    key: "quem",
    header: "Quem",
    sortKey: "userName",
    cell: (u) => <span style={{ color: "var(--fg)" }}>{u.userName}</span>,
  },
  {
    key: "dataset",
    header: "Dataset",
    sortKey: "dataset",
    cell: (u) => (
      <span
        className="rounded-md px-1.5 py-0.5 font-mono text-[10.5px]"
        style={{
          color: "var(--fg-muted)",
          backgroundColor: "var(--surface-2)",
        }}
      >
        {u.dataset}
      </span>
    ),
  },
  {
    key: "arquivo",
    header: "Arquivo",
    sortKey: "filename",
    cell: (u) => (
      <span
        className="block max-w-xs truncate"
        title={u.filename}
        style={{ color: "var(--fg)" }}
      >
        {u.filename}
      </span>
    ),
  },
  {
    key: "linhas",
    header: "Linhas",
    sortKey: "rowCount",
    align: "right",
    cell: (u) => (
      <span className="numeric" style={{ color: "var(--fg-strong)" }}>
        {fmtNum(u.rowCount)}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    sortKey: "status",
    cell: (u) => (
      <div>
        <StatusUpload status={u.status} />
        {u.status === "FAILED" && u.errorMessage && (
          <p
            className="mt-0.5 max-w-md truncate text-[11px]"
            title={u.errorMessage}
            style={{ color: "#e11d48" }}
          >
            {u.errorMessage}
          </p>
        )}
      </div>
    ),
  },
];
