export type SaasDocTopic =
    | 'overview'
    | 'finops'
    | 'assessment'
    | 'cloud_inventory'
    | 'governance'
    | 'automation'
    | 'cloud_accounts'
    | 'onboarding';

export type SaasDocChunk = {
    topic: SaasDocTopic;
    title: string;
    content: string;
};

export const SAAS_DOCS: SaasDocChunk[] = [
    {
        topic: 'overview',
        title: 'Visão geral da plataforma',
        content: `A plataforma MultiCloud reúne em um só lugar custos, inventário de recursos, análises de conta, conformidade e automações para AWS, Azure e GCP.
Você só vê os dados da organização ativa e o que o seu papel nela permite.
O plano da organização define quais áreas ficam disponíveis: Análise de conta, Inventário, Governança, FinOps e Automações.`,
    },
    {
        topic: 'cloud_accounts',
        title: 'Conectar contas cloud',
        content: `Em Contas Cloud você conecta suas contas AWS, Azure ou GCP.
Depois de conectar, sincronize os dados e use as áreas liberadas no plano da organização.
As credenciais ficam protegidas e nunca aparecem na interface nem nas respostas do assistente.`,
    },
    {
        topic: 'onboarding',
        title: 'Primeiros passos com AWS',
        content: `Para conectar uma conta AWS:
1. Abra Contas Cloud e escolha adicionar uma conta AWS.
2. Siga o guia na tela para criar a role na AWS Console (as políticas prontas já aparecem lá).
3. Informe o ARN da role e a região, e valide a conexão.
4. Depois da validação, sincronize a conta para carregar inventário e custos.`,
    },
    {
        topic: 'finops',
        title: 'FinOps (custos)',
        content: `No FinOps você acompanha gastos cloud por serviço, conta e período.
Há visão geral da organização, comparação entre períodos, alertas de anomalia, previsão de gastos e oportunidades de economia.
Os períodos mais comuns são últimos 7, 30 ou 90 dias, mês atual, mês anterior e ano até agora.
O assistente usa apenas os dados já sincronizados — não consulta a cloud em tempo real.`,
    },
    {
        topic: 'assessment',
        title: 'Análise da conta',
        content: `A análise da conta sincroniza os recursos e gera uma visão da arquitetura, com status das sincronizações e relatórios.
Use a sincronização geral para atualizar o inventário. Acompanhe o progresso, erros e o resultado de cada análise.
Sugestões de economia aparecem no FinOps; problemas de conformidade, na Governança.`,
    },
    {
        topic: 'cloud_inventory',
        title: 'Inventário de recursos',
        content: `O inventário lista os recursos AWS, Azure e GCP já sincronizados — compute, rede, armazenamento, bancos de dados, segurança e outros.
As consultas mostram quantidades por tipo, provedor, conta e região, quando disponíveis.
Buscas avançadas por tag ou nome em várias contas ao mesmo tempo podem ser limitadas nesta versão.`,
    },
    {
        topic: 'governance',
        title: 'Governança e conformidade',
        content: `A Governança avalia seus recursos com base em políticas de conformidade (como CIS), gera um score de 0 a 100 e lista problemas com severidade e recomendações.
Hoje há políticas para AWS e GCP; conformidade Azure ainda não está disponível.
Os problemas vêm do último scan concluído.`,
    },
    {
        topic: 'automation',
        title: 'Automações',
        content: `Nas Automações você define fluxos de trabalho para ações na cloud, acompanha as execuções e vê o histórico (sucesso, falha e duração).
Cada automação pode estar em rascunho, ativa ou inativa. Dados sensíveis dos parâmetros ficam ocultos.
Nesta versão o assistente só consulta — não cria, altera nem executa automações.`,
    },
];

export function getSaasDocsByTopic(topic?: string): SaasDocChunk[] {
    if (!topic) {
        return SAAS_DOCS;
    }
    const normalized = topic.trim().toLowerCase();
    return SAAS_DOCS.filter((doc) => doc.topic === normalized || doc.title.toLowerCase().includes(normalized));
}
