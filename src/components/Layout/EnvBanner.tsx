import { isHomolog } from "@/lib/appEnv";

/**
 * Marcador visual do ambiente de homologação. Renderiza nada em produção.
 *
 * Os dois elementos são `fixed` + `pointer-events-none` de propósito: a
 * sidebar é `sticky top-0` e a topbar também, então qualquer coisa no fluxo
 * do documento empurraria as duas e criaria scroll. Assim o aviso é
 * permanente, aparece em todas as telas (inclusive login) e não encosta no
 * layout.
 *
 * z-50 fica acima da sidebar (z-30) e da topbar (z-20).
 */
export default function EnvBanner() {
  if (!isHomolog()) return null;

  return (
    <>
      {/* Fita no topo — assinatura visível em qualquer tela, sem ocupar espaço */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] bg-amber-500"
      />
      {/* Selo — o texto que tira a dúvida de quem chegou pelo link errado */}
      <div
        role="status"
        className="pointer-events-none fixed bottom-3 right-3 z-50 rounded-full border border-amber-400/40 bg-amber-500/95 px-3 py-1.5 text-xs font-semibold tracking-wide text-amber-950 shadow-lg"
      >
        HOMOLOGAÇÃO · dados de teste
      </div>
    </>
  );
}
