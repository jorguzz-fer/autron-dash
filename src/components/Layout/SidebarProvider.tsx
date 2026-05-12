"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  toggle: () => {},
});

const STORAGE_KEY = "autron:sidebar:collapsed";

/**
 * Estado client-side da sidebar (visível / oculta) com persistência em localStorage.
 * Inicializa sempre como `false` (sidebar visível) pra evitar mismatch de SSR;
 * lê o valor salvo no primeiro mount e re-renderiza se diferente.
 *
 * Uso:
 *   - <SidebarProvider> ao redor de Sidebar e TopBar
 *   - useSidebar() em qualquer lugar pra ler/togglar
 */
export default function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      // localStorage indisponível (private mode etc.) — segue com default.
    }
    setHydrated(true);
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignora
      }
      return next;
    });
  };

  // Até hidratar, força collapsed=false (combina com SSR) — evita flash de estilo.
  const value = { collapsed: hydrated ? collapsed : false, toggle };

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  return useContext(SidebarContext);
}
