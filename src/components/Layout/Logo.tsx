import Image from "next/image";

interface LogoProps {
  /** Altura em px. Largura é calculada do aspect ratio do wordmark (610×195). */
  height?: number;
  className?: string;
  priority?: boolean;
}

const ASPECT = 610 / 195; // ≈ 3.128

/**
 * Wordmark Autron — usa o logo em /public/logo.png. Mantém aspect ratio
 * automaticamente. Use altura ~28-32 em sidebars, ~56-72 em hero/login.
 */
export default function Logo({ height = 28, className = "", priority = false }: LogoProps) {
  const width = Math.round(height * ASPECT);
  return (
    <Image
      src="/logo.png"
      alt="Autron"
      width={width}
      height={height}
      priority={priority}
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}
