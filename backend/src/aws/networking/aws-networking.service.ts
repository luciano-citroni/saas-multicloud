import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { DescribeVpcsCommand, DescribeSubnetsCommand } from '@aws-sdk/client-ec2';

import type { Vpc, Subnet } from '@aws-sdk/client-ec2';

import { AwsConnectorService } from '../aws-connector.service';

import { AwsVpc, AwsSubnet } from '../../db/entites/index';

@Injectable()
export class AwsNetworkingService {
    constructor(
        private readonly connector: AwsConnectorService,

        @InjectRepository(AwsVpc)
        private readonly vpcRepository: Repository<AwsVpc>,

        @InjectRepository(AwsSubnet)
        private readonly subnetRepository: Repository<AwsSubnet>
    ) {}

    // =========================================================================

    // Listar dados do BANCO DE DADOS (sem consultar AWS)

    // =========================================================================

    /**


     * Lista VPCs armazenadas no banco de dados para uma CloudAccount específica.


     */

    async listVpcsFromDatabase(cloudAccountId: string) {
        const vpcs = await this.vpcRepository.find({
            where: { cloudAccountId },

            relations: ['subnets'],

            order: { createdAt: 'DESC' },
        });

        return vpcs.map((vpc) => ({
            id: vpc.id,

            awsVpcId: vpc.awsVpcId,

            cidrBlock: vpc.cidrBlock,

            state: vpc.state,

            isDefault: vpc.isDefault,

            tags: vpc.tags ?? {},

            lastSyncedAt: vpc.lastSyncedAt,

            subnetsCount: vpc.subnets?.length ?? 0,
        }));
    }

    /**


     * Busca uma VPC específica pelo ID juntamente com suas subnets.


     */

    async getVpcWithSubnets(vpcId: string, cloudAccountId: string) {
        const vpc = await this.vpcRepository.findOne({
            where: { id: vpcId, cloudAccountId },

            relations: ['subnets'],
        });

        if (!vpc) {
            throw new BadRequestException(`VPC com ID "${vpcId}" não encontrada.`);
        }

        return {
            vpc: {
                id: vpc.id,

                awsVpcId: vpc.awsVpcId,

                cidrBlock: vpc.cidrBlock,

                state: vpc.state,

                isDefault: vpc.isDefault,

                tags: vpc.tags ?? {},

                lastSyncedAt: vpc.lastSyncedAt,
            },

            subnets: (vpc.subnets ?? []).map((subnet) => ({
                id: subnet.id,

                vpcId: subnet.vpcId,

                awsSubnetId: subnet.awsSubnetId,

                awsVpcId: subnet.awsVpcId,

                cidrBlock: subnet.cidrBlock,

                availabilityZone: subnet.availabilityZone,

                availableIpAddressCount: subnet.availableIpAddressCount,

                state: subnet.state,

                isDefaultForAz: subnet.isDefaultForAz,

                mapPublicIpOnLaunch: subnet.mapPublicIpOnLaunch,

                subnetType: subnet.subnetType,

                tags: subnet.tags ?? {},

                lastSyncedAt: subnet.lastSyncedAt,
            })),
        };
    }

    /**


     * Lista Subnets armazenadas no banco de dados para uma CloudAccount específica.


     * Opcionalmente filtra por VPC.


     */

    async listSubnetsFromDatabase(cloudAccountId: string, vpcId?: string) {
        const query = this.subnetRepository

            .createQueryBuilder('subnet')

            .innerJoinAndSelect('subnet.vpc', 'vpc')

            .where('vpc.cloudAccountId = :cloudAccountId', { cloudAccountId });

        if (vpcId) {
            query.andWhere('subnet.vpcId = :vpcId', { vpcId });
        }

        const subnets = await query.orderBy('subnet.createdAt', 'DESC').getMany();

        return subnets.map((subnet) => ({
            id: subnet.id,

            vpcId: subnet.vpcId,

            awsSubnetId: subnet.awsSubnetId,

            awsVpcId: subnet.awsVpcId,

            cidrBlock: subnet.cidrBlock,

            availabilityZone: subnet.availabilityZone,

            availableIpAddressCount: subnet.availableIpAddressCount,

            state: subnet.state,

            isDefaultForAz: subnet.isDefaultForAz,

            mapPublicIpOnLaunch: subnet.mapPublicIpOnLaunch,

            subnetType: subnet.subnetType,

            tags: subnet.tags ?? {},

            lastSyncedAt: subnet.lastSyncedAt,
        }));
    }

    // =========================================================================

    // Sincronizar dados da AWS com o BANCO DE DADOS

    // =========================================================================

    /**


     * Sincroniza VPCs da AWS e armazena no banco de dados.


     * Atualiza VPCs existentes ou cria novas.


     */

    async syncVpcsFromAws(cloudAccountId: string, organizationId: string) {
        const ec2 = await this.connector.getEc2Client(cloudAccountId, organizationId);

        const { Vpcs } = await ec2.send(new DescribeVpcsCommand({})).catch(() => {
            throw new BadRequestException('Falha ao consultar VPCs na AWS. Verifique as permissões da role (ec2:DescribeVpcs).');
        });

        const vpcList = (Vpcs ?? []).map(mapVpc);

        const now = new Date();

        for (const vpcData of vpcList) {
            // Verifica se VPC já existe no banco

            let vpc = await this.vpcRepository.findOne({
                where: { awsVpcId: vpcData.vpcId },
            });

            if (vpc) {
                // Atualiza VPC existente

                vpc.cidrBlock = vpcData.cidrBlock ?? vpc.cidrBlock;

                vpc.state = vpcData.state ?? vpc.state;

                vpc.isDefault = vpcData.isDefault ?? vpc.isDefault;

                vpc.tags = vpcData.tags;

                vpc.lastSyncedAt = now;
            } else {
                // Cria nova VPC

                vpc = this.vpcRepository.create({
                    cloudAccountId,

                    awsVpcId: vpcData.vpcId,

                    cidrBlock: vpcData.cidrBlock,

                    state: vpcData.state,

                    isDefault: vpcData.isDefault,

                    tags: vpcData.tags,

                    lastSyncedAt: now,
                });
            }

            await this.vpcRepository.save(vpc);
        }

        return vpcList;
    }

    /**


     * Sincroniza Subnets da AWS e armazena no banco de dados.


     * Atualiza Subnets existentes ou cria novas.


     */

    async syncSubnetsFromAws(cloudAccountId: string, organizationId: string, vpcId?: string) {
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

        const { Subnets } = await ec2.send(new DescribeSubnetsCommand(awsVpcId ? { Filters: [{ Name: 'vpc-id', Values: [awsVpcId] }] } : {})).catch(() => {
            throw new BadRequestException('Falha ao consultar Subnets na AWS. Verifique as permissões da role (ec2:DescribeSubnets).');
        });

        const subnetList = (Subnets ?? []).map(mapSubnet);

        const now = new Date();

        for (const subnetData of subnetList) {
            // Verifica se Subnet já existe no banco

            let subnet = await this.subnetRepository.findOne({
                where: { awsSubnetId: subnetData.subnetId },
            });

            // Busca a VPC no banco de dados

            const vpc = await this.vpcRepository.findOne({
                where: { cloudAccountId, awsVpcId: subnetData.vpcId },
            });

            if (!vpc) {
                // Se VPC não existe, pula esta subnet

                console.warn(`VPC ${subnetData.vpcId} não encontrada. Pulando subnet ${subnetData.subnetId}.`);

                continue;
            }

            if (subnet) {
                // Atualiza Subnet existente

                subnet.vpcId = vpc.id;

                subnet.awsVpcId = vpc.awsVpcId;

                subnet.cidrBlock = subnetData.cidrBlock ?? subnet.cidrBlock;

                subnet.availabilityZone = subnetData.availabilityZone ?? subnet.availabilityZone;

                subnet.availableIpAddressCount = subnetData.availableIpAddressCount ?? subnet.availableIpAddressCount;

                subnet.state = subnetData.state ?? subnet.state;

                subnet.isDefaultForAz = subnetData.isDefaultForAz ?? subnet.isDefaultForAz;

                subnet.mapPublicIpOnLaunch = subnetData.mapPublicIpOnLaunch ?? subnet.mapPublicIpOnLaunch;

                subnet.tags = subnetData.tags;

                subnet.lastSyncedAt = now;
            } else {
                // Cria nova Subnet

                subnet = this.subnetRepository.create({
                    vpcId: vpc.id,

                    awsSubnetId: subnetData.subnetId ?? '',

                    awsVpcId: vpc.awsVpcId,

                    cidrBlock: subnetData.cidrBlock ?? '',

                    availabilityZone: subnetData.availabilityZone ?? '',

                    availableIpAddressCount: subnetData.availableIpAddressCount ?? 0,

                    state: subnetData.state ?? 'unknown',

                    isDefaultForAz: subnetData.isDefaultForAz ?? false,

                    mapPublicIpOnLaunch: subnetData.mapPublicIpOnLaunch ?? false,

                    tags: subnetData.tags,

                    lastSyncedAt: now,
                });
            }

            await this.subnetRepository.save(subnet);
        }

        return subnetList;
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

function mapVpc(vpc: Vpc) {
    return {
        vpcId: vpc.VpcId,

        cidrBlock: vpc.CidrBlock,

        state: vpc.State,

        isDefault: vpc.IsDefault,

        tags: parseTags(vpc.Tags),
    };
}

function mapSubnet(subnet: Subnet) {
    return {
        subnetId: subnet.SubnetId,

        vpcId: subnet.VpcId,

        cidrBlock: subnet.CidrBlock,

        availabilityZone: subnet.AvailabilityZone,

        availableIpAddressCount: subnet.AvailableIpAddressCount,

        state: subnet.State,

        isDefaultForAz: subnet.DefaultForAz,

        mapPublicIpOnLaunch: subnet.MapPublicIpOnLaunch,

        tags: parseTags(subnet.Tags),
    };
}
