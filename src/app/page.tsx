export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl w-full text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium border border-amber-500/20">
          <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
          Em construção — Fase 0 (scaffold)
        </div>
        <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
          Autron Dash v2
        </h1>
        <p className="text-slate-400 text-lg">
          Reescrita facelift do dashboard de gestão Autron — Next.js 15 + Prisma + Auth.js + Trezo UI.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 text-xs text-slate-500">
          <div className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800">Visão Geral</div>
          <div className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800">Prontidão</div>
          <div className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800">Entrega</div>
          <div className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800">Estoque</div>
        </div>
      </div>
    </main>
  );
}
