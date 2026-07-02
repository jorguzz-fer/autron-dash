"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Restaura a posição de scroll após uma navegação de filtro.
 *
 * Contexto: quando a navegação RSC (soft) de troca de filtro cai em 503 — o
 * que ainda ocorre durante picos de I/O do Postgres na VPS — o Next.js faz
 * fallback pra um reload de página inteira, que zera o scroll (a página é
 * "nova" para o browser). Os filtros (DateRangeFilter, SegmentedControl)
 * gravam window.scrollY em sessionStorage antes de navegar; este componente,
 * ao montar (o que acontece a cada reload), devolve o usuário pra onde estava.
 *
 * Em navegação soft bem-sucedida o componente não remonta, então este restore
 * não interfere (o scroll: false do router já preserva a posição); a chave só
 * é consumida quando há de fato um reload.
 */
export default function ScrollRestore() {
  const pathname = usePathname();

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(`scroll:${pathname}`);
      if (saved != null) sessionStorage.removeItem(`scroll:${pathname}`);
    } catch {
      return;
    }
    if (saved == null) return;
    const y = Number(saved);
    if (!Number.isFinite(y) || y <= 0) return;
    // rAF dobrado: garante que o conteúdo server-rendered já mediu altura antes
    // de rolar (senão o scrollTo é clampado numa página ainda "curta").
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.scrollTo(0, y));
    });
  }, [pathname]);

  return null;
}
