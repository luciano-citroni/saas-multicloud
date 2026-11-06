import type { AppLocale } from '../locale';

type Label = { pt: string; en: string };

const SERVICES: Record<string, Label> = {
    'Amazon Elastic Compute Cloud - Compute': { pt: 'EC2 · computação', en: 'EC2 · compute' },
    'EC2 - Other': { pt: 'EC2 · outros', en: 'EC2 · other' },
    'Amazon Elastic Compute Cloud': { pt: 'EC2', en: 'EC2' },
    'Amazon Elastic Block Store': { pt: 'Discos (EBS)', en: 'Disks (EBS)' },
    'Amazon Elastic Load Balancing': { pt: 'Balanceador de carga', en: 'Load balancer' },
    'Amazon Elastic Container Service': { pt: 'Contêineres (ECS)', en: 'Containers (ECS)' },
    'Amazon EC2 Container Registry (ECR)': { pt: 'Registro de contêineres', en: 'Container registry' },
    'Amazon Elastic Kubernetes Service': { pt: 'Kubernetes (EKS)', en: 'Kubernetes (EKS)' },
    'Amazon Virtual Private Cloud': { pt: 'Rede (VPC)', en: 'Network (VPC)' },
    'Amazon WorkSpaces': { pt: 'WorkSpaces', en: 'WorkSpaces' },
    'Amazon Simple Storage Service': { pt: 'Armazenamento (S3)', en: 'Storage (S3)' },
    'Amazon Relational Database Service': { pt: 'Banco de dados', en: 'Database' },
    'Amazon Route 53': { pt: 'DNS (Route 53)', en: 'DNS (Route 53)' },
    'AmazonCloudWatch': { pt: 'Monitoramento', en: 'Monitoring' },
    'Amazon CloudWatch': { pt: 'Monitoramento', en: 'Monitoring' },
    'AWS Key Management Service': { pt: 'Chaves (KMS)', en: 'Keys (KMS)' },
    'AWS Secrets Manager': { pt: 'Segredos', en: 'Secrets' },
    'AWS Directory Service': { pt: 'Diretório', en: 'Directory' },
    'AWS WAF': { pt: 'Firewall (WAF)', en: 'Firewall (WAF)' },
    'AWS Cost Explorer': { pt: 'Explorador de custos', en: 'Cost Explorer' },
    'AWS Lambda': { pt: 'Funções (Lambda)', en: 'Functions (Lambda)' },
    Tax: { pt: 'Impostos', en: 'Tax' },
    'Virtual Machines': { pt: 'Máquinas virtuais', en: 'Virtual machines' },
    Storage: { pt: 'Armazenamento', en: 'Storage' },
    Bandwidth: { pt: 'Tráfego', en: 'Bandwidth' },
};

/** Nome curto do serviço para legenda e eixo, no idioma da interface. */
export function friendlyServiceLabel(service: string, locale: AppLocale = 'pt'): string {
    const trimmed = service.trim();
    const known = SERVICES[trimmed];
    if (known) return locale === 'en' ? known.en : known.pt;
    return trimmed.replace(/^Amazon\s+/i, '').replace(/^AWS\s+/i, '');
}
