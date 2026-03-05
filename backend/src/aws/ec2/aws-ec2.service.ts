import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import type { Instance } from '@aws-sdk/client-ec2';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsEc2Instance, AwsVpc, AwsSubnet } from '../../db/entites/index';

@Injectable()
export class Ec2Service {
    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsEc2Instance)
        private readonly ec2Repository: Repository<AwsEc2Instance>,
        @InjectRepository(AwsVpc)
        private readonly vpcRepository: Repository<AwsVpc>,
        @InjectRepository(AwsSubnet)
        private readonly subnetRepository: Repository<AwsSubnet>
    ) {}

    // =========================================================================
    // Listar dados do BANCO DE DADOS (sem consultar AWS)
    // =========================================================================

    /**
     * Lista instâncias EC2 armazenadas no banco de dados para uma CloudAccount específica.
     */
    async listInstancesFromDatabase(cloudAccountId: string) {
        const instances = await this.ec2Repository
            .createQueryBuilder('instance')
            .innerJoinAndSelect('instance.vpc', 'vpc')
            .innerJoinAndSelect('instance.subnet', 'subnet')
            .where('vpc.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .orderBy('instance.launchTime', 'DESC')
            .getMany();

        return instances.map(mapDbInstance);
    }

    /**
     * Lista instâncias EC2 de uma VPC específica.
     */
    async listInstancesByVpcFromDatabase(vpcId: string, cloudAccountId: string) {
        const instances = await this.ec2Repository
            .createQueryBuilder('instance')
            .innerJoinAndSelect('instance.vpc', 'vpc')
            .innerJoinAndSelect('instance.subnet', 'subnet')
            .where('vpc.id = :vpcId', { vpcId })
            .andWhere('vpc.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .orderBy('instance.launchTime', 'DESC')
            .getMany();

        return instances.map(mapDbInstance);
    }

    /**
     * Busca uma instância EC2 específica pelo ID.
     */
    async getInstanceById(instanceId: string, cloudAccountId: string) {
        const instance = await this.ec2Repository
            .createQueryBuilder('instance')
            .innerJoinAndSelect('instance.vpc', 'vpc')
            .innerJoinAndSelect('instance.subnet', 'subnet')
            .where('instance.id = :instanceId', { instanceId })
            .andWhere('vpc.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .getOne();

        if (!instance) {
            throw new BadRequestException(`Instância EC2 com ID "${instanceId}" não encontrada.`);
        }

        return mapDbInstance(instance);
    }

    // =========================================================================
    // Sincronizar dados da AWS com o BANCO DE DADOS
    // =========================================================================

    /**
     * Sincroniza instâncias EC2 da AWS e armazena no banco de dados.
     * Atualiza instâncias existentes ou cria novas.
     */
    async syncInstancesFromAws(cloudAccountId: string, organizationId: string, vpcId?: string) {
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

        const { Reservations } = await ec2
            .send(
                new DescribeInstancesCommand(
                    awsVpcId
                        ? {
                              Filters: [{ Name: 'vpc-id', Values: [awsVpcId] }],
                          }
                        : {}
                )
            )
            .catch(() => {
                throw new BadRequestException('Falha ao consultar instâncias EC2 na AWS. Verifique as permissões da role (ec2:DescribeInstances).');
            });

        const instanceList: Instance[] = [];
        for (const reservation of Reservations ?? []) {
            for (const instance of reservation.Instances ?? []) {
                instanceList.push(instance);
            }
        }

        const mappedInstances = instanceList.map(mapAwsInstance);
        const now = new Date();

        for (const instanceData of mappedInstances) {
            // Verifica se instância já existe no banco
            let dbInstance = await this.ec2Repository.findOne({
                where: { awsInstanceId: instanceData.awsInstanceId },
            });

            // Busca a VPC no banco de dados
            const vpc = await this.vpcRepository.findOne({
                where: { cloudAccountId, awsVpcId: instanceData.awsVpcId },
            });

            if (!vpc) {
                console.warn(`VPC ${instanceData.awsVpcId} não encontrada. Pulando instância ${instanceData.awsInstanceId}.`);
                continue;
            }

            // Busca a Subnet no banco de dados
            const subnet = await this.subnetRepository.findOne({
                where: { awsSubnetId: instanceData.awsSubnetId },
            });

            if (!subnet) {
                console.warn(`Subnet ${instanceData.awsSubnetId} não encontrada. Pulando instância ${instanceData.awsInstanceId}.`);
                continue;
            }

            if (dbInstance) {
                // Atualiza instância existente
                dbInstance.vpcId = vpc.id;
                dbInstance.subnetId = subnet.id;
                dbInstance.awsVpcId = vpc.awsVpcId;
                dbInstance.awsSubnetId = subnet.awsSubnetId;
                dbInstance.instanceType = instanceData.instanceType ?? dbInstance.instanceType;
                dbInstance.state = instanceData.state ?? dbInstance.state;
                dbInstance.stateReason = (instanceData.stateReason as string | null) ?? null;
                dbInstance.imageId = instanceData.imageId ?? null;
                dbInstance.privateIpAddress = instanceData.privateIpAddress ?? null;
                dbInstance.publicIpAddress = instanceData.publicIpAddress ?? null;
                dbInstance.elasticIp = instanceData.elasticIp ?? null;
                dbInstance.keyName = instanceData.keyName ?? null;
                dbInstance.securityGroupId = instanceData.securityGroupId ?? null;
                dbInstance.availabilityZone = instanceData.availabilityZone ?? null;
                dbInstance.launchTime = instanceData.launchTime ?? null;
                dbInstance.tags = instanceData.tags;
                dbInstance.lastSyncedAt = now;
            } else {
                // Cria nova instância
                const newInstance: Partial<AwsEc2Instance> = {
                    vpcId: vpc.id,
                    subnetId: subnet.id,
                    awsInstanceId: instanceData.awsInstanceId ?? '',
                    awsVpcId: vpc.awsVpcId,
                    awsSubnetId: subnet.awsSubnetId,
                    instanceType: instanceData.instanceType ?? 'unknown',
                    state: instanceData.state ?? 'unknown',
                    stateReason: (instanceData.stateReason as string | null) ?? null,
                    imageId: instanceData.imageId ?? null,
                    privateIpAddress: instanceData.privateIpAddress ?? null,
                    publicIpAddress: instanceData.publicIpAddress ?? null,
                    elasticIp: instanceData.elasticIp ?? null,
                    keyName: instanceData.keyName ?? null,
                    securityGroupId: instanceData.securityGroupId ?? null,
                    availabilityZone: instanceData.availabilityZone ?? null,
                    launchTime: instanceData.launchTime ?? null,
                    tags: instanceData.tags,
                    lastSyncedAt: now,
                };
                dbInstance = this.ec2Repository.create(newInstance);
            }

            await this.ec2Repository.save(dbInstance);
        }

        return mappedInstances;
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

function mapAwsInstance(instance: Instance) {
    // Extrair IPs de network interfaces
    const primaryNic = instance.NetworkInterfaces?.[0];
    const privateIp = primaryNic?.PrivateIpAddress ?? instance.PrivateIpAddress;
    const publicIp = instance.PublicIpAddress;

    // Elastic IP geralmente está associado na network interface
    const elasticIp = primaryNic?.Association?.PublicIp;

    return {
        awsInstanceId: instance.InstanceId,
        awsVpcId: instance.VpcId,
        awsSubnetId: instance.SubnetId,
        instanceType: instance.InstanceType,
        state: instance.State?.Name,
        stateReason: instance.StateReason?.Message ?? null,
        imageId: instance.ImageId,
        privateIpAddress: privateIp,
        publicIpAddress: publicIp,
        elasticIp: elasticIp,
        keyName: instance.KeyName,
        securityGroupId: instance.SecurityGroups?.[0]?.GroupId,
        availabilityZone: instance.Placement?.AvailabilityZone,
        launchTime: instance.LaunchTime,
        tags: parseTags(instance.Tags),
    };
}

function mapDbInstance(instance: AwsEc2Instance) {
    return {
        id: instance.id,
        vpcId: instance.vpcId,
        subnetId: instance.subnetId,
        awsInstanceId: instance.awsInstanceId,
        awsVpcId: instance.awsVpcId,
        awsSubnetId: instance.awsSubnetId,
        instanceType: instance.instanceType,
        state: instance.state,
        stateReason: instance.stateReason,
        imageId: instance.imageId,
        privateIpAddress: instance.privateIpAddress,
        publicIpAddress: instance.publicIpAddress,
        elasticIp: instance.elasticIp,
        keyName: instance.keyName,
        securityGroupId: instance.securityGroupId,
        availabilityZone: instance.availabilityZone,
        launchTime: instance.launchTime,
        tags: instance.tags ?? {},
        lastSyncedAt: instance.lastSyncedAt,
    };
}
