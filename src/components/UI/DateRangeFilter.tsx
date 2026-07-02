"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CalendarRange, Loader2, X } from "lucide-react";

interface Props {
  /** Nome do query param de "de". Default: "from". */
  fromParam?: string;
  /** Nome do query param de "até". Default: "to". */
  toParam?: string;
  fromValue?: string;
  toValue?: string;
  /** Rótulo principal (ex: "Emissão", "Faturamento"). */
  label?: string;
}

/** Espera após a última mudança antes de navegar — evita um fetch por segmento digitado. */
const DEBOUNCE_MS = 500;

/** Se a navegação não completar nesse tempo, força reload (recupera de 503/RSC preso). */
const NAV_TIMEOUT_MS = 8000;

/**
 * Filtro de range de datas — input nativo type="date", URL-driven.
 * Server Component da página lê os params e ordena/filtra antes de render.
 *
 * UX: mudanças são debounced (uma navegação por edição, não por tecla) e,
 * enquanto o server re-renderiza, um spinner indica o carregamento
 * (useTransition — isPending cobre todo o ciclo RSC).
 */
export default function DateRangeFilter({
  fromParam = "from",
  toParam = "to",
  fromValue,
  toValue,
  label = "Período",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Estado local: o input responde na hora; a URL segue depois do debounce.
  const [localFrom, setLocalFrom] = useState(fromValue ?? "");
  const [localTo, setLocalTo] = useState(toValue ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server re-render (ou botão Limpar) atualizou os valores → re-sincroniza.
  useEffect(() => setLocalFrom(fromValue ?? ""), [fromValue]);
  useEffect(() => setLocalTo(toValue ?? ""), [toValue]);
  // A URL mudou de fato → navegação concluiu → cancela o watchdog.
  useEffect(() => {
    if (watchdog.current) clearTimeout(watchdog.current);
  }, [searchParams]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (watchdog.current) clearTimeout(watchdog.current);
    },
    [],
  );

  function navigate(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    startTransition(() => {
      // scroll: false — sem isso o Next rola pro topo a cada navegação,
      // "chutando" o usuário pra fora do card enquanto ele ainda está
      // escolhendo o range (card TOP 20 fica no meio da página).
      router.push(url, { scroll: false });
    });
    // Rede de segurança: se a navegação RSC não completar (ex.: 503 durante
    // um pico de I/O do banco), o useTransition fica preso com isPending=true
    // e o "Atualizando…" nunca some. Após NAV_TIMEOUT_MS sem a URL ter mudado,
    // força um reload real — que reexecuta a requisição e normalmente cai numa
    // janela saudável. O efeito acima cancela este timer quando a nav conclui.
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = setTimeout(() => {
      const current = window.location.pathname + window.location.search;
      if (current !== url) window.location.href = url;
    }, NAV_TIMEOUT_MS);
  }

  /**
   * Agenda UMA navegação com o par (from, to) mais recente dos dois campos.
   *
   * Importante: um único timer compartilhado, sempre reagendado com os
   * valores atuais de AMBOS os campos — não um timer por campo. Antes,
   * mudar "De" e em seguida "Até" (dentro do debounce) cancelava o timer
   * do "De" e agendava um novo que só continha "Até", perdendo a mudança
   * de "De" silenciosamente. Isso fazia parecer que o filtro só reagia à
   * primeira data escolhida (e disparava sozinho, cedo demais, quando o
   * usuário só tocava um campo e parava).
   */
  function scheduleNavigate(nextFrom: string, nextTo: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      navigate((params) => {
        if (nextFrom) params.set(fromParam, nextFrom);
        else params.delete(fromParam);
        if (nextTo) params.set(toParam, nextTo);
        else params.delete(toParam);
      });
    }, DEBOUNCE_MS);
  }

  function clear() {
    if (timer.current) clearTimeout(timer.current);
    setLocalFrom("");
    setLocalTo("");
    navigate((params) => {
      params.delete(fromParam);
      params.delete(toParam);
    });
  }

  const hasFilter = !!(localFrom || localTo);

  return (
    <div className="flex flex-wrap items-end gap-3" aria-busy={isPending}>
      <div className="space-y-1">
        <label
          className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: "var(--fg-muted)" }}
        >
          <CalendarRange className="size-3" />
          {label} — De
        </label>
        <input
          type="date"
          value={localFrom}
          onChange={(e) => {
            setLocalFrom(e.target.value);
            scheduleNavigate(e.target.value, localTo);
          }}
          className="ring-focus rounded-lg border bg-[var(--surface)] px-3 py-2 text-[13px] outline-none transition focus:border-[var(--color-brand-500)]"
          style={{
            borderColor: "var(--border-strong)",
            color: "var(--fg-strong)",
            opacity: isPending ? 0.6 : 1,
          }}
        />
      </div>
      <div className="space-y-1">
        <label
          className="block text-[11px] font-medium uppercase tracking-[0.06em]"
          style={{ color: "var(--fg-muted)" }}
        >
          Até
        </label>
        <input
          type="date"
          value={localTo}
          onChange={(e) => {
            setLocalTo(e.target.value);
            scheduleNavigate(localFrom, e.target.value);
          }}
          className="ring-focus rounded-lg border bg-[var(--surface)] px-3 py-2 text-[13px] outline-none transition focus:border-[var(--color-brand-500)]"
          style={{
            borderColor: "var(--border-strong)",
            color: "var(--fg-strong)",
            opacity: isPending ? 0.6 : 1,
          }}
        />
      </div>
      {isPending && (
        <span
          className="inline-flex items-center gap-1.5 pb-2.5 text-[12px]"
          style={{ color: "var(--fg-muted)" }}
          role="status"
        >
          <Loader2 className="size-3.5 animate-spin" />
          Atualizando…
        </span>
      )}
      {hasFilter && !isPending && (
        <button
          type="button"
          onClick={clear}
          className="ring-focus inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-[12px] transition hover:bg-[var(--surface-2)]"
          style={{ borderColor: "var(--border-strong)", color: "var(--fg-muted)" }}
        >
          <X className="size-3.5" />
          Limpar
        </button>
      )}
    </div>
  );
}
