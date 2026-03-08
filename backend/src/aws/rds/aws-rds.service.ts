import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DescribeDBInstancesCommand, ListTagsForResourceCommand, type DBInstance } from '@aws-sdk/client-rds';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsRdsInstance, AwsVpc, AwsSubnet, AwsSecurityGroup, AwsIamRole } from '../../db/entites/index';

@Injectable()
export class AwsRdsService {
    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsRdsInstance)
        private readonly rdsRepository: Repository<AwsRdsInstance>,
        @InjectRepository(AwsVpc)
        private readonly vpcRepository: Repository<AwsVpc>,
        @InjectRepository(AwsSubnet)
        private readonly subnetRepository: Repository<AwsSubnet>,
        @InjectRepository(AwsSecurityGroup)
        private readonly securityGroupRepository: Repository<AwsSecurityGroup>,
        @InjectRepository(AwsIamRole)
        private readonly iamRoleRepository: Repository<AwsIamRole>
    ) {}

    async listInstancesFromDatabase(cloudAccountId: string) {
        const instances = await this.rdsRepository
            .createQueryBuilder('instance')
            .leftJoinAndSelect('instance.vpc', 'vpc')
            .leftJoinAndSelect('instance.subnet', 'subnet')
            .leftJoinAndSelect('instance.securityGroup', 'securityGroup')
            .leftJoinAndSelect('instance.iamRole', 'iamRole')
            .where('instance.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .orderBy('instance.awsDbInstanceIdentifier', 'ASC')
            .getMany();

        return instances.map(mapDbInstance);
    }

    async listInstancesByVpcFromDatabase(vpcId: string, cloudAccountId: string) {
        const instances = await this.rdsRepository
            .createQueryBuilder('instance')
            .leftJoinAndSelect('instance.vpc', 'vpc')
            .leftJoinAndSelect('instance.subnet', 'subnet')
            .leftJoinAndSelect('instance.securityGroup', 'securityGroup')
            .leftJoinAndSelect('instance.iamRole', 'iamRole')
            .where('instance.vpcId = :vpcId', { vpcId })
            .andWhere('instance.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .orderBy('instance.awsDbInstanceIdentifier', 'ASC')
            .getMany();

        return instances.map(mapDbInstance);
    }

    async getInstanceById(instanceId: string, cloudAccountId: string) {
        const instance = await this.rdsRepository
            .createQueryBuilder('instance')
            .leftJoinAndSelect('instance.vpc', 'vpc')
            .leftJoinAndSelect('instance.subnet', 'subnet')
            .leftJoinAndSelect('instance.securityGroup', 'securityGroup')
            .leftJoinAndSelect('instance.iamRole', 'iamRole')
            .where('instance.id = :instanceId', { instanceId })
            .andWhere('instance.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .getOne();

        if (!instance) {
            throw new BadRequestException(`Instância RDS com ID "${instanceId}" não encontrada.`);
        }

        return mapDbInstance(instance);
    }

    async syncInstancesFromAws(cloudAccountId: string, organizationId: string, vpcId?: string) {
        const rds = await this.connector.getRdsClient(cloudAccountId, organizationId);

        let awsVpcIdFilter: string | undefined;
        if (vpcId) {
            const dbVpc = await this.vpcRepository.findOne({ where: { id: vpcId, cloudAccountId } });
            if (!dbVpc) {
                throw new BadRequestException('VPC não encontrada no banco de dados.');
            }
            awsVpcIdFilter = dbVpc.awsVpcId;
        }

        const allInstances: DBInstance[] = [];
        let marker: string | undefined = undefined;

        do {
            const response = await rds.send(new DescribeDBInstancesCommand({ Marker: marker })).catch(() => {
                throw new BadRequestException('Falha ao consultar instâncias RDS na AWS. Verifique as permissões da role (rds:DescribeDBInstances).');
            });

            allInstances.push(...(response.DBInstances ?? []));
            marker = response.Marker;
        } while (marker);

        const filteredInstances = awsVpcIdFilter
            ? allInstances.filter((instance) => (instance.DBSubnetGroup?.VpcId ?? null) === awsVpcIdFilter)
            : allInstances;

        const now = new Date();
        const mappedInstances: Array<ReturnType<typeof mapAwsInstance>> = [];

        for (const instance of filteredInstances) {
            const awsMapped = mapAwsInstance(instance);

            if (instance.DBInstanceArn) {
                awsMapped.tags = await this.listTags(rds, instance.DBInstanceArn);
            }

            mappedInstances.push(awsMapped);

            let dbInstance = await this.rdsRepository.findOne({
                where: { awsDbInstanceIdentifier: awsMapped.awsDbInstanceIdentifier },
            });

            const vpc = awsMapped.awsVpcId ? await this.vpcRepository.findOne({ where: { cloudAccountId, awsVpcId: awsMapped.awsVpcId } }) : null;

            if (awsMapped.awsVpcId && !vpc) {
                console.warn(`VPC ${awsMapped.awsVpcId} não encontrada no banco. Sincronize as VPCs primeiro.`);
            }

            const subnet = awsMapped.awsSubnetId
                ? await this.subnetRepository.findOne({
                      where: {
                          awsSubnetId: awsMapped.awsSubnetId,
                      },
                  })
                : null;

            if (awsMapped.awsSubnetId && !subnet) {
                console.warn(`Subnet ${awsMapped.awsSubnetId} não encontrada no banco. Sincronize as Subnets primeiro.`);
            }

            const securityGroup = awsMapped.awsSecurityGroupId
                ? await this.securityGroupRepository.findOne({
                      where: {
                          cloudAccountId,
                          awsSecurityGroupId: awsMapped.awsSecurityGroupId,
                      },
                  })
                : null;

            if (awsMapped.awsSecurityGroupId && !securityGroup) {
                console.warn(`Security Group ${awsMapped.awsSecurityGroupId} não encontrado no banco. Sincronize os Security Groups primeiro.`);
            }

            const iamRole = awsMapped.roleArn
                ? await this.iamRoleRepository.findOne({
                      where: {
                          cloudAccountId,
                          roleArn: awsMapped.roleArn,
                      },
                  })
                : null;

            if (awsMapped.roleArn && !iamRole) {
                console.warn(`IAM Role ${awsMapped.roleArn} não encontrada no banco. Sincronize as IAM Roles primeiro.`);
            }

            if (dbInstance) {
                dbInstance.vpcId = vpc?.id ?? null;
                dbInstance.subnetId = subnet?.id ?? null;
                dbInstance.securityGroupId = securityGroup?.id ?? null;
                dbInstance.iamRoleId = iamRole?.id ?? null;
                dbInstance.dbInstanceArn = awsMapped.dbInstanceArn;
                dbInstance.awsVpcId = awsMapped.awsVpcId;
                dbInstance.awsSubnetId = awsMapped.awsSubnetId;
                dbInstance.awsSecurityGroupId = awsMapped.awsSecurityGroupId;
                dbInstance.roleArn = awsMapped.roleArn;
                dbInstance.dbInstanceClass = awsMapped.dbInstanceClass;
                dbInstance.engine = awsMapped.engine;
                dbInstance.engineVersion = awsMapped.engineVersion;
                dbInstance.status = awsMapped.status;
                dbInstance.endpointAddress = awsMapped.endpointAddress;
                dbInstance.endpointPort = awsMapped.endpointPort;
                dbInstance.availabilityZone = awsMapped.availabilityZone;
                dbInstance.multiAz = awsMapped.multiAz;
                dbInstance.publiclyAccessible = awsMapped.publiclyAccessible;
                dbInstance.storageType = awsMapped.storageType;
                dbInstance.allocatedStorage = awsMapped.allocatedStorage;
                dbInstance.backupRetentionPeriod = awsMapped.backupRetentionPeriod;
                dbInstance.iamDatabaseAuthenticationEnabled = awsMapped.iamDatabaseAuthenticationEnabled;
                dbInstance.deletionProtection = awsMapped.deletionProtection;
                dbInstance.storageEncrypted = awsMapped.storageEncrypted;
                dbInstance.kmsKeyId = awsMapped.kmsKeyId;
                dbInstance.tags = awsMapped.tags;
                dbInstance.lastSyncedAt = now;
            } else {
                dbInstance = this.rdsRepository.create({
                    cloudAccountId,
                    vpcId: vpc?.id ?? null,
                    subnetId: subnet?.id ?? null,
                    securityGroupId: securityGroup?.id ?? null,
                    iamRoleId: iamRole?.id ?? null,
                    awsDbInstanceIdentifier: awsMapped.awsDbInstanceIdentifier,
                    dbInstanceArn: awsMapped.dbInstanceArn,
                    awsVpcId: awsMapped.awsVpcId,
                    awsSubnetId: awsMapped.awsSubnetId,
                    awsSecurityGroupId: awsMapped.awsSecurityGroupId,
                    roleArn: awsMapped.roleArn,
                    dbInstanceClass: awsMapped.dbInstanceClass,
                    engine: awsMapped.engine,
                    engineVersion: awsMapped.engineVersion,
                    status: awsMapped.status,
                    endpointAddress: awsMapped.endpointAddress,
                    endpointPort: awsMapped.endpointPort,
                    availabilityZone: awsMapped.availabilityZone,
                    multiAz: awsMapped.multiAz,
                    publiclyAccessible: awsMapped.publiclyAccessible,
                    storageType: awsMapped.storageType,
                    allocatedStorage: awsMapped.allocatedStorage,
                    backupRetentionPeriod: awsMapped.backupRetentionPeriod,
                    iamDatabaseAuthenticationEnabled: awsMapped.iamDatabaseAuthenticationEnabled,
                    deletionProtection: awsMapped.deletionProtection,
                    storageEncrypted: awsMapped.storageEncrypted,
                    kmsKeyId: awsMapped.kmsKeyId,
                    tags: awsMapped.tags,
                    lastSyncedAt: now,
                });
            }

            await this.rdsRepository.save(dbInstance);
        }

        return mappedInstances;
    }

    private async listTags(rds: Awaited<ReturnType<AwsConnectorService['getRdsClient']>>, dbInstanceArn: string) {
        const { TagList } = await rds.send(new ListTagsForResourceCommand({ ResourceName: dbInstanceArn })).catch(() => ({ TagList: [] }));
        return parseTags(TagList);
    }
}

function parseTags(tags: { Key?: string; Value?: string }[] | undefined): Record<string, string> {
    return (tags ?? []).reduce<Record<string, string>>((acc, { Key, Value }) => {
        if (Key) {
            acc[Key] = Value ?? '';
        }
        return acc;
    }, {});
}

function mapAwsInstance(instance: DBInstance) {
    const awsSubnetId = extractSubnetId(instance);
    const roleArn = instance.AssociatedRoles?.[0]?.RoleArn ?? instance.MonitoringRoleArn ?? null;

    return {
        awsDbInstanceIdentifier: instance.DBInstanceIdentifier ?? '',
        dbInstanceArn: instance.DBInstanceArn ?? null,
        awsVpcId: instance.DBSubnetGroup?.VpcId ?? null,
        awsSubnetId,
        awsSecurityGroupId: instance.VpcSecurityGroups?.[0]?.VpcSecurityGroupId ?? null,
        roleArn,
        dbInstanceClass: instance.DBInstanceClass ?? 'unknown',
        engine: instance.Engine ?? 'unknown',
        engineVersion: instance.EngineVersion ?? null,
        status: instance.DBInstanceStatus ?? 'unknown',
        endpointAddress: instance.Endpoint?.Address ?? null,
        endpointPort: instance.Endpoint?.Port ?? null,
        availabilityZone: instance.AvailabilityZone ?? null,
        multiAz: instance.MultiAZ ?? false,
        publiclyAccessible: instance.PubliclyAccessible ?? false,
        storageType: instance.StorageType ?? null,
        allocatedStorage: instance.AllocatedStorage ?? null,
        backupRetentionPeriod: instance.BackupRetentionPeriod ?? null,
        iamDatabaseAuthenticationEnabled: instance.IAMDatabaseAuthenticationEnabled ?? false,
        deletionProtection: instance.DeletionProtection ?? false,
        storageEncrypted: instance.StorageEncrypted ?? false,
        kmsKeyId: instance.KmsKeyId ?? null,
        tags: {} as Record<string, string>,
    };
}

function extractSubnetId(instance: DBInstance): string | null {
    const subnets = instance.DBSubnetGroup?.Subnets ?? [];
    if (subnets.length === 0) return null;

    const sameAz = subnets.find((subnet) => subnet.SubnetAvailabilityZone?.Name === instance.AvailabilityZone);
    return sameAz?.SubnetIdentifier ?? subnets[0]?.SubnetIdentifier ?? null;
}

function mapDbInstance(instance: AwsRdsInstance) {
    return {
        id: instance.id,
        awsDbInstanceIdentifier: instance.awsDbInstanceIdentifier,
        dbInstanceArn: instance.dbInstanceArn,
        vpcId: instance.vpcId,
        subnetId: instance.subnetId,
        securityGroupId: instance.securityGroupId,
        iamRoleId: instance.iamRoleId,
        awsVpcId: instance.awsVpcId,
        awsSubnetId: instance.awsSubnetId,
        awsSecurityGroupId: instance.awsSecurityGroupId,
        roleArn: instance.roleArn,
        dbInstanceClass: instance.dbInstanceClass,
        engine: instance.engine,
        engineVersion: instance.engineVersion,
        status: instance.status,
        endpointAddress: instance.endpointAddress,
        endpointPort: instance.endpointPort,
        availabilityZone: instance.availabilityZone,
        multiAz: instance.multiAz,
        publiclyAccessible: instance.publiclyAccessible,
        storageType: instance.storageType,
        allocatedStorage: instance.allocatedStorage,
        backupRetentionPeriod: instance.backupRetentionPeriod,
        iamDatabaseAuthenticationEnabled: instance.iamDatabaseAuthenticationEnabled,
        deletionProtection: instance.deletionProtection,
        storageEncrypted: instance.storageEncrypted,
        kmsKeyId: instance.kmsKeyId,
        tags: instance.tags,
        lastSyncedAt: instance.lastSyncedAt,
        createdAt: instance.createdAt,
        updatedAt: instance.updatedAt,
    };
}
