import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Dataset } from "@prisma/client";
import { DATASET_LABELS } from "@/lib/parsers";
import UploadCard from "./UploadCard";

export const metadata = {
  title: "Upload de planilhas — Autron Dash",
};

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

  // Último upload bem sucedido por dataset
  const lastByDataset = new Map<Dataset, (typeof uploads)[number]>();
  for (const u of uploads) {
    if (u.status === "SUCCESS" && !lastByDataset.has(u.dataset)) {
      lastByDataset.set(u.dataset, u);
    }
  }

  return (
    <main className="min-h-screen px-6 py-10 bg-slate-950">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Upload de planilhas</h1>
            <p className="text-sm text-slate-400 mt-1">
              Cada upload <strong>substitui</strong> os dados anteriores do dataset correspondente.
              O histórico do upload (quem, quando, hash) é preservado para auditoria.
            </p>
          </div>
          <a
            href="/dashboard"
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 transition"
          >
            ← Dashboard
          </a>
        </header>

        {!canUpload && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 px-4 py-3 text-sm">
            Seu papel ({session.user.role}) é somente leitura. Apenas ADMIN, DIRETOR, GERENTE e
            OPERADOR podem fazer upload.
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DATASET_ORDER.map((ds) => (
            <UploadCard
              key={ds}
              dataset={ds}
              label={DATASET_LABELS[ds]}
              disabled={!canUpload}
              lastUpload={
                lastByDataset.get(ds)
                  ? {
                      filename: lastByDataset.get(ds)!.filename,
                      rowCount: lastByDataset.get(ds)!.rowCount,
                      finishedAt: lastByDataset.get(ds)!.finishedAt?.toISOString() ?? null,
                      userName: lastByDataset.get(ds)!.user.name,
                    }
                  : null
              }
            />
          ))}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-3">Histórico recente</h2>
          {uploads.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum upload ainda.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2">Quando</th>
                    <th className="text-left px-3 py-2">Quem</th>
                    <th className="text-left px-3 py-2">Dataset</th>
                    <th className="text-left px-3 py-2">Arquivo</th>
                    <th className="text-right px-3 py-2">Linhas</th>
                    <th className="text-left px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((u) => (
                    <tr
                      key={u.id}
                      className="border-t border-slate-800 hover:bg-slate-900/50 transition"
                    >
                      <td className="px-3 py-2 text-slate-300 whitespace-nowrap">
                        {u.startedAt.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 text-slate-300">{u.user.name}</td>
                      <td className="px-3 py-2 text-slate-400">{u.dataset}</td>
                      <td className="px-3 py-2 text-slate-300 max-w-xs truncate" title={u.filename}>
                        {u.filename}
                      </td>
                      <td className="px-3 py-2 text-slate-200 text-right tabular-nums">
                        {u.rowCount.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={u.status} />
                        {u.status === "FAILED" && u.errorMessage && (
                          <p
                            className="text-xs text-red-400 mt-0.5 max-w-md truncate"
                            title={u.errorMessage}
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
    </main>
  );
}

function StatusBadge({ status }: { status: "PROCESSING" | "SUCCESS" | "FAILED" }) {
  if (status === "SUCCESS") {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
        ✓ Sucesso
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20">
        ✗ Falha
      </span>
    );
  }
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium border border-amber-500/20">
      Processando…
    </span>
  );
}
