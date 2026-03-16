import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { DescribeSecurityGroupsCommand } from '@aws-sdk/client-ec2';

import type { SecurityGroup, IpPermission } from '@aws-sdk/client-ec2';

import { AwsConnectorService } from '../aws-connector.service';

import { AwsSecurityGroup, SecurityGroupRule } from '../../db/entites/aws-security-group.entity';

import { AwsVpc } from '../../db/entites/index';

@Injectable()
export class AwsSecurityGroupService {
    constructor(
        private readonly connector: AwsConnectorService,

        @InjectRepository(AwsSecurityGroup)
        private readonly securityGroupRepository: Repository<AwsSecurityGroup>,

        @InjectRepository(AwsVpc)
        private readonly vpcRepository: Repository<AwsVpc>
    ) {}

    // =========================================================================

    // Listar dados do BANCO DE DADOS (sem consultar AWS)

    // =========================================================================

    /**

     * Lista Security Groups armazenados no banco de dados para uma CloudAccount específica.

     */

    async listSecurityGroupsFromDatabase(cloudAccountId: string) {
        const groups = await this.securityGroupRepository

            .createQueryBuilder('sg')

            .leftJoinAndSelect('sg.vpc', 'vpc')

            .where('sg.cloudAccountId = :cloudAccountId', { cloudAccountId })

            .orderBy('sg.createdAt', 'DESC')

            .getMany();

        return groups.map(mapDbSecurityGroup);
    }

    /**

     * Lista Security Groups de uma VPC específica armazenados no banco de dados.

     */

    async listSecurityGroupsByVpcFromDatabase(vpcId: string, cloudAccountId: string) {
        const groups = await this.securityGroupRepository

            .createQueryBuilder('sg')

            .leftJoinAndSelect('sg.vpc', 'vpc')

            .where('sg.vpcId = :vpcId', { vpcId })

            .andWhere('sg.cloudAccountId = :cloudAccountId', { cloudAccountId })

            .orderBy('sg.createdAt', 'DESC')

            .getMany();

        return groups.map(mapDbSecurityGroup);
    }

    /**

     * Busca um Security Group específico pelo ID do banco de dados.

     */

    async getSecurityGroupById(securityGroupId: string, cloudAccountId: string) {
        const group = await this.securityGroupRepository

            .createQueryBuilder('sg')

            .leftJoinAndSelect('sg.vpc', 'vpc')

            .where('sg.id = :securityGroupId', { securityGroupId })

            .andWhere('sg.cloudAccountId = :cloudAccountId', { cloudAccountId })

            .getOne();

        if (!group) {
            throw new BadRequestException(`Security Group com ID "${securityGroupId}" não encontrado.`);
        }

        return mapDbSecurityGroup(group);
    }

    // =========================================================================

    // Sincronizar AWS → Banco de Dados

    // =========================================================================

    /**

     * Sincroniza Security Groups da AWS para o banco de dados.

     * Pode filtrar por VPC se awsVpcId for fornecido.

     */

    async syncSecurityGroupsFromAws(cloudAccountId: string, organizationId: string, awsVpcId?: string) {
        const ec2 = await this.connector.getEc2Client(cloudAccountId, organizationId);

        const filters = awsVpcId ? { Filters: [{ Name: 'vpc-id', Values: [awsVpcId] }] } : {};

        const { SecurityGroups } = await ec2.send(new DescribeSecurityGroupsCommand(filters)).catch(() => {
            throw new BadRequestException('Falha ao consultar Security Groups na AWS. Verifique as permissões da role (ec2:DescribeSecurityGroups).');
        });

        const mappedGroups = (SecurityGroups ?? []).map(mapAwsSecurityGroup);

        const now = new Date();

        // Passo 1: salva todos os Security Groups sem resolver referências cruzadas

        for (const groupData of mappedGroups) {
            let dbGroup = await this.securityGroupRepository.findOne({
                where: { awsSecurityGroupId: groupData.awsSecurityGroupId },
            });

            // Busca a VPC no banco de dados (se existir)

            let vpc: AwsVpc | null = null;

            if (groupData.awsVpcId) {
                vpc = await this.vpcRepository.findOne({
                    where: { cloudAccountId, awsVpcId: groupData.awsVpcId },
                });

                if (!vpc) {
                    console.warn(`VPC ${groupData.awsVpcId} não encontrada. Security Group ${groupData.name} será salvo sem VPC.`);
                }
            }

            if (dbGroup) {
                dbGroup.vpcId = vpc?.id ?? null;

                dbGroup.awsVpcId = groupData.awsVpcId;

                dbGroup.name = groupData.name;

                dbGroup.description = groupData.description;

                dbGroup.ownerId = groupData.ownerId;

                dbGroup.inboundRules = groupData.inboundRules;

                dbGroup.outboundRules = groupData.outboundRules;

                dbGroup.tags = groupData.tags;

                dbGroup.lastSyncedAt = now;
            } else {
                dbGroup = this.securityGroupRepository.create({
                    cloudAccountId,

                    awsSecurityGroupId: groupData.awsSecurityGroupId,

                    name: groupData.name,

                    description: groupData.description,

                    awsVpcId: groupData.awsVpcId,

                    vpcId: vpc?.id ?? null,

                    ownerId: groupData.ownerId,

                    inboundRules: groupData.inboundRules,

                    outboundRules: groupData.outboundRules,

                    tags: groupData.tags,

                    lastSyncedAt: now,
                });
            }

            await this.securityGroupRepository.save(dbGroup);
        }

        // Passo 2: resolve referências cruzadas entre Security Groups

        // (feito após salvar todos para garantir que SGs referenciados já existam no banco)

        for (const groupData of mappedGroups) {
            const dbGroup = await this.securityGroupRepository.findOne({
                where: { awsSecurityGroupId: groupData.awsSecurityGroupId },
            });

            if (!dbGroup) continue;

            let changed = false;

            const resolveRefs = async (rules: SecurityGroupRule[]): Promise<SecurityGroupRule[]> => {
                const resolved: SecurityGroupRule[] = [];

                for (const rule of rules) {
                    const resolvedRefs = await Promise.all(
                        rule.referencedSecurityGroups.map(async (ref) => {
                            if (ref.securityGroupId) return ref; // já resolvido

                            const refSg = await this.securityGroupRepository.findOne({
                                where: { awsSecurityGroupId: ref.groupId },
                            });

                            if (refSg) {
                                changed = true;

                                return { ...ref, securityGroupId: refSg.id };
                            }

                            return ref;
                        })
                    );

                    resolved.push({ ...rule, referencedSecurityGroups: resolvedRefs });
                }

                return resolved;
            };

            dbGroup.inboundRules = await resolveRefs(dbGroup.inboundRules ?? []);

            dbGroup.outboundRules = await resolveRefs(dbGroup.outboundRules ?? []);

            if (changed) {
                await this.securityGroupRepository.save(dbGroup);
            }
        }

        return mappedGroups;
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

function mapIpPermission(permission: IpPermission): SecurityGroupRule {
    return {
        protocol: permission.IpProtocol ?? '-1',

        fromPort: permission.FromPort ?? null,

        toPort: permission.ToPort ?? null,

        ipv4Ranges: (permission.IpRanges ?? []).map((r) => ({
            cidr: r.CidrIp ?? '',

            description: r.Description,
        })),

        ipv6Ranges: (permission.Ipv6Ranges ?? []).map((r) => ({
            cidr: r.CidrIpv6 ?? '',

            description: r.Description,
        })),

        referencedSecurityGroups: (permission.UserIdGroupPairs ?? []).map((p) => ({
            groupId: p.GroupId ?? '',

            userId: p.UserId ?? '',

            vpcId: p.VpcId,
        })),

        prefixListIds: (permission.PrefixListIds ?? []).map((p) => ({
            prefixListId: p.PrefixListId ?? '',

            description: p.Description,
        })),
    };
}

function mapAwsSecurityGroup(sg: SecurityGroup) {
    return {
        awsSecurityGroupId: sg.GroupId ?? '',

        name: sg.GroupName ?? '',

        description: sg.Description ?? '',

        awsVpcId: sg.VpcId ?? null,

        ownerId: sg.OwnerId ?? '',

        inboundRules: (sg.IpPermissions ?? []).map(mapIpPermission),

        outboundRules: (sg.IpPermissionsEgress ?? []).map(mapIpPermission),

        tags: parseTags(sg.Tags),
    };
}

function mapDbSecurityGroup(sg: AwsSecurityGroup) {
    return {
        id: sg.id,

        awsSecurityGroupId: sg.awsSecurityGroupId,

        name: sg.name,

        description: sg.description,

        awsVpcId: sg.awsVpcId,

        vpcId: sg.vpcId,

        ownerId: sg.ownerId,

        inboundRules: sg.inboundRules ?? [],

        outboundRules: sg.outboundRules ?? [],

        tags: sg.tags ?? {},

        lastSyncedAt: sg.lastSyncedAt,

        createdAt: sg.createdAt,

        updatedAt: sg.updatedAt,
    };
}
