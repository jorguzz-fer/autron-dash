"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

interface SearchInputProps {
  /** Nome do query param na URL. Default: "q". */
  name?: string;
  placeholder?: string;
  /** Largura mínima do input. Default: "min-w-[260px]". */
  className?: string;
  /** Delay do debounce em ms. Default: 300. */
  debounceMs?: number;
}

/**
 * Caixa de busca URL-driven com debounce.
 *  - Lê valor inicial de searchParams[name]
 *  - Digitar atualiza a URL após `debounceMs` (preserva outros params)
 *  - Botão ✕ limpa instantaneamente
 *  - Server Components re-renderizam ao mudar a URL — sem JS de lista local
 */
export default function SearchInput({
  name = "q",
  placeholder = "Pesquisar…",
  className = "min-w-[260px]",
  debounceMs = 300,
}: SearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const initial = searchParams.get(name) ?? "";
  const [value, setValue] = useState(initial);
  const lastPushed = useRef(initial);

  // Re-sincroniza quando o usuário navega externamente (back/forward, links).
  useEffect(() => {
    const fromUrl = searchParams.get(name) ?? "";
    if (fromUrl !== lastPushed.current) {
      setValue(fromUrl);
      lastPushed.current = fromUrl;
    }
  }, [searchParams, name]);

  // Empurra pra URL com debounce.
  useEffect(() => {
    if (value === lastPushed.current) return;
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) {
        params.set(name, value.trim());
      } else {
        params.delete(name);
      }
      lastPushed.current = value;
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    }, debounceMs);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, debounceMs, name, pathname]);

  const clear = () => {
    setValue("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete(name);
    lastPushed.current = "";
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <div className={`relative ${className}`}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
        style={{ color: "var(--fg-muted)" }}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="ring-focus w-full rounded-lg border py-2 pl-9 pr-9 text-[13px] outline-none"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border-soft)",
          color: "var(--fg)",
        }}
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Limpar busca"
          title="Limpar busca"
          className="ring-focus absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md transition-colors hover:bg-[color:var(--surface-2)]"
          style={{ color: "var(--fg-muted)" }}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
