"use client";

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState } from "react";

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { className = "", ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? "text" : "password"}
        className={`w-full rounded-lg border bg-[var(--surface)] px-3 py-2.5 pr-10 text-[14px] text-[color:var(--fg-strong)] placeholder:text-[color:var(--fg-subtle)] outline-none transition focus:border-[var(--color-brand-500)] focus:ring-2 focus:ring-[color:var(--color-brand-500)]/20 ${className}`}
        style={{ borderColor: "var(--border-strong)" }}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        tabIndex={-1}
        className="ring-focus absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[color:var(--fg-subtle)] transition-colors hover:text-[color:var(--fg)]"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});

export default PasswordInput;
