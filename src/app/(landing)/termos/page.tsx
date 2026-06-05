import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Termos de uso da plataforma PDV Ótica.",
};

export default function TermosPage() {
  return (
    <article className="container-custom py-16 md:py-24 prose-vis max-w-3xl">
      <h1>Termos de Uso</h1>
      <p>
        <strong>Última atualização:</strong> 25 de maio de 2026
      </p>

      <p>
        Estes Termos regulam o uso da plataforma <strong>PDV Ótica</strong> (a &quot;PLATAFORMA&quot;)
        pelo CONTRATANTE. Ao criar uma conta ou utilizar os serviços, o CONTRATANTE
        declara ter lido, compreendido e aceito integralmente estes Termos.
      </p>

      <h2>1. Objeto</h2>
      <p>
        A PLATAFORMA disponibiliza, em regime de software como serviço (SaaS), ferramentas
        de gestão para óticas: ponto de venda, controle de estoque, gestão de clientes,
        ordens de serviço, financeiro, relatórios e funcionalidades correlatas, conforme o
        plano contratado.
      </p>

      <h2>2. Responsabilidade pela emissão fiscal</h2>
      <p>
        <strong>
          O CONTRATANTE é o único responsável pela emissão de documentos fiscais
          (NFC-e, NF-e, SAT/MF-e) perante a SEFAZ de seu estado.
        </strong>{" "}
        A PLATAFORMA, nesta versão, <strong>não emite documento fiscal</strong> e não
        substitui sistema emissor autorizado. O CONTRATANTE compromete-se a manter um
        emissor fiscal próprio ou de terceiros para cumprir suas obrigações tributárias.
      </p>
      <p>
        A PLATAFORMA poderá, em versões futuras, oferecer integração com emissores fiscais
        como funcionalidade adicional. Nesse caso, condições específicas serão comunicadas
        e podem implicar custos adicionais.
      </p>

      <h2>3. Conta e segurança</h2>
      <p>
        O CONTRATANTE é responsável pela guarda das credenciais de acesso e por toda
        atividade realizada por usuários da sua conta. Deve notificar imediatamente a
        PLATAFORMA em caso de suspeita de uso não autorizado.
      </p>

      <h2>4. Plano, pagamento e cancelamento</h2>
      <p>
        Os preços vigentes estão descritos na página de planos. Pagamentos são processados
        mediante meios oferecidos pela PLATAFORMA. O CONTRATANTE pode cancelar a assinatura
        a qualquer momento; o acesso permanecerá disponível até o fim do ciclo já pago, sem
        reembolso proporcional, salvo previsão em contrário.
      </p>
      <p>
        Em caso de inadimplência superior a 14 dias, a PLATAFORMA poderá suspender o
        acesso até a regularização. Após 30 dias, a conta poderá ser rebaixada para um
        plano básico ou cancelada, com retenção dos dados por até 30 dias adicionais para
        export.
      </p>

      <h2>5. Tratamento de dados pessoais (LGPD)</h2>
      <p>
        Para fins do art. 5º, VI e VII da Lei nº 13.709/2018 (LGPD): a PLATAFORMA atua
        como <strong>OPERADOR</strong> dos dados pessoais tratados na ferramenta; o
        CONTRATANTE atua como <strong>CONTROLADOR</strong> dos dados de seus clientes,
        funcionários e fornecedores, sendo responsável pela base legal, finalidade,
        consentimento e atendimento a direitos de titulares.
      </p>
      <p>
        A PLATAFORMA trata os dados exclusivamente conforme instruções do CONTROLADOR e
        atende a solicitações de titulares encaminhadas pelo CONTROLADOR no prazo de até
        15 dias úteis. Detalhes adicionais constam da Política de Privacidade.
      </p>

      <h2>6. Limitação de responsabilidade</h2>
      <p>
        Na máxima extensão permitida pela legislação aplicável, a responsabilidade total
        da PLATAFORMA fica <strong>limitada ao valor pago pelo CONTRATANTE nos últimos
        12 meses</strong>, excluídos lucros cessantes, dano moral, dano indireto e perdas
        tributárias decorrentes de omissão ou erro do CONTRATANTE no cumprimento de suas
        obrigações fiscais.
      </p>
      <p>
        A PLATAFORMA é fornecida &quot;como está&quot;, com esforço razoável de
        disponibilidade. Pequenas paradas técnicas planejadas serão comunicadas com
        antecedência sempre que possível.
      </p>

      <h2>7. Propriedade intelectual</h2>
      <p>
        Todo o código, design, marca e conteúdo da PLATAFORMA são de propriedade exclusiva
        da PDV Ótica. O CONTRATANTE recebe licença não exclusiva, intransferível e revogável
        para uso da PLATAFORMA, limitada ao plano contratado.
      </p>

      <h2>8. Portabilidade na rescisão</h2>
      <p>
        Em caso de cancelamento, o CONTRATANTE pode solicitar export de seus dados em
        formato estruturado (XLSX/CSV/JSON) no prazo de 30 dias após o fim da assinatura.
        Após esse prazo, os dados podem ser anonimizados ou excluídos.
      </p>

      <h2>9. Alterações destes Termos</h2>
      <p>
        A PLATAFORMA pode atualizar estes Termos a qualquer momento, com aviso prévio de
        15 dias por e-mail ou painel. O uso continuado após a vigência da nova versão
        implica aceitação.
      </p>

      <h2>10. Foro</h2>
      <p>
        Fica eleito o foro da comarca de Fortaleza/CE para dirimir quaisquer controvérsias
        decorrentes destes Termos, com renúncia a qualquer outro, por mais privilegiado
        que seja.
      </p>

      <p>
        Dúvidas? Entre em contato pelo e-mail{" "}
        <a href="mailto:contato@pdvotica.com.br">contato@pdvotica.com.br</a> ou pela
        página de contato.
      </p>
    </article>
  );
}
