import AppShell from "@/components/Layout/AppShell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Dataset } from "@prisma/client";
import { DATASET_LABELS } from "@/lib/parsers";
import UploadCard from "./UploadCard";
import GenerateReportsBanner from "@/components/UI/GenerateReportsBanner";

export const metadata = { title: "Upload de planilhas — Autron Dash" };

const DATASET_ORDER: Dataset[] = [
  "PEDIDO",
  "FOLLOWUP",
  "ESTOQUE",
  "FATURAMENTO",
  "CLASSIFICACAO",
];

const ROLES_WRITE = new Set(["ADMIN", "DIRETOR", "GERENTE", "OPERADOR"]);

export default async function UploadsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const canUpload = ROLES_WRITE.has(session.user.role);

  const uploads = await prisma.dataUpload.findMany({
    where: { tenantId: session.user.tenantId },
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

  return (
    <AppShell
      title="Upload de planilhas"
      subtitle="Cada upload substitui os dados anteriores do dataset."
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
            Seu papel ({session.user.role}) é somente leitura. Apenas ADMIN, DIRETOR,
            GERENTE e OPERADOR podem fazer upload.
          </div>
        )}

        {/* Banner: gerar relatórios (habilita quando os 5 datasets têm upload SUCCESS) */}
        <GenerateReportsBanner
          state={{ loaded: lastByDataset.size, total: DATASET_ORDER.length }}
        />

        {/* Cards de upload */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {DATASET_ORDER.map((ds) => {
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

        {/* Histórico */}
        <section
          className="rounded-2xl border overflow-hidden"
          style={{
            backgroundColor: "var(--surface)",
            borderColor: "var(--border-soft)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: "1px solid var(--border-soft)" }}
          >
            <div>
              <h2
                className="text-[14px] font-semibold tracking-tight"
                style={{ color: "var(--fg-strong)" }}
              >
                Histórico recente
              </h2>
              <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
                Últimas 30 tentativas — sucessos, processando e falhas.
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

          {uploads.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px]" style={{ color: "var(--fg-muted)" }}>
              Nenhum upload ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr
                    className="text-left text-[10.5px] uppercase tracking-wider"
                    style={{
                      color: "var(--fg-muted)",
                      backgroundColor: "var(--surface-2)",
                    }}
                  >
                    <th className="px-5 py-2.5 font-medium">Quando</th>
                    <th className="px-5 py-2.5 font-medium">Quem</th>
                    <th className="px-5 py-2.5 font-medium">Dataset</th>
                    <th className="px-5 py-2.5 font-medium">Arquivo</th>
                    <th className="px-5 py-2.5 text-right font-medium">Linhas</th>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((u) => (
                    <tr
                      key={u.id}
                      className="transition-colors hover:bg-[var(--surface-2)]"
                      style={{ borderTop: "1px solid var(--border-soft)" }}
                    >
                      <td className="px-5 py-2.5 whitespace-nowrap" style={{ color: "var(--fg)" }}>
                        {u.startedAt.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-5 py-2.5" style={{ color: "var(--fg)" }}>
                        {u.user.name}
                      </td>
                      <td className="px-5 py-2.5">
                        <span
                          className="rounded-md px-1.5 py-0.5 font-mono text-[10.5px]"
                          style={{
                            color: "var(--fg-muted)",
                            backgroundColor: "var(--surface-2)",
                          }}
                        >
                          {u.dataset}
                        </span>
                      </td>
                      <td
                        className="max-w-xs truncate px-5 py-2.5"
                        title={u.filename}
                        style={{ color: "var(--fg)" }}
                      >
                        {u.filename}
                      </td>
                      <td
                        className="numeric px-5 py-2.5 text-right"
                        style={{ color: "var(--fg-strong)" }}
                      >
                        {u.rowCount.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-5 py-2.5">
                        <StatusBadge status={u.status} />
                        {u.status === "FAILED" && u.errorMessage && (
                          <p
                            className="mt-0.5 max-w-md truncate text-[11px]"
                            title={u.errorMessage}
                            style={{ color: "#e11d48" }}
                          >
                            {u.errorMessage}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: "PROCESSING" | "SUCCESS" | "FAILED" }) {
  const map = {
    SUCCESS: {
      color: "#059669",
      bg: "color-mix(in srgb, #10b981 12%, transparent)",
      border: "color-mix(in srgb, #10b981 30%, transparent)",
      label: "Sucesso",
    },
    FAILED: {
      color: "#e11d48",
      bg: "color-mix(in srgb, #e11d48 12%, transparent)",
      border: "color-mix(in srgb, #e11d48 30%, transparent)",
      label: "Falha",
    },
    PROCESSING: {
      color: "#b45309",
      bg: "color-mix(in srgb, #f59e0b 12%, transparent)",
      border: "color-mix(in srgb, #f59e0b 30%, transparent)",
      label: "Processando",
    },
  } as const;
  const s = map[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium"
      style={{ color: s.color, backgroundColor: s.bg, borderColor: s.border }}
    >
      <span className="size-1 rounded-full" style={{ backgroundColor: s.color }} />
      {s.label}
    </span>
  );
}
