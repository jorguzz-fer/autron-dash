export const metadata = {
  title: "Termos de Uso — Autron Dash",
};

export default function TermosPage() {
  return (
    <main className="min-h-screen px-6 py-10" style={{ backgroundColor: "var(--canvas)" }}>
      <article
        className="prose prose-invert prose-slate mx-auto max-w-3xl"
        style={{ color: "var(--fg)" }}
      >
        <h1 className="text-3xl font-bold" style={{ color: "var(--fg-strong)" }}>
          Termos de Uso
        </h1>
        <p style={{ color: "var(--fg-muted)" }}>
          Versão 1.0 — vigente desde {new Date().toLocaleDateString("pt-BR")}.
        </p>

        <Section title="1. Aceitação dos termos">
          Ao acessar o Autron Dash, o usuário concorda com estes Termos de Uso e com a{" "}
          <a href="/privacidade" className="underline">Política de Privacidade</a>.
          O uso é restrito a colaboradores autorizados pela Autron, com credenciais
          fornecidas pelo administrador do sistema.
        </Section>

        <Section title="2. Objeto">
          O Autron Dash é uma ferramenta interna de gestão de pedidos, follow-up,
          estoque, faturamento e oportunidades de CRM. Os dados visualizados são
          consolidações operacionais da empresa, sem fins comerciais ou de
          compartilhamento externo.
        </Section>

        <Section title="3. Conta e credenciais">
          Cada usuário recebe credenciais individuais e intransferíveis. É de
          responsabilidade do usuário: (a) manter a senha em segredo, (b) realizar
          logoff em estações compartilhadas, (c) comunicar imediatamente o
          administrador em caso de suspeita de comprometimento.
        </Section>

        <Section title="4. Perfis de acesso">
          O sistema utiliza controle de acesso baseado em papéis (RBAC) com cinco
          níveis: ADMIN, DIRETOR, GERENTE, OPERADOR e VIEWER. Cada perfil determina
          o que o usuário pode visualizar ou alterar. Tentativas de elevação de
          privilégio são bloqueadas no servidor e auditadas.
        </Section>

        <Section title="5. Uso aceitável">
          É proibido: (a) usar o sistema para finalidade não-operacional,
          (b) compartilhar credenciais, (c) fazer engenharia reversa do código ou
          tentar acesso não autorizado a dados de outros tenants, (d) extrair dados
          em massa por meios não previstos no sistema, (e) republicar conteúdo
          obtido pelo sistema sem autorização.
        </Section>

        <Section title="6. Propriedade intelectual">
          O código, a interface, a marca Autron e os dados operacionais são
          propriedade da Autron. O acesso ao sistema não confere ao usuário
          qualquer licença sobre esses ativos.
        </Section>

        <Section title="7. Disponibilidade">
          O sistema é entregue &quot;no estado em que se encontra&quot;. Não garantimos
          disponibilidade ininterrupta — podem ocorrer manutenções programadas,
          falhas de infraestrutura ou indisponibilidade de origens de dados
          (relatórios Protheus, Ploomes etc.).
        </Section>

        <Section title="8. Limitação de responsabilidade">
          As decisões operacionais e gerenciais tomadas com base nos dados do
          sistema são de exclusiva responsabilidade da Autron e dos seus
          colaboradores. O sistema é uma ferramenta de apoio, não substitui o
          julgamento humano nem auditorias formais.
        </Section>

        <Section title="9. Dados e segurança">
          Aplicamos: hash bcrypt nas senhas (12 rounds), sessões JWT de 8 horas,
          rate limit por IP e por email, security headers (HSTS, CSP), audit log
          em ações sensíveis, isolamento por tenant em todas as queries e
          comunicação obrigatoriamente em HTTPS. Detalhes adicionais na{" "}
          <a href="/privacidade" className="underline">Política de Privacidade</a>.
        </Section>

        <Section title="10. Alterações">
          Estes termos podem ser atualizados a qualquer momento. Alterações
          relevantes são comunicadas aos usuários ativos. O uso continuado após
          uma atualização representa aceitação da nova versão.
        </Section>

        <Section title="11. Foro">
          Fica eleito o foro da comarca da sede da Autron para dirimir quaisquer
          questões relativas a estes Termos.
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-xl font-semibold" style={{ color: "var(--fg-strong)" }}>
        {title}
      </h2>
      <p className="mt-1 leading-relaxed" style={{ color: "var(--fg)" }}>
        {children}
      </p>
    </section>
  );
}
