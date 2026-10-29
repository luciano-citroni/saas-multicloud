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
        title: 'Visão geral do SaaS',
        content: `O SaaS MultiCloud (Bridge MultCloud) centraliza inventário, assessment, governança, FinOps e automações para contas AWS, Azure e GCP.
Cada organização (tenant) isola seus dados. O usuário só enxerga a organização ativa e os recursos autorizados pelo seu papel (VIEWER, MEMBER, ADMIN, OWNER).
Módulos do plano podem habilitar/desabilitar Assessment, Cloud Inventory, Governance, FinOps e Automation.`,
    },
    {
        topic: 'cloud_accounts',
        title: 'Contas cloud',
        content: `Em Contas Cloud você conecta provedores (AWS via AssumeRole + ExternalId, Azure via Service Principal, GCP via impersonação de Service Account).
Após conectar, é possível sincronizar inventário (general sync) e usar os módulos habilitados no plano.
Credenciais ficam criptografadas no backend e nunca são expostas na UI nem ao assistente.`,
    },
    {
        topic: 'onboarding',
        title: 'Onboarding AWS',
        content: `Para AWS: crie uma IAM Role na conta do cliente com trust policy permitindo o usuário IAM da plataforma e ExternalId.
Anexe políticas de leitura (ex.: ReadOnlyAccess) para Assessment/Inventory e ce:GetCostAndUsage para FinOps.
Cadastre o Role ARN, região e ExternalId na tela de Contas Cloud e valide a conexão.`,
    },
    {
        topic: 'finops',
        title: 'Módulo FinOps',
        content: `FinOps coleta custos (após consentimento), agrega por serviço/conta/período, detecta anomalias, gera forecast, recomendações e oportunidades de economia.
Períodos comuns: last7days, last30days, last90days, currentmonth, lastmonth, ytd.
Dashboards incluem overview da organização, custos por conta/provedor, budgets e histórico.
O assistente consulta apenas dados já sincronizados — não chama APIs cloud diretamente.`,
    },
    {
        topic: 'assessment',
        title: 'Módulo Assessment',
        content: `Assessment sincroniza recursos da conta cloud e gera visão de arquitetura, jobs de sync e relatórios.
Use sync geral para atualizar inventário. Jobs mostram status, erros e progresso.
Recomendações de custo aparecem no FinOps; achados de conformidade no Governance.`,
    },
    {
        topic: 'cloud_inventory',
        title: 'Cloud Inventory',
        content: `O inventário persiste recursos AWS/Azure/GCP sincronizados (compute, network, storage, databases, segurança, etc.).
Consultas retornam contagens por tipo, provedor, conta e região quando disponíveis.
Busca cross-account avançada por tag/nome pode ser limitada nesta versão.`,
    },
    {
        topic: 'governance',
        title: 'Módulo Governance',
        content: `Governance avalia políticas (CIS e frameworks) em recursos inventariados, gera score 0–100 e findings com severidade e recomendações.
Atualmente há políticas AWS e GCP; Azure governance ainda não está disponível.
Findings não conformes podem ser consultados a partir do último scan concluído.`,
    },
    {
        topic: 'automation',
        title: 'Módulo Automations',
        content: `Automações definem workflows (nós/arestas) para provisionamento e ações cloud, com execuções rastreadas e parâmetros sensíveis redigidos.
Você pode listar automações, status (DRAFT/ACTIVE/INACTIVE) e histórico de runs (sucesso/falha/duração).
Nesta versão o assistente é somente consultivo — não cria, altera nem executa automações.`,
    },
];

export function getSaasDocsByTopic(topic?: string): SaasDocChunk[] {
    if (!topic) {
        return SAAS_DOCS;
    }
    const normalized = topic.trim().toLowerCase();
    return SAAS_DOCS.filter((doc) => doc.topic === normalized || doc.title.toLowerCase().includes(normalized));
}
