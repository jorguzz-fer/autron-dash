"use client";

import { Printer } from "lucide-react";

/**
 * Botão "Imprimir" — dispara o diálogo de impressão do navegador.
 * O CSS @media print (globals.css) isola o #print-area, então só a
 * tabela de Pedidos (com os filtros aplicados) vai pro papel/PDF.
 */
export default function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="ring-focus inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors hover:brightness-110"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-brand-500) 10%, transparent)",
        borderColor: "color-mix(in srgb, var(--color-brand-500) 30%, transparent)",
        color: "var(--color-brand-600)",
      }}
      title="Imprimir a lista filtrada (respeita o filtro de Ação e busca)"
    >
      <Printer className="size-3.5" />
      {label}
    </button>
  );
}
