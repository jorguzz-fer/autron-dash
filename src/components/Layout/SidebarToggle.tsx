"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { useSidebar } from "./SidebarProvider";

/**
 * Botão de toggle da sidebar no TopBar.
 * Em telas < lg a sidebar fica sempre oculta, então o botão também (md:flex).
 */
export default function SidebarToggle() {
  const { collapsed, toggle } = useSidebar();
  const Icon = collapsed ? PanelLeft : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "Mostrar menu lateral" : "Ocultar menu lateral"}
      title={collapsed ? "Mostrar menu lateral" : "Ocultar menu lateral"}
      className="ring-focus hidden size-9 items-center justify-center rounded-lg transition-colors lg:flex"
      style={{
        color: "var(--fg-muted)",
        backgroundColor: "transparent",
      }}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
