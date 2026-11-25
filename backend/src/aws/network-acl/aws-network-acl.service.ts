import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DescribeNetworkAclsCommand, type NetworkAcl as AwsSdkNetworkAcl } from '@aws-sdk/client-ec2';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsNetworkAcl, AwsVpc, type NetworkAclEntry, type NetworkAclAssociation } from '../../db/entites';

@Injectable()
export class AwsNetworkAclService {
    private readonly logger = new Logger(AwsNetworkAclService.name);

    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsNetworkAcl)
        private readonly networkAclRepository: Repository<AwsNetworkAcl>,
        @InjectRepository(AwsVpc)
        private readonly vpcRepository: Repository<AwsVpc>,
    ) {}

    async listNetworkAclsFromDatabase(cloudAccountId: string) {
        return this.networkAclRepository.find({ where: { cloudAccountId }, order: { awsNetworkAclId: 'ASC' } });
    }

    async getNetworkAclById(networkAclId: string, cloudAccountId: string) {
        const networkAcl = await this.networkAclRepository.findOne({ where: { id: networkAclId, cloudAccountId } });
        if (!networkAcl) {
            throw new BadRequestException(`Network ACL com ID "${networkAclId}" não encontrada.`);
        }
        return networkAcl;
    }

    async syncNetworkAclsFromAws(cloudAccountId: string, organizationId: string) {
        const regions = await this.connector.getConfiguredRegions(cloudAccountId, organizationId);
        const now = new Date();
        const mapped: Record<string, unknown>[] = [];

        for (const region of regions) {
            const ec2 = await this.connector.getEc2Client(cloudAccountId, organizationId, region);

            let networkAcls: AwsSdkNetworkAcl[] = [];
            try {
                const result = await ec2.send(new DescribeNetworkAclsCommand({}));
                networkAcls = result.NetworkAcls ?? [];
            } catch {
                this.logger.debug(`Não foi possível listar Network ACLs na região ${region}.`);
                continue;
            }

            for (const nacl of networkAcls) {
                if (!nacl.NetworkAclId) continue;

                const entries: NetworkAclEntry[] = (nacl.Entries ?? []).map((entry) => ({
                    ruleNumber: entry.RuleNumber ?? 0,
                    protocol: entry.Protocol ?? '-1',
                    ruleAction: entry.RuleAction ?? 'deny',
                    egress: entry.Egress ?? false,
                    cidrBlock: entry.CidrBlock ?? null,
                    ipv6CidrBlock: entry.Ipv6CidrBlock ?? null,
                    portRange: entry.PortRange
                        ? { from: entry.PortRange.From ?? null, to: entry.PortRange.To ?? null }
                        : null,
                    icmpTypeCode: entry.IcmpTypeCode
                        ? { type: entry.IcmpTypeCode.Type ?? null, code: entry.IcmpTypeCode.Code ?? null }
                        : null,
                }));

                const associations: NetworkAclAssociation[] = (nacl.Associations ?? [])
                    .filter((a) => a.SubnetId)
                    .map((a) => ({
                        networkAclAssociationId: a.NetworkAclAssociationId ?? null,
                        subnetId: a.SubnetId!,
                    }));

                const tags =
                    nacl.Tags?.reduce<Record<string, string>>((acc, t) => {
                        if (t.Key) acc[t.Key] = t.Value ?? '';
                        return acc;
                    }, {}) ?? {};

                let vpc: AwsVpc | null = null;
                if (nacl.VpcId) {
                    vpc = await this.vpcRepository.findOne({
                        where: { cloudAccountId, awsVpcId: nacl.VpcId },
                    });
                    if (!vpc) {
                        this.logger.warn(
                            `VPC ${nacl.VpcId} não encontrada. Network ACL ${nacl.NetworkAclId} será salva sem VPC.`,
                        );
                    }
                }

                const naclData = {
                    awsNetworkAclId: nacl.NetworkAclId,
                    awsVpcId: nacl.VpcId ?? null,
                    vpcId: vpc?.id ?? null,
                    region,
                    isDefault: nacl.IsDefault ?? false,
                    entries,
                    associations,
                };

                mapped.push({ ...naclData, name: tags['Name'] ?? nacl.NetworkAclId });

                let dbNacl = await this.networkAclRepository.findOne({
                    where: { awsNetworkAclId: nacl.NetworkAclId },
                });

                if (dbNacl) {
                    Object.assign(dbNacl, naclData, { tags, lastSyncedAt: now });
                } else {
                    dbNacl = this.networkAclRepository.create({
                        cloudAccountId,
                        ...naclData,
                        tags,
                        lastSyncedAt: now,
                    });
                }

                await this.networkAclRepository.save(dbNacl);
            }
        }

        return mapped;
    }
}
