import Image from "next/image";

interface LogoProps {
  /** Altura em px. Largura é calculada do aspect ratio do wordmark (610×195). */
  height?: number;
  className?: string;
  priority?: boolean;
}

/**
 * Wordmark Autron (versão branca) — usa /public/logo-branco.png.
 * Ideal para fundos escuros (sidebar, painel do login).
 * width="auto" + height fixo = aspect ratio preservado automaticamente.
 * Use altura ~28-34 em sidebars, ~56-72 em hero/login.
 */
export default function Logo({ height = 28, className = "", priority = false }: LogoProps) {
  return (
    <Image
      src="/logo-branco.png"
      alt="Autron"
      width={400}
      height={height}
      priority={priority}
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}
