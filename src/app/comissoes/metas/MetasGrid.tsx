"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Save, Loader2, AlertTriangle, Check } from "lucide-react";
import CardSection from "@/components/UI/CardSection";
import { fmtCurrency } from "@/lib/format";
import type { MetaGridRow } from "@/lib/services/metasComissao";
import { salvarMetasAction, importarMetasAction } from "./actions";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface UnmatchedItem {
  nome: string;
  valores: (number | null)[];
}

interface Props {
  ano: number;
  anosOpts: number[];
  rows: MetaGridRow[];
}

export default function MetasGrid({ ano, anosOpts, rows }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, startSave] = useTransition();
  const [importing, setImporting] = useState(false);

  // Estado editável: código do vendedor → 12 valores.
  const [values, setValues] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(rows.map((r) => [r.codVendedor, [...r.valores]])),
  );
  const [unmatched, setUnmatched] = useState<UnmatchedItem[]>([]);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  function setCell(cod: string, mes: number, v: number) {
    setValues((prev) => ({
      ...prev,
      [cod]: (prev[cod] ?? new Array(12).fill(0)).map((old, i) => (i === mes ? v : old)),
    }));
    setDirty(true);
  }

  /** Sobrepõe 12 valores num vendedor (null = mantém o que já está). */
  function overlay(cod: string, valores: (number | null)[]) {
    setValues((prev) => ({
      ...prev,
      [cod]: (prev[cod] ?? new Array(12).fill(0)).map((old, i) =>
        valores[i] != null ? (valores[i] as number) : old,
      ),
    }));
    setDirty(true);
  }

  async function onPickFile(file: File) {
    setImporting(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await importarMetasAction(fd);
      if (!res.ok || !res.data) {
        setMsg({ tone: "err", text: res.error ?? "Falha ao ler a planilha" });
        return;
      }
      const { matched, unmatched: un, ano: anoDetectado, warnings } = res.data;
      for (const m of matched) overlay(m.codVendedor, m.valores);
      setUnmatched(un);
      const partes = [`${matched.length} vendedor(es) reconhecido(s) e preenchido(s)`];
      if (un.length > 0) partes.push(`${un.length} não reconhecido(s) — mapeie abaixo`);
      if (anoDetectado && anoDetectado !== ano) partes.push(`⚠ planilha é de ${anoDetectado}, você está editando ${ano}`);
      if (warnings.length) partes.push(warnings.join("; "));
      setMsg({ tone: un.length || (anoDetectado && anoDetectado !== ano) ? "warn" : "ok", text: partes.join(" · ") });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function mapUnmatched(idx: number, cod: string) {
    const item = unmatched[idx];
    if (!item) return;
    if (cod && cod !== "__ignore__") overlay(cod, item.valores);
    setUnmatched((prev) => prev.filter((_, i) => i !== idx));
  }

  function salvar() {
    startSave(async () => {
      setMsg(null);
      const entries = rows.map((r) => ({ codVendedor: r.codVendedor, valores: values[r.codVendedor] ?? [] }));
      const res = await salvarMetasAction({ ano, entries });
      if (res.ok) {
        setMsg({ tone: "ok", text: `Metas de ${ano} salvas.` });
        setDirty(false);
        router.refresh();
      } else {
        setMsg({ tone: "err", text: res.error ?? "Falha ao salvar" });
      }
    });
  }

  function trocarAno(a: number) {
    if (a === ano) return;
    if (dirty && !confirm("Há edições não salvas. Trocar de ano vai descartá-las. Continuar?")) return;
    router.push(`/comissoes/metas?ano=${a}`);
  }

  const totalCol = (i: number) => rows.reduce((s, r) => s + (values[r.codVendedor]?.[i] ?? 0), 0);
  const totalRow = (cod: string) => (values[cod] ?? []).reduce((s, v) => s + (v || 0), 0);
  const totalGeral = rows.reduce((s, r) => s + totalRow(r.codVendedor), 0);

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-stretch gap-0.5 rounded-lg border p-0.5" style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--surface-2)" }}>
          {anosOpts.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => trocarAno(a)}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium transition"
              style={a === ano ? { backgroundColor: "var(--surface)", color: "var(--fg-strong)", boxShadow: "var(--shadow-sm)" } : { color: "var(--fg-muted)" }}
            >
              {a}
            </button>
          ))}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="ring-focus inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium transition hover:bg-[var(--surface-2)]"
          style={{ borderColor: "var(--border-strong)", color: "var(--fg-strong)" }}
        >
          {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Importar planilha (.xlsx)
        </button>

        <button
          type="button"
          onClick={salvar}
          disabled={saving}
          className="ring-focus inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white transition"
          style={{ backgroundColor: "var(--color-brand-600, #0d9488)", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Salvar metas de {ano}
        </button>

        {dirty && !saving && (
          <span className="text-[12px]" style={{ color: "#f59e0b" }}>edições não salvas</span>
        )}
      </div>

      {msg && (
        <div
          className="flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px]"
          style={{
            color: msg.tone === "err" ? "#e11d48" : msg.tone === "warn" ? "#b45309" : "#047857",
            borderColor: "color-mix(in srgb, currentColor 30%, transparent)",
            backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)",
          }}
        >
          {msg.tone === "ok" ? <Check className="mt-0.5 size-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Não reconhecidos — mapeamento */}
      {unmatched.length > 0 && (
        <CardSection title="Não reconhecidos na planilha" subtitle="Mapeie para o vendedor certo (ex.: William → Willian) ou ignore. Quem não está cadastrado precisa ser criado em Vendedores.">
          <div className="space-y-2">
            {unmatched.map((u, idx) => (
              <div key={`${u.nome}-${idx}`} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-medium" style={{ color: "var(--fg-strong)" }}>{u.nome}</span>
                <span style={{ color: "var(--fg-subtle)" }}>
                  ({u.valores.every((v) => v == null) ? "A DEFINIR" : fmtCurrency(u.valores.reduce<number>((s, v) => s + (v ?? 0), 0), { decimals: 0 }) + " / ano"})
                </span>
                <span style={{ color: "var(--fg-subtle)" }}>→</span>
                <select
                  defaultValue=""
                  onChange={(e) => mapUnmatched(idx, e.target.value)}
                  className="rounded-lg border bg-[var(--surface)] px-2 py-1.5 text-[12.5px]"
                  style={{ borderColor: "var(--border-strong)", color: "var(--fg-strong)" }}
                >
                  <option value="">— mapear para —</option>
                  {rows.map((r) => (
                    <option key={r.codVendedor} value={r.codVendedor}>{r.nome}</option>
                  ))}
                  <option value="__ignore__">Ignorar</option>
                </select>
              </div>
            ))}
          </div>
        </CardSection>
      )}

      {/* Grade */}
      <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: "var(--border-soft)", backgroundColor: "var(--surface)" }}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wider" style={{ color: "var(--fg-muted)", backgroundColor: "var(--surface-2)" }}>
              <th className="sticky left-0 z-10 px-3 py-2.5 text-left font-medium" style={{ backgroundColor: "var(--surface-2)" }}>Vendedor</th>
              {MESES.map((m) => (
                <th key={m} className="px-2 py-2.5 text-right font-medium">{m}</th>
              ))}
              <th className="px-3 py-2.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.codVendedor} style={{ borderTop: "1px solid var(--border-soft)" }}>
                <td className="sticky left-0 z-10 px-3 py-1.5 font-medium" style={{ backgroundColor: "var(--surface)", color: r.ativo ? "var(--fg-strong)" : "var(--fg-subtle)" }}>
                  {r.nome}{!r.ativo && <span className="ml-1 text-[10px]" style={{ color: "var(--fg-subtle)" }}>(inativo)</span>}
                </td>
                {Array.from({ length: 12 }, (_, i) => (
                  <td key={i} className="px-1 py-1">
                    <input
                      type="number"
                      step="0.01"
                      value={values[r.codVendedor]?.[i] ?? 0}
                      onChange={(e) => setCell(r.codVendedor, i, e.target.value === "" ? 0 : Number(e.target.value))}
                      className="ring-focus w-[92px] rounded-md border bg-transparent px-1.5 py-1 text-right text-[12px] tabular-nums outline-none focus:border-[var(--color-brand-500)]"
                      style={{ borderColor: "var(--border-soft)", color: "var(--fg)" }}
                    />
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums" style={{ color: "var(--fg-strong)" }}>
                  {fmtCurrency(totalRow(r.codVendedor), { decimals: 0 })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border-strong)", backgroundColor: "var(--surface-2)" }}>
              <td className="sticky left-0 z-10 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ backgroundColor: "var(--surface-2)", color: "var(--fg-muted)" }}>Total</td>
              {Array.from({ length: 12 }, (_, i) => (
                <td key={i} className="px-2 py-2 text-right text-[11px] tabular-nums" style={{ color: "var(--fg-muted)" }}>
                  {fmtCurrency(totalCol(i), { decimals: 0 })}
                </td>
              ))}
              <td className="px-3 py-2 text-right text-[12px] font-bold tabular-nums" style={{ color: "var(--fg-strong)" }}>
                {fmtCurrency(totalGeral, { decimals: 0 })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="text-center text-[13px]" style={{ color: "var(--fg-muted)" }}>
          Nenhum vendedor cadastrado. Cadastre em Comissões → Vendedores.
        </p>
      )}
    </div>
  );
}
