"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ShieldCheck, AlertCircle, Copy, Check, Download, KeyRound } from "lucide-react";
import { confirmarSetup } from "./actions";

export default function ConfigurarMfaForm({
  qrSvg,
  secretFormatted,
  otpauthUri,
}: {
  qrSvg: string;
  secretFormatted: string;
  otpauthUri: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [savedAck, setSavedAck] = useState(false);

  function handleConfirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get("code") ?? "");
    startTransition(async () => {
      const r = await confirmarSetup({ code });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setBackupCodes(r.backupCodes);
    });
  }

  function copySecret() {
    navigator.clipboard?.writeText(secretFormatted.replace(/\s+/g, "")).then(() => {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 1500);
    });
  }

  function downloadCodes() {
    if (!backupCodes) return;
    const blob = new Blob(
      [
        "Códigos de recuperação — Autron Dash\n",
        "Guarde em local seguro. Cada código só pode ser usado uma vez.\n\n",
        backupCodes.join("\n"),
        "\n",
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "autron-dash-codigos-recuperacao.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Etapa 2: códigos de recuperação ──────────────────────────────────────
  if (backupCodes) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="flex size-12 items-center justify-center rounded-full"
            style={{ backgroundColor: "color-mix(in srgb, #10b981 14%, transparent)" }}
          >
            <ShieldCheck className="size-6" style={{ color: "#10b981" }} />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
              Verificação ativada
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--fg-muted)" }}>
              Guarde os códigos de recuperação abaixo. Eles permitem entrar caso você
              perca o acesso ao app autenticador.
            </p>
          </div>
        </div>

        <div
          className="grid grid-cols-2 gap-2 rounded-lg border p-4 font-mono text-[13px]"
          style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--canvas)", color: "var(--fg-strong)" }}
        >
          {backupCodes.map((c) => (
            <span key={c} className="tracking-wider">{c}</span>
          ))}
        </div>

        <button
          type="button"
          onClick={downloadCodes}
          className="flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-[13px] font-medium transition hover:opacity-90"
          style={{ borderColor: "var(--border-strong)", color: "var(--fg)" }}
        >
          <Download className="size-4" /> Baixar códigos
        </button>

        <label className="flex items-start gap-2 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
          <input
            type="checkbox"
            checked={savedAck}
            onChange={(e) => setSavedAck(e.target.checked)}
            className="mt-0.5"
          />
          Guardei meus códigos de recuperação em local seguro.
        </label>

        <button
          type="button"
          disabled={!savedAck}
          onClick={() => {
            // Navegação "hard" para garantir que o cookie de sessão atualizado
            // (mfaEnabled/mfaVerified) seja enviado ao middleware.
            window.location.assign("/dashboard");
          }}
          className="w-full rounded-lg py-2.5 text-[14px] font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: "var(--color-brand-600)" }}
        >
          Concluir e acessar o painel
        </button>
      </div>
    );
  }

  // ── Etapa 1: QR + confirmação ────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className="flex size-12 items-center justify-center rounded-full"
          style={{ backgroundColor: "color-mix(in srgb, var(--color-brand-500) 12%, transparent)" }}
        >
          <KeyRound className="size-6" style={{ color: "var(--color-brand-500)" }} />
        </div>
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: "var(--fg-strong)" }}>
            Verificação em duas etapas
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--fg-muted)" }}>
            Escaneie o QR code com um app autenticador (Google Authenticator, Authy,
            1Password, Microsoft Authenticator…) e digite o código gerado.
          </p>
        </div>
      </div>

      {/* QR */}
      <div className="flex justify-center">
        <div
          className="rounded-lg border bg-white p-2"
          style={{ borderColor: "var(--border-strong)", width: 200, height: 200 }}
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
      </div>

      {/* Entrada manual */}
      <div className="space-y-1.5">
        <span className="block text-[12px] font-medium" style={{ color: "var(--fg)" }}>
          Não consegue escanear? Digite esta chave no app:
        </span>
        <button
          type="button"
          onClick={copySecret}
          className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left font-mono text-[13px] transition hover:opacity-90"
          style={{ borderColor: "var(--border-strong)", color: "var(--fg-strong)", backgroundColor: "var(--canvas)" }}
        >
          <span className="break-all">{secretFormatted}</span>
          {copiedSecret ? (
            <Check className="size-4 shrink-0" style={{ color: "#10b981" }} />
          ) : (
            <Copy className="size-4 shrink-0" style={{ color: "var(--fg-subtle)" }} />
          )}
        </button>
        <a
          href={otpauthUri}
          className="text-[11px] underline underline-offset-4"
          style={{ color: "var(--fg-subtle)" }}
        >
          Abrir no app autenticador
        </a>
      </div>

      <form onSubmit={handleConfirm} className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="code" className="block text-[12.5px] font-medium" style={{ color: "var(--fg)" }}>
            Código de verificação
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            placeholder="000000"
            className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2.5 text-center font-mono text-[18px] tracking-[0.4em] text-[color:var(--fg-strong)] outline-none transition focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[color:var(--color-brand-500)]/20"
            style={{ borderColor: "var(--border-strong)" }}
          />
        </div>

        {error && (
          <div
            className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12.5px]"
            style={{
              color: "#e11d48",
              backgroundColor: "color-mix(in srgb, #e11d48 8%, transparent)",
              borderColor: "color-mix(in srgb, #e11d48 28%, transparent)",
            }}
          >
            <AlertCircle className="mt-px size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg py-2.5 text-[14px] font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: "var(--color-brand-600)" }}
        >
          {pending ? "Verificando…" : "Ativar verificação"}
        </button>
      </form>
    </div>
  );
}
