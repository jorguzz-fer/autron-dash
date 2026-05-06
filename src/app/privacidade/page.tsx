export const metadata = {
  title: "Política de Privacidade — Autron Dash",
};

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen px-6 py-10 bg-slate-950">
      <article className="max-w-3xl mx-auto prose prose-invert prose-slate">
        <h1 className="text-3xl font-bold text-slate-100">Política de Privacidade</h1>
        <p className="text-slate-400">
          Versão 1.0 — vigente desde {new Date().toLocaleDateString("pt-BR")}.
        </p>

        <h2 className="text-xl font-semibold text-slate-100 mt-8">1. Dados coletados</h2>
        <p className="text-slate-300">
          O Autron Dash é uma ferramenta interna de gestão. Os dados coletados são exclusivamente operacionais
          (pedidos de venda, follow-up de compras, estoque e faturamento) e dados mínimos de cadastro de usuário
          (nome, email corporativo, senha hash e função).
        </p>

        <h2 className="text-xl font-semibold text-slate-100 mt-6">2. Finalidade</h2>
        <p className="text-slate-300">
          Os dados são tratados com a finalidade de operar internamente o controle de pedidos e faturamento da
          Autron, com base no legítimo interesse do controlador (Art. 7º, IX da LGPD) e no cumprimento de
          obrigações regulatórias e contratuais (Art. 7º, II e V).
        </p>

        <h2 className="text-xl font-semibold text-slate-100 mt-6">3. Compartilhamento</h2>
        <p className="text-slate-300">
          Os dados não são compartilhados com terceiros, exceto quando exigido por lei ou autoridade competente.
          O sistema roda em infraestrutura própria controlada pela Autron.
        </p>

        <h2 className="text-xl font-semibold text-slate-100 mt-6">4. Segurança</h2>
        <p className="text-slate-300">
          Aplicamos: autenticação com hash bcrypt, sessões JWT com expiração curta, rate limit por IP e usuário,
          security headers (HSTS, CSP, X-Frame-Options), audit log de ações sensíveis, isolamento por tenant e
          comunicação obrigatoriamente em HTTPS.
        </p>

        <h2 className="text-xl font-semibold text-slate-100 mt-6">5. Direitos do titular</h2>
        <p className="text-slate-300">
          Nos termos do Art. 18 da LGPD, o titular pode solicitar acesso, correção, anonimização, portabilidade
          ou eliminação dos seus dados pessoais. Solicitações devem ser enviadas ao DPO da Autron.
        </p>

        <h2 className="text-xl font-semibold text-slate-100 mt-6">6. Retenção</h2>
        <p className="text-slate-300">
          Logs de auditoria e dados de pedido são retidos pelo prazo necessário para o cumprimento de obrigações
          legais e fiscais (mínimo de 5 anos para documentos fiscais).
        </p>

        <h2 className="text-xl font-semibold text-slate-100 mt-6">7. Contato</h2>
        <p className="text-slate-300">
          Dúvidas e solicitações: dpo@autron.com.br (placeholder — atualizar com endereço oficial).
        </p>
      </article>
    </main>
  );
}
