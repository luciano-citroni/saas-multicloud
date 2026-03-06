import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DescribeRouteTablesCommand } from '@aws-sdk/client-ec2';
import type { RouteTable } from '@aws-sdk/client-ec2';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsRouteTable, AwsVpc, AwsSubnet } from '../../db/entites/index';

@Injectable()
export class AwsRouteTablesService {
    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsRouteTable)
        private readonly routeTableRepository: Repository<AwsRouteTable>,
        @InjectRepository(AwsVpc)
        private readonly vpcRepository: Repository<AwsVpc>,
        @InjectRepository(AwsSubnet)
        private readonly subnetRepository: Repository<AwsSubnet>
    ) {}

    // =========================================================================
    // Listar dados do BANCO DE DADOS (sem consultar AWS)
    // =========================================================================

    /**
     * Lista Route Tables armazenadas no banco de dados para uma CloudAccount específica.
     */
    async listRouteTablesFromDatabase(cloudAccountId: string, vpcId?: string) {
        const query = this.routeTableRepository
            .createQueryBuilder('rt')
            .innerJoinAndSelect('rt.vpc', 'vpc')
            .where('vpc.cloudAccountId = :cloudAccountId', { cloudAccountId });

        if (vpcId) {
            query.andWhere('rt.vpcId = :vpcId', { vpcId });
        }

        const routeTables = await query.orderBy('rt.createdAt', 'DESC').getMany();

        return routeTables.map((rt) => ({
            id: rt.id,
            vpcId: rt.vpcId,
            awsRouteTableId: rt.awsRouteTableId,
            awsVpcId: rt.awsVpcId,
            isMain: rt.isMain,
            routes: rt.routes ?? [],
            associations: rt.associations ?? [],
            tags: rt.tags ?? {},
            lastSyncedAt: rt.lastSyncedAt,
        }));
    }

    /**
     * Busca uma Route Table específica pelo ID.
     */
    async getRouteTableById(routeTableId: string, cloudAccountId: string) {
        const routeTable = await this.routeTableRepository.findOne({
            where: { id: routeTableId },
            relations: ['vpc'],
        });

        if (!routeTable || routeTable.vpc.cloudAccountId !== cloudAccountId) {
            throw new BadRequestException(`Route Table com ID "${routeTableId}" não encontrada.`);
        }

        return {
            id: routeTable.id,
            vpcId: routeTable.vpcId,
            awsRouteTableId: routeTable.awsRouteTableId,
            awsVpcId: routeTable.awsVpcId,
            isMain: routeTable.isMain,
            routes: routeTable.routes ?? [],
            associations: routeTable.associations ?? [],
            tags: routeTable.tags ?? {},
            lastSyncedAt: routeTable.lastSyncedAt,
        };
    }

    // =========================================================================
    // Sincronizar dados da AWS com o BANCO DE DADOS
    // =========================================================================

    /**
     * Sincroniza Route Tables da AWS e armazena no banco de dados.
     * Atualiza Route Tables existentes ou cria novas.
     * Também atualiza o tipo das subnets com base nas rotas.
     */
    async syncRouteTablesFromAws(cloudAccountId: string, organizationId: string, vpcId?: string) {
        const ec2 = await this.connector.getEc2Client(cloudAccountId, organizationId);

        // Se vpcId é do banco de dados, busca o AWS VPC ID
        let awsVpcId: string | undefined;
        if (vpcId) {
            const dbVpc = await this.vpcRepository.findOne({ where: { id: vpcId } });
            if (!dbVpc) {
                throw new BadRequestException('VPC não encontrada no banco de dados.');
            }
            awsVpcId = dbVpc.awsVpcId;
        }

        const { RouteTables } = await ec2
            .send(
                new DescribeRouteTablesCommand(
                    awsVpcId
                        ? {
                              Filters: [{ Name: 'vpc-id', Values: [awsVpcId] }],
                          }
                        : {}
                )
            )
            .catch(() => {
                throw new BadRequestException('Falha ao consultar Route Tables na AWS. Verifique as permissões da role (ec2:DescribeRouteTables).');
            });

        const routeTableList = (RouteTables ?? []).map(mapRouteTable);
        const now = new Date();

        for (const rtData of routeTableList) {
            // Verifica se Route Table já existe no banco
            let routeTable = await this.routeTableRepository.findOne({
                where: { awsRouteTableId: rtData.routeTableId },
            });

            // Busca a VPC no banco de dados
            const vpc = await this.vpcRepository.findOne({
                where: { cloudAccountId, awsVpcId: rtData.vpcId },
            });

            if (!vpc) {
                console.warn(`VPC ${rtData.vpcId} não encontrada. Pulando route table ${rtData.routeTableId}.`);
                continue;
            }

            if (routeTable) {
                // Atualiza Route Table existente
                routeTable.vpcId = vpc.id;
                routeTable.awsVpcId = vpc.awsVpcId;
                routeTable.isMain = rtData.isMain ?? routeTable.isMain;
                routeTable.routes = rtData.routes;
                routeTable.associations = rtData.associations;
                routeTable.tags = rtData.tags;
                routeTable.lastSyncedAt = now;
            } else {
                // Cria nova Route Table
                routeTable = this.routeTableRepository.create({
                    vpcId: vpc.id,
                    awsRouteTableId: rtData.routeTableId ?? '',
                    awsVpcId: vpc.awsVpcId,
                    isMain: rtData.isMain ?? false,
                    routes: rtData.routes,
                    associations: rtData.associations,
                    tags: rtData.tags,
                    lastSyncedAt: now,
                });
            }

            await this.routeTableRepository.save(routeTable);

            // Atualiza o tipo das subnets associadas a esta route table
            await this.updateSubnetTypes(routeTable);
        }

        return routeTableList;
    }

    /**
     * Atualiza o tipo das subnets baseado nas rotas da route table associada.
     */
    private async updateSubnetTypes(routeTable: AwsRouteTable) {
        const associations = routeTable.associations ?? [];
        const routes = routeTable.routes ?? [];

        // Determina o tipo baseado nas rotas
        const subnetType = this.determineSubnetType(routes);

        // Atualiza todas as subnets associadas
        for (const assoc of associations) {
            if (assoc.subnetId && !assoc.isMain) {
                const subnet = await this.subnetRepository.findOne({
                    where: { awsSubnetId: assoc.subnetId },
                });

                if (subnet) {
                    subnet.subnetType = subnetType;
                    await this.subnetRepository.save(subnet);
                }
            }
        }
    }

    /**
     * Determina o tipo de subnet baseado nas rotas.
     */
    private determineSubnetType(routes: any[]): 'public' | 'private_with_nat' | 'private_isolated' {
        const hasInternetGateway = routes.some((route) => route.targetType === 'gateway' && route.target?.startsWith('igw-'));

        const hasNatGateway = routes.some((route) => route.targetType === 'nat-gateway' && route.target?.startsWith('nat-'));

        if (hasInternetGateway) {
            return 'public';
        }

        if (hasNatGateway) {
            return 'private_with_nat';
        }

        return 'private_isolated';
    }
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function parseTags(tags: { Key?: string; Value?: string }[] | undefined): Record<string, string> {
    return (tags ?? []).reduce<Record<string, string>>((acc, { Key, Value }) => {
        if (Key) acc[Key] = Value ?? '';
        return acc;
    }, {});
}

function mapRouteTable(rt: RouteTable) {
    const isMain = rt.Associations?.some((assoc) => assoc.Main) ?? false;

    const routes =
        rt.Routes?.map((route) => {
            let targetType = 'local';
            let target = 'local';

            if (route.GatewayId && route.GatewayId !== 'local') {
                targetType = 'gateway';
                target = route.GatewayId;
            } else if (route.NatGatewayId) {
                targetType = 'nat-gateway';
                target = route.NatGatewayId;
            } else if (route.InstanceId) {
                targetType = 'instance';
                target = route.InstanceId;
            } else if (route.VpcPeeringConnectionId) {
                targetType = 'vpc-peering';
                target = route.VpcPeeringConnectionId;
            } else if (route.TransitGatewayId) {
                targetType = 'transit-gateway';
                target = route.TransitGatewayId;
            } else if (route.NetworkInterfaceId) {
                targetType = 'network-interface';
                target = route.NetworkInterfaceId;
            }

            return {
                destinationCidr: route.DestinationCidrBlock ?? route.DestinationIpv6CidrBlock ?? '',
                target,
                targetType,
                state: route.State ?? 'unknown',
            };
        }) ?? [];

    const associations =
        rt.Associations?.map((assoc) => ({
            subnetId: assoc.SubnetId ?? '',
            associationId: assoc.RouteTableAssociationId ?? '',
            isMain: assoc.Main ?? false,
        })) ?? [];

    return {
        routeTableId: rt.RouteTableId,
        vpcId: rt.VpcId,
        isMain,
        routes,
        associations,
        tags: parseTags(rt.Tags),
    };
}
