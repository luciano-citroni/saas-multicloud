type AppLocale = 'pt' | 'en';

type Label = { pt: string; en: string };

function pick(locale: AppLocale, label: Label): string {
    return locale === 'en' ? label.en : label.pt;
}

const EXACT: Record<string, Label> = {
    'EBS:SnapshotUsage': { pt: 'Snapshot de disco', en: 'Disk snapshot' },
    LoadBalancerUsage: { pt: 'Balanceador de carga', en: 'Load balancer' },
    LCUUsage: { pt: 'Uso do balanceador', en: 'Load balancer usage' },
    'PublicIPv4:InUseAddress': { pt: 'IP público em uso', en: 'Public IP in use' },
    PublicIPv4InUse: { pt: 'IP público em uso', en: 'Public IP in use' },
    'PublicIPv4:IdleAddress': { pt: 'IP público ocioso', en: 'Idle public IP' },
    PublicIPv4Idle: { pt: 'IP público ocioso', en: 'Idle public IP' },
    'NatGateway-Hours': { pt: 'NAT Gateway', en: 'NAT Gateway' },
    'NatGateway-Bytes': { pt: 'Tráfego do NAT', en: 'NAT traffic' },
    'Small-SimpleAD-Usage': { pt: 'Simple AD', en: 'Simple AD' },
    APIRequest: { pt: 'Chamadas de API', en: 'API requests' },
    WebACLV2: { pt: 'Firewall WAF', en: 'WAF firewall' },
    RuleV2: { pt: 'Regra do WAF', en: 'WAF rule' },
    'TimedStorage-ByteHrs': { pt: 'Armazenamento', en: 'Storage' },
    'Health-Check-Option-AWS': { pt: 'Health check DNS', en: 'DNS health check' },
    HostedZone: { pt: 'Zona DNS', en: 'DNS zone' },
    Queries: { pt: 'Consultas DNS', en: 'DNS queries' },
    'AWSSecretsManager-Secrets': { pt: 'Segredos', en: 'Secrets' },
    'CW:AlarmMonitorUsage': { pt: 'Alarmes', en: 'Alarms' },
    'Aurora:BackupUsage': { pt: 'Backup Aurora', en: 'Aurora backup' },
};

/** Nome curto para o usuário final. O valor original é um usage type da AWS. */
export function friendlyResourceLabel(raw: string, locale: AppLocale = 'pt'): string {
    const name = raw.trim();
    if (!name) return name;

    const exact = EXACT[name];
    if (exact) return pick(locale, exact);

    const workspace = name.match(/^AW-HW-\d+(?:-\d+)?-(AutoStop|AlwaysOn)-(Usage|User)$/i);
    if (workspace) {
        const hourly = workspace[2].toLowerCase() === 'usage';
        return pick(locale, hourly
            ? { pt: 'WorkSpaces por hora', en: 'WorkSpaces per hour' }
            : { pt: 'WorkSpaces por usuário', en: 'WorkSpaces per user' });
    }

    const compute = name.match(/^(BoxUsage|SpotUsage|HeavyUsage):(.+)$/);
    if (compute) {
        const prefix = compute[1] === 'SpotUsage' ? 'EC2 spot ' : compute[1] === 'HeavyUsage' ? 'EC2 reservada ' : 'EC2 ';
        const english = compute[1] === 'SpotUsage' ? 'EC2 spot ' : compute[1] === 'HeavyUsage' ? 'EC2 reserved ' : 'EC2 ';
        return pick(locale, { pt: `${prefix}${compute[2]}`, en: `${english}${compute[2]}` });
    }

    const volume = name.match(/^EBS:VolumeUsage\.(.+)$/);
    if (volume) return pick(locale, { pt: `Disco ${volume[1]}`, en: `${volume[1]} volume` });

    if (name.startsWith('Fargate-vCPU')) return 'Fargate · vCPU';
    if (name.startsWith('Fargate-GB')) return pick(locale, { pt: 'Fargate · memória', en: 'Fargate · memory' });
    if (name.includes('KMS-Keys') || name.includes('KMS-Requests')) return pick(locale, { pt: 'Chaves KMS', en: 'KMS keys' });
    if (/DataTransfer-Out|AWS-Out-Bytes|-Out-Bytes/.test(name)) return pick(locale, { pt: 'Saída de dados', en: 'Data transfer out' });
    if (/DataTransfer-In|-In-Bytes/.test(name)) return pick(locale, { pt: 'Entrada de dados', en: 'Data transfer in' });
    if (/Regional-Bytes/.test(name)) return pick(locale, { pt: 'Transferência regional', en: 'Regional transfer' });
    if (name.startsWith('Requests-')) return pick(locale, { pt: 'Requisições', en: 'Requests' });
    if (name.startsWith('TimedStorage')) return pick(locale, { pt: 'Armazenamento', en: 'Storage' });

    return name
        .replace(/^[A-Z]{2,4}\d?-/, '')
        .replace(/[:._-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || name;
}

export function collapseResourceLabels(
    rows: Array<{ name: string; amount: number }>,
    locale: AppLocale,
): Array<{ name: string; amount: number }> {
    const totals = new Map<string, number>();
    for (const row of rows) {
        const label = friendlyResourceLabel(row.name, locale);
        totals.set(label, (totals.get(label) ?? 0) + row.amount);
    }
    return [...totals.entries()]
        .map(([name, amount]) => ({ name, amount }))
        .filter((row) => Math.abs(row.amount) > 0.000001)
        .sort((left, right) => right.amount - left.amount);
}
