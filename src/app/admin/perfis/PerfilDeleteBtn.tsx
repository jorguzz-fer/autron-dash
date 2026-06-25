"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { excluirPerfilAction } from "./actions";

export default function PerfilDeleteBtn({
  id,
  label,
  userCount,
}: {
  id: string;
  label: string;
  userCount: number;
}) {
  const [pending, startTransition] = useTransition();

  function onDelete() {
    const aviso =
      userCount > 0
        ? `Excluir o perfil "${label}"? ${userCount} usuário(s) voltarão ao padrão do nível de segurança deles.`
        : `Excluir o perfil "${label}"?`;
    if (!confirm(aviso)) return;
    startTransition(async () => {
      const r = await excluirPerfilAction({ id });
      if (!r.ok) alert(r.error);
    });
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending}
      aria-label={`Excluir perfil ${label}`}
      title="Excluir perfil"
      className="ring-focus flex size-8 items-center justify-center rounded-md border transition-colors hover:bg-[var(--surface-2)] disabled:opacity-50"
      style={{ borderColor: "var(--border-soft)", color: "#e11d48" }}
    >
      <Trash2 className="size-4" />
    </button>
  );
}
