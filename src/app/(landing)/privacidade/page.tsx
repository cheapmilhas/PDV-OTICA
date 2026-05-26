import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Política de privacidade e tratamento de dados pessoais.",
};

export default function PrivacidadePage() {
  return (
    <article className="container-custom py-16 md:py-24 prose prose-neutral max-w-3xl">
      <h1>Política de Privacidade</h1>
      <p>
        <strong>Última atualização:</strong> 25 de maio de 2026
      </p>

      <h2>1. Quem somos</h2>
      <p>
        A <strong>PDV Ótica</strong> é uma plataforma SaaS de gestão para óticas. Esta
        política descreve como tratamos os dados pessoais coletados em nossa plataforma,
        em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
      </p>

      <h2>2. Papéis (Art. 5º, VI e VII LGPD)</h2>
      <ul>
        <li>
          <strong>CONTROLADOR</strong>: o cliente assinante da PLATAFORMA (a ótica) é o
          controlador dos dados de seus próprios clientes, funcionários e fornecedores.
          Cabe a ele definir base legal, finalidade e obter consentimento quando necessário.
        </li>
        <li>
          <strong>OPERADOR</strong>: a PDV Ótica é operadora dos dados tratados pela
          PLATAFORMA, agindo exclusivamente sob as instruções do CONTROLADOR e conforme
          os Termos de Uso.
        </li>
      </ul>

      <h2>3. Dados que coletamos</h2>
      <h3>Da conta do CONTRATANTE</h3>
      <ul>
        <li>Nome, e-mail, telefone, CPF/CNPJ.</li>
        <li>Dados de pagamento (processados por gateway certificado; não armazenamos cartão).</li>
        <li>Logs de acesso (IP, user-agent, timestamp) para fins de segurança.</li>
      </ul>

      <h3>Dos clientes finais cadastrados pelo CONTRATANTE</h3>
      <ul>
        <li>
          Dados cadastrais (nome, CPF, telefone, endereço, e-mail) e histórico de compras.
        </li>
        <li>
          <strong>Receita oftalmológica</strong> (dado pessoal sensível — categoria saúde,
          Art. 11 LGPD): valores de grau, distância pupilar, ceratometria, prescrição.
          Tratados exclusivamente para a finalidade comercial da ótica, com base legal
          fornecida pelo CONTROLADOR (consentimento, execução de contrato ou exercício
          regular de direito).
        </li>
      </ul>

      <h2>4. Finalidades</h2>
      <ul>
        <li>Operação da PLATAFORMA contratada.</li>
        <li>Cobrança e gestão da assinatura.</li>
        <li>Suporte técnico e comunicação operacional.</li>
        <li>Cumprimento de obrigações legais e regulatórias.</li>
        <li>Segurança da informação e prevenção a fraude.</li>
      </ul>

      <h2>5. Compartilhamento</h2>
      <p>
        Não vendemos dados pessoais. Compartilhamos apenas com fornecedores essenciais à
        operação, sob acordo de confidencialidade e proteção de dados:
      </p>
      <ul>
        <li><strong>Hospedagem</strong>: Vercel (infraestrutura web).</li>
        <li><strong>Banco de dados</strong>: Neon (PostgreSQL gerenciado).</li>
        <li><strong>Armazenamento de arquivos</strong>: Supabase Storage.</li>
        <li><strong>Analytics</strong>: PostHog (eventos de produto pseudonimizados).</li>
        <li><strong>OCR de receita (opcional)</strong>: Anthropic (Claude Vision).</li>
        <li><strong>Pagamentos</strong>: Asaas (quando aplicável).</li>
      </ul>

      <h2>6. Segurança</h2>
      <ul>
        <li>Criptografia em trânsito (TLS 1.2+).</li>
        <li>Criptografia em repouso (storage gerenciado).</li>
        <li>Senhas armazenadas com hash bcrypt.</li>
        <li>Sessões assinadas criptograficamente (JWT).</li>
        <li>Isolamento multi-tenant em todas as consultas (companyId).</li>
        <li>Auditoria de acessos administrativos.</li>
      </ul>

      <h2>7. Retenção</h2>
      <p>
        Dados são mantidos enquanto a conta estiver ativa e por até <strong>30 dias após
        o cancelamento</strong> para fins de export. Após esse prazo, dados podem ser
        anonimizados ou excluídos. Registros fiscais e financeiros podem ser retidos pelo
        prazo legal aplicável (até 5 anos).
      </p>

      <h2>8. Direitos do titular (Art. 18 LGPD)</h2>
      <p>
        O titular dos dados pode solicitar: confirmação de tratamento, acesso, correção,
        anonimização, portabilidade, eliminação, informação sobre compartilhamento e
        revogação de consentimento.
      </p>
      <p>
        Para dados de clientes finais cadastrados na PLATAFORMA, a solicitação deve ser
        encaminhada à ótica contratante (CONTROLADOR). Para dados da conta do contratante
        ou da relação com a PLATAFORMA, escreva para{" "}
        <a href="mailto:dpo@pdvotica.com.br">dpo@pdvotica.com.br</a>. Responderemos em até
        15 dias úteis.
      </p>

      <h2>9. Encarregado (DPO)</h2>
      <p>
        Encarregado pelo tratamento de dados: <strong>dpo@pdvotica.com.br</strong>
      </p>

      <h2>10. Incidentes de segurança</h2>
      <p>
        Em caso de incidente de segurança envolvendo dados pessoais, notificaremos a ANPD
        e os titulares afetados em prazo razoável, conforme exigido pela LGPD e
        regulamentação da ANPD.
      </p>

      <h2>11. Alterações</h2>
      <p>
        Esta política pode ser atualizada. A versão vigente sempre estará disponível nesta
        página, com data da última revisão.
      </p>
    </article>
  );
}
