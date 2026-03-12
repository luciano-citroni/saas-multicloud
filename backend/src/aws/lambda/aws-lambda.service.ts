import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
    ListFunctionsCommand,
    GetFunctionCommand,
    ListTagsCommand,
    type FunctionConfiguration,
} from '@aws-sdk/client-lambda';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsLambdaFunction, AwsVpc, AwsSubnet, AwsSecurityGroup, AwsIamRole } from '../../db/entites';

@Injectable()
export class AwsLambdaService {
    private readonly logger = new Logger(AwsLambdaService.name);

    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsLambdaFunction)
        private readonly lambdaRepository: Repository<AwsLambdaFunction>,
        @InjectRepository(AwsVpc)
        private readonly vpcRepository: Repository<AwsVpc>,
        @InjectRepository(AwsSubnet)
        private readonly subnetRepository: Repository<AwsSubnet>,
        @InjectRepository(AwsSecurityGroup)
        private readonly securityGroupRepository: Repository<AwsSecurityGroup>,
        @InjectRepository(AwsIamRole)
        private readonly iamRoleRepository: Repository<AwsIamRole>
    ) {}

    async listFunctionsFromDatabase(cloudAccountId: string) {
        const functions = await this.lambdaRepository
            .createQueryBuilder('fn')
            .leftJoinAndSelect('fn.vpc', 'vpc')
            .leftJoinAndSelect('fn.iamRole', 'iamRole')
            .where('fn.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .orderBy('fn.functionName', 'ASC')
            .getMany();

        return functions.map(mapDbFunction);
    }

    async getFunctionById(functionId: string, cloudAccountId: string) {
        const fn = await this.lambdaRepository
            .createQueryBuilder('fn')
            .leftJoinAndSelect('fn.vpc', 'vpc')
            .leftJoinAndSelect('fn.iamRole', 'iamRole')
            .where('fn.id = :functionId', { functionId })
            .andWhere('fn.cloudAccountId = :cloudAccountId', { cloudAccountId })
            .getOne();

        if (!fn) {
            throw new BadRequestException(`Função Lambda com ID "${functionId}" não encontrada.`);
        }

        return mapDbFunction(fn);
    }

    async syncFunctionsFromAws(cloudAccountId: string, organizationId: string) {
        const client = await this.connector.getLambdaClient(cloudAccountId, organizationId);

        const { Functions } = await client.send(new ListFunctionsCommand({})).catch(() => {
            throw new BadRequestException('Falha ao listar funções Lambda. Verifique as permissões da role (lambda:ListFunctions).');
        });

        if (!Functions || Functions.length === 0) {
            return [];
        }

        const now = new Date();
        const mapped: ReturnType<typeof mapAwsFunction>[] = [];

        for (const fn of Functions) {
            if (!fn.FunctionArn) continue;

            let tags: Record<string, string> = {};
            try {
                const { Tags } = await client.send(new ListTagsCommand({ Resource: fn.FunctionArn }));
                tags = Tags ?? {};
            } catch {
                this.logger.debug(`Não foi possível obter tags da função ${fn.FunctionName}.`);
            }

            const fnData = mapAwsFunction(fn, tags);
            mapped.push(fnData);

            const vpc = fnData.awsVpcId
                ? await this.vpcRepository.findOne({ where: { cloudAccountId, awsVpcId: fnData.awsVpcId } })
                : null;

            if (fnData.awsVpcId && !vpc) {
                this.logger.debug(`VPC ${fnData.awsVpcId} não encontrada no banco. Sincronize as VPCs primeiro.`);
            }

            const iamRole = fnData.roleArn
                ? await this.iamRoleRepository.findOne({ where: { cloudAccountId, roleArn: fnData.roleArn } })
                : null;

            const subnetIds = fnData.awsSubnetIds?.length
                ? await this.subnetRepository
                      .find({ where: { awsSubnetId: In(fnData.awsSubnetIds) } })
                      .then((subs) => subs.map((s) => s.id))
                : null;

            const securityGroupIds = fnData.awsSecurityGroupIds?.length
                ? await this.securityGroupRepository
                      .find({ where: { cloudAccountId, awsSecurityGroupId: In(fnData.awsSecurityGroupIds) } })
                      .then((sgs) => sgs.map((sg) => sg.id))
                : null;

            let dbFn = await this.lambdaRepository.findOne({ where: { functionArn: fnData.functionArn } });

            if (dbFn) {
                dbFn.functionName = fnData.functionName;
                dbFn.description = fnData.description;
                dbFn.runtime = fnData.runtime;
                dbFn.handler = fnData.handler;
                dbFn.roleArn = fnData.roleArn;
                dbFn.iamRoleId = iamRole?.id ?? null;
                dbFn.codeSize = fnData.codeSize;
                dbFn.memorySize = fnData.memorySize;
                dbFn.timeout = fnData.timeout;
                dbFn.state = fnData.state;
                dbFn.architectures = fnData.architectures;
                dbFn.version = fnData.version;
                dbFn.awsVpcId = fnData.awsVpcId;
                dbFn.vpcId = vpc?.id ?? null;
                dbFn.awsSubnetIds = fnData.awsSubnetIds;
                dbFn.subnetIds = subnetIds;
                dbFn.awsSecurityGroupIds = fnData.awsSecurityGroupIds;
                dbFn.securityGroupIds = securityGroupIds;
                dbFn.environmentVariablesKeys = fnData.environmentVariablesKeys;
                dbFn.lastModifiedAtAws = fnData.lastModifiedAtAws;
                dbFn.tags = tags;
                dbFn.lastSyncedAt = now;
            } else {
                dbFn = this.lambdaRepository.create({
                    cloudAccountId,
                    ...fnData,
                    iamRoleId: iamRole?.id ?? null,
                    vpcId: vpc?.id ?? null,
                    subnetIds,
                    securityGroupIds,
                    tags,
                    lastSyncedAt: now,
                });
            }

            await this.lambdaRepository.save(dbFn);
        }

        return mapped;
    }
}

function mapAwsFunction(fn: FunctionConfiguration, tags: Record<string, string>) {
    return {
        functionArn: fn.FunctionArn ?? '',
        functionName: fn.FunctionName ?? '',
        description: fn.Description ?? null,
        runtime: fn.Runtime ?? null,
        handler: fn.Handler ?? null,
        roleArn: fn.Role ?? null,
        codeSize: fn.CodeSize ?? null,
        memorySize: fn.MemorySize ?? null,
        timeout: fn.Timeout ?? null,
        state: fn.State ?? null,
        architectures: fn.Architectures?.[0] ?? null,
        version: fn.Version ?? null,
        awsVpcId: fn.VpcConfig?.VpcId ?? null,
        awsSubnetIds: fn.VpcConfig?.SubnetIds ?? null,
        awsSecurityGroupIds: fn.VpcConfig?.SecurityGroupIds ?? null,
        environmentVariablesKeys: fn.Environment?.Variables ? Object.keys(fn.Environment.Variables) : null,
        lastModifiedAtAws: fn.LastModified ? new Date(fn.LastModified) : null,
        tags,
    };
}

function mapDbFunction(fn: AwsLambdaFunction) {
    return {
        id: fn.id,
        cloudAccountId: fn.cloudAccountId,
        functionArn: fn.functionArn,
        functionName: fn.functionName,
        description: fn.description,
        runtime: fn.runtime,
        handler: fn.handler,
        roleArn: fn.roleArn,
        iamRoleId: fn.iamRoleId,
        codeSize: fn.codeSize,
        memorySize: fn.memorySize,
        timeout: fn.timeout,
        state: fn.state,
        architectures: fn.architectures,
        version: fn.version,
        awsVpcId: fn.awsVpcId,
        vpcId: fn.vpcId,
        awsSubnetIds: fn.awsSubnetIds ?? [],
        subnetIds: fn.subnetIds ?? [],
        awsSecurityGroupIds: fn.awsSecurityGroupIds ?? [],
        securityGroupIds: fn.securityGroupIds ?? [],
        environmentVariablesKeys: fn.environmentVariablesKeys ?? [],
        lastModifiedAtAws: fn.lastModifiedAtAws,
        tags: fn.tags ?? {},
        lastSyncedAt: fn.lastSyncedAt,
        createdAt: fn.createdAt,
        updatedAt: fn.updatedAt,
        vpc: fn.vpc
            ? { id: fn.vpc.id, awsVpcId: fn.vpc.awsVpcId, cidrBlock: fn.vpc.cidrBlock, state: fn.vpc.state }
            : null,
        iamRole: fn.iamRole
            ? { id: fn.iamRole.id, roleArn: fn.iamRole.roleArn, roleName: fn.iamRole.roleName }
            : null,
    };
}
