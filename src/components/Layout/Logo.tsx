import Image from "next/image";

interface LogoProps {
  size?: number;
  variant?: "stack" | "compact";
  className?: string;
}

/**
 * Marca Autron Dash — usa o logo em /public/logo.png + word-mark em texto.
 * "stack": logo + nome empilhado (sidebar header, login). "compact": só logo.
 */
export default function Logo({ size = 40, variant = "stack", className = "" }: LogoProps) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <div
        className="relative flex shrink-0 items-center justify-center rounded-xl"
        style={{ width: size, height: size }}
      >
        <Image
          src="/logo.png"
          alt="Autron"
          width={size}
          height={size}
          className="rounded-xl"
          priority
        />
      </div>
      {variant === "stack" && (
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-[color:var(--sidebar-fg-strong)]">
            Autron Dash
          </div>
          <div className="text-[11px] text-[color:var(--sidebar-fg)]">Painel de gestão</div>
        </div>
      )}
    </div>
  );
}
