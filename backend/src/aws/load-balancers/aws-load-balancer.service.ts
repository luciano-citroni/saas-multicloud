import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DescribeLoadBalancersCommand, DescribeListenersCommand, LoadBalancer, Listener } from '@aws-sdk/client-elastic-load-balancing-v2';
import { AwsConnectorService } from '../aws-connector.service';
import {
    AwsLoadBalancer,
    AwsLoadBalancerListener,
    LoadBalancerType,
    LoadBalancerState,
    IpAddressType,
    ListenerProtocol,
    AwsVpc,
    AwsSubnet,
    AwsSecurityGroup,
} from '../../db/entites/index';

@Injectable()
export class AwsLoadBalancerService {
    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsLoadBalancer)
        private readonly loadBalancerRepository: Repository<AwsLoadBalancer>,
        @InjectRepository(AwsLoadBalancerListener)
        private readonly listenerRepository: Repository<AwsLoadBalancerListener>,
        @InjectRepository(AwsVpc)
        private readonly vpcRepository: Repository<AwsVpc>,
        @InjectRepository(AwsSubnet)
        private readonly subnetRepository: Repository<AwsSubnet>,
        @InjectRepository(AwsSecurityGroup)
        private readonly securityGroupRepository: Repository<AwsSecurityGroup>
    ) {}

    // =========================================================================
    // Listar dados do BANCO DE DADOS (sem consultar AWS)
    // =========================================================================

    /**
     * Lista Load Balancers armazenados no banco de dados para uma CloudAccount específica.
     */
    async listLoadBalancersFromDatabase(cloudAccountId: string) {
        const loadBalancers = await this.loadBalancerRepository
            .createQueryBuilder('lb')
            .leftJoinAndSelect('lb.vpc', 'vpc')
            .leftJoinAndSelect('lb.listeners', 'listeners')
            .where('lb.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .orderBy('lb.createdTime', 'DESC')
            .getMany();

        return loadBalancers.map(mapDbLoadBalancer);
    }

    /**
     * Lista Load Balancers de uma VPC específica.
     */
    async listLoadBalancersByVpcFromDatabase(vpcId: string, cloudAccountId: string) {
        const loadBalancers = await this.loadBalancerRepository
            .createQueryBuilder('lb')
            .leftJoinAndSelect('lb.vpc', 'vpc')
            .leftJoinAndSelect('lb.listeners', 'listeners')
            .where('lb.vpcId = :vpcId', { vpcId })
            .andWhere('lb.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .orderBy('lb.createdTime', 'DESC')
            .getMany();

        return loadBalancers.map(mapDbLoadBalancer);
    }

    /**
     * Busca um Load Balancer específico pelo ID do banco de dados.
     */
    async getLoadBalancerById(loadBalancerId: string, cloudAccountId: string) {
        const loadBalancer = await this.loadBalancerRepository
            .createQueryBuilder('lb')
            .leftJoinAndSelect('lb.vpc', 'vpc')
            .leftJoinAndSelect('lb.listeners', 'listeners')
            .where('lb.id = :loadBalancerId', { loadBalancerId })
            .andWhere('lb.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .getOne();

        if (!loadBalancer) {
            throw new BadRequestException('Load Balancer não encontrado');
        }

        return mapDbLoadBalancer(loadBalancer);
    }

    // =========================================================================
    // Consultar AWS DIRETAMENTE (sem sincronizar no banco)
    // =========================================================================

    /**
     * Lista Load Balancers diretamente da AWS (sem salvar no banco).
     */
    async listLoadBalancersFromAws(cloudAccountId: string, organizationId: string, region?: string, awsVpcId?: string) {
        const client = await this.connector.getElbV2Client(cloudAccountId, organizationId, region);

        const { LoadBalancers } = await client.send(new DescribeLoadBalancersCommand({})).catch(() => {
            throw new BadRequestException(
                'Falha ao consultar Load Balancers na AWS. Verifique as permissões da role (elasticloadbalancing:DescribeLoadBalancers).'
            );
        });

        let loadBalancers = LoadBalancers ?? [];

        // Filtra por VPC se especificado
        if (awsVpcId) {
            loadBalancers = loadBalancers.filter((lb) => lb.VpcId === awsVpcId);
        }

        return loadBalancers.map(mapAwsLoadBalancer);
    }

    // =========================================================================
    // Sincronizar AWS → Banco de Dados
    // =========================================================================

    /**
     * Sincroniza Load Balancers da AWS para o banco de dados.
     * Pode filtrar por VPC se awsVpcId for fornecido.
     */
    async syncLoadBalancersFromAws(cloudAccountId: string, organizationId: string, region?: string, awsVpcId?: string) {
        const client = await this.connector.getElbV2Client(cloudAccountId, organizationId, region);

        const { LoadBalancers } = await client.send(new DescribeLoadBalancersCommand({})).catch(() => {
            throw new BadRequestException(
                'Falha ao consultar Load Balancers na AWS. Verifique as permissões da role (elasticloadbalancing:DescribeLoadBalancers).'
            );
        });

        let loadBalancers = LoadBalancers ?? [];

        // Filtra por VPC se especificado
        if (awsVpcId) {
            loadBalancers = loadBalancers.filter((lb) => lb.VpcId === awsVpcId);
        }

        const mappedLoadBalancers = loadBalancers.map(mapAwsLoadBalancer);
        const now = new Date();

        for (const lbData of mappedLoadBalancers) {
            // Verifica se Load Balancer já existe no banco
            let dbLoadBalancer = await this.loadBalancerRepository.findOne({
                where: { awsLoadBalancerArn: lbData.awsLoadBalancerArn },
            });

            // Busca a VPC no banco de dados (se existir)
            let vpc: AwsVpc | null = null;
            if (lbData.awsVpcId) {
                vpc = await this.vpcRepository.findOne({
                    where: { cloudAccountId, awsVpcId: lbData.awsVpcId },
                });

                if (!vpc) {
                    console.warn(`VPC ${lbData.awsVpcId} não encontrada. Load Balancer ${lbData.name} será salvo sem VPC.`);
                }
            }

            // Resolve Security Group IDs no banco de dados
            const securityGroupIds = await this.resolveSecurityGroupIds(cloudAccountId, lbData.awsSecurityGroupIds);

            if (dbLoadBalancer) {
                // Atualiza Load Balancer existente
                dbLoadBalancer.vpcId = vpc?.id ?? null;
                dbLoadBalancer.name = lbData.name;
                dbLoadBalancer.dnsName = lbData.dnsName;
                dbLoadBalancer.type = lbData.type;
                dbLoadBalancer.state = lbData.state;
                dbLoadBalancer.scheme = lbData.scheme;
                dbLoadBalancer.ipAddressType = lbData.ipAddressType;
                dbLoadBalancer.availabilityZones = lbData.availabilityZones;
                dbLoadBalancer.awsSecurityGroupIds = lbData.awsSecurityGroupIds;
                dbLoadBalancer.securityGroupIds = securityGroupIds;
                dbLoadBalancer.createdTime = lbData.createdTime;
                dbLoadBalancer.tags = lbData.tags;
                dbLoadBalancer.lastSyncedAt = now;
            } else {
                // Cria novo Load Balancer
                const newLoadBalancer: Partial<AwsLoadBalancer> = {
                    cloudAccountId,
                    vpcId: vpc?.id ?? null,
                    awsLoadBalancerArn: lbData.awsLoadBalancerArn,
                    name: lbData.name,
                    dnsName: lbData.dnsName,
                    type: lbData.type,
                    state: lbData.state,
                    scheme: lbData.scheme,
                    ipAddressType: lbData.ipAddressType,
                    availabilityZones: lbData.availabilityZones,
                    awsSecurityGroupIds: lbData.awsSecurityGroupIds,
                    securityGroupIds,
                    createdTime: lbData.createdTime,
                    tags: lbData.tags,
                    lastSyncedAt: now,
                };
                dbLoadBalancer = this.loadBalancerRepository.create(newLoadBalancer);
            }

            await this.loadBalancerRepository.save(dbLoadBalancer);

            // Sincroniza subnets do Load Balancer
            await this.syncLoadBalancerSubnets(dbLoadBalancer, lbData.availabilityZones);

            // Sincroniza listeners do Load Balancer
            await this.syncLoadBalancerListeners(client, dbLoadBalancer, now);
        }

        return mappedLoadBalancers;
    }

    /**
     * Resolve uma lista de AWS Security Group IDs para UUIDs do banco de dados.
     */
    private async resolveSecurityGroupIds(cloudAccountId: string, awsSgIds: string[] | null): Promise<string[] | null> {
        if (!awsSgIds || awsSgIds.length === 0) return null;

        const ids: string[] = [];
        for (const awsSgId of awsSgIds) {
            const sg = await this.securityGroupRepository.findOne({
                where: { cloudAccountId, awsSecurityGroupId: awsSgId },
            });
            if (!sg) {
                console.warn(`Security Group ${awsSgId} não encontrado no banco. Sincronize os Security Groups primeiro.`);
                continue;
            }
            ids.push(sg.id);
        }

        return ids.length > 0 ? ids : null;
    }

    /**
     * Sincroniza as subnets associadas ao Load Balancer.
     */
    private async syncLoadBalancerSubnets(loadBalancer: AwsLoadBalancer, availabilityZones: any[] | null) {
        if (!availabilityZones || availabilityZones.length === 0) {
            loadBalancer.subnetIds = [];
            return;
        }

        const subnetIds: string[] = [];

        // Busca os IDs das subnets
        for (const az of availabilityZones) {
            if (!az.subnetId) continue;

            // Busca subnet no banco de dados
            const subnet = await this.subnetRepository.findOne({
                where: { awsSubnetId: az.subnetId },
            });

            if (!subnet) {
                console.warn(`Subnet ${az.subnetId} não encontrada no banco. Pulando associação com Load Balancer ${loadBalancer.name}.`);
                continue;
            }

            subnetIds.push(subnet.id);
        }

        loadBalancer.subnetIds = subnetIds;
    }

    /**
     * Sincroniza os listeners do Load Balancer.
     */
    private async syncLoadBalancerListeners(client: any, loadBalancer: AwsLoadBalancer, now: Date) {
        try {
            const { Listeners } = await client.send(
                new DescribeListenersCommand({
                    LoadBalancerArn: loadBalancer.awsLoadBalancerArn,
                })
            );

            if (!Listeners || Listeners.length === 0) {
                return;
            }

            for (const listenerData of Listeners) {
                const mappedListener = mapAwsListener(listenerData);

                // Verifica se listener já existe
                let dbListener = await this.listenerRepository.findOne({
                    where: { awsListenerArn: mappedListener.awsListenerArn },
                });

                if (dbListener) {
                    // Atualiza listener existente
                    dbListener.port = mappedListener.port;
                    dbListener.protocol = mappedListener.protocol;
                    dbListener.sslCertificateArn = mappedListener.sslCertificateArn;
                    dbListener.sslPolicy = mappedListener.sslPolicy;
                    dbListener.defaultTargetGroupArn = mappedListener.defaultTargetGroupArn;
                    dbListener.defaultActions = mappedListener.defaultActions;
                    dbListener.lastSyncedAt = now;
                } else {
                    // Cria novo listener
                    dbListener = this.listenerRepository.create({
                        loadBalancerId: loadBalancer.id,
                        awsListenerArn: mappedListener.awsListenerArn,
                        port: mappedListener.port,
                        protocol: mappedListener.protocol,
                        sslCertificateArn: mappedListener.sslCertificateArn,
                        sslPolicy: mappedListener.sslPolicy,
                        defaultTargetGroupArn: mappedListener.defaultTargetGroupArn,
                        defaultActions: mappedListener.defaultActions,
                        lastSyncedAt: now,
                    });
                }

                await this.listenerRepository.save(dbListener);
            }
        } catch (error) {
            console.error(`Erro ao sincronizar listeners do Load Balancer ${loadBalancer.name}:`, error);
        }
    }
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapAwsLoadBalancer(lb: LoadBalancer) {
    return {
        awsLoadBalancerArn: lb.LoadBalancerArn ?? '',
        name: lb.LoadBalancerName ?? '',
        dnsName: lb.DNSName ?? '',
        awsVpcId: lb.VpcId ?? null,
        type: (lb.Type as LoadBalancerType) ?? LoadBalancerType.APPLICATION,
        state: (lb.State?.Code as LoadBalancerState) ?? LoadBalancerState.ACTIVE,
        scheme: lb.Scheme ?? 'internet-facing',
        ipAddressType: (lb.IpAddressType as IpAddressType) ?? IpAddressType.IPV4,
        availabilityZones:
            lb.AvailabilityZones?.map((az) => ({
                zoneName: az.ZoneName,
                subnetId: az.SubnetId,
                loadBalancerAddresses: az.LoadBalancerAddresses,
            })) ?? null,
        awsSecurityGroupIds: lb.SecurityGroups ?? null,
        createdTime: lb.CreatedTime ?? null,
        tags: null as Record<string, string> | null, // Tags precisam ser buscadas separadamente
    };
}

function mapAwsListener(listener: Listener) {
    // Extrai o Target Group ARN da primeira ação do tipo 'forward'
    const forwardAction = listener.DefaultActions?.find((action) => action.Type === 'forward');
    const targetGroupArn = forwardAction?.TargetGroupArn ?? null;

    // Extrai o certificado SSL (primeiro da lista)
    const sslCertificateArn = listener.Certificates?.[0]?.CertificateArn ?? null;

    return {
        awsListenerArn: listener.ListenerArn ?? '',
        port: listener.Port ?? 80,
        protocol: (listener.Protocol as ListenerProtocol) ?? ListenerProtocol.HTTP,
        sslCertificateArn,
        sslPolicy: listener.SslPolicy ?? null,
        defaultTargetGroupArn: targetGroupArn,
        defaultActions: listener.DefaultActions ?? [],
    };
}

function mapDbLoadBalancer(lb: AwsLoadBalancer) {
    return {
        id: lb.id,
        awsLoadBalancerArn: lb.awsLoadBalancerArn,
        name: lb.name,
        dnsName: lb.dnsName,
        vpcId: lb.vpcId,
        awsVpcId: lb.vpc?.awsVpcId ?? null,
        type: lb.type,
        state: lb.state,
        scheme: lb.scheme,
        ipAddressType: lb.ipAddressType,
        availabilityZones: lb.availabilityZones,
        awsSecurityGroupIds: lb.awsSecurityGroupIds,
        securityGroupIds: lb.securityGroupIds,
        createdTime: lb.createdTime,
        tags: lb.tags ?? {},
        lastSyncedAt: lb.lastSyncedAt,
        createdAt: lb.createdAt,
        updatedAt: lb.updatedAt,
        listeners:
            (lb as any).listeners?.map((listener: any) => ({
                id: listener.id,
                awsListenerArn: listener.awsListenerArn,
                port: listener.port,
                protocol: listener.protocol,
                sslCertificateArn: listener.sslCertificateArn,
                sslPolicy: listener.sslPolicy,
                defaultTargetGroupArn: listener.defaultTargetGroupArn,
                defaultActions: listener.defaultActions,
            })) ?? [],
        subnetIds: lb.subnetIds ?? [],
    };
}
