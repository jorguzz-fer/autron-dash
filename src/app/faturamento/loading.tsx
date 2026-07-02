/**
 * Skeleton instantâneo da rota /faturamento — o Next exibe isso no momento
 * do clique, enquanto o server component busca os dados. Elimina a sensação
 * de "travou ou está carregando?" nas navegações.
 */
export default function LoadingFaturamento() {
  return (
    <div className="min-h-screen px-8 py-6" style={{ backgroundColor: "var(--canvas)" }}>
      {/* Header */}
      <div className="mb-8 space-y-2">
        <div
          className="h-6 w-44 animate-pulse rounded-md"
          style={{ backgroundColor: "var(--surface-2)" }}
        />
        <div
          className="h-3.5 w-72 animate-pulse rounded-md"
          style={{ backgroundColor: "var(--surface-2)" }}
        />
      </div>

      {/* Filtro */}
      <div className="mb-8 flex gap-3">
        <div
          className="h-10 w-40 animate-pulse rounded-lg"
          style={{ backgroundColor: "var(--surface-2)" }}
        />
        <div
          className="h-10 w-40 animate-pulse rounded-lg"
          style={{ backgroundColor: "var(--surface-2)" }}
        />
      </div>

      {/* Seções de cards */}
      {[0, 1].map((s) => (
        <div
          key={s}
          className="mb-6 space-y-4 rounded-2xl px-6 py-5"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-brand-500) 4%, var(--canvas))",
            border: "1px solid color-mix(in srgb, var(--color-brand-500) 14%, var(--border-soft))",
          }}
        >
          <div
            className="h-5 w-52 animate-pulse rounded-md"
            style={{ backgroundColor: "var(--surface-2)" }}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((c) => (
              <div
                key={c}
                className="h-28 animate-pulse rounded-2xl border"
                style={{
                  backgroundColor: "var(--surface)",
                  borderColor: "var(--border-soft)",
                }}
              />
            ))}
          </div>
        </div>
      ))}

      <p
        className="flex items-center gap-2 text-[13px]"
        style={{ color: "var(--fg-muted)" }}
        role="status"
      >
        Carregando Faturamento…
      </p>
    </div>
  );
}
