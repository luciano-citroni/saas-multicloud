import { Injectable, BadRequestException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { GetRestApisCommand, GetTagsCommand, type RestApi } from '@aws-sdk/client-api-gateway';

import { AwsConnectorService } from '../aws-connector.service';

import { AwsApiGatewayRestApi, AwsVpc } from '../../db/entites';

@Injectable()
export class AwsApiGatewayService {
    constructor(
        private readonly connector: AwsConnectorService,

        @InjectRepository(AwsApiGatewayRestApi)
        private readonly apiRepository: Repository<AwsApiGatewayRestApi>,

        @InjectRepository(AwsVpc)
        private readonly vpcRepository: Repository<AwsVpc>
    ) {}

    async listApisFromDatabase(cloudAccountId: string) {
        const apis = await this.apiRepository

            .createQueryBuilder('api')

            .leftJoinAndSelect('api.vpc', 'vpc')

            .where('api.cloudAccountId = :cloudAccountId', { cloudAccountId })

            .orderBy('api.name', 'ASC')

            .getMany();

        return apis.map(mapDbApi);
    }

    async getApiById(apiId: string, cloudAccountId: string) {
        const api = await this.apiRepository

            .createQueryBuilder('api')

            .leftJoinAndSelect('api.vpc', 'vpc')

            .where('api.id = :apiId', { apiId })

            .andWhere('api.cloudAccountId = :cloudAccountId', { cloudAccountId })

            .getOne();

        if (!api) {
            throw new BadRequestException(`API Gateway com ID "${apiId}" não encontrada.`);
        }

        return mapDbApi(api);
    }

    async syncApisFromAws(cloudAccountId: string, organizationId: string) {
        const client = await this.connector.getApiGatewayClient(cloudAccountId, organizationId);

        const creds = await this.connector.resolveRoleCredentials(cloudAccountId, organizationId);

        const { items } = await client.send(new GetRestApisCommand({})).catch(() => {
            throw new BadRequestException('Falha ao listar APIs do API Gateway. Verifique as permissões da role (apigateway:GET).');
        });

        if (!items || items.length === 0) {
            return [];
        }

        const now = new Date();

        const mapped: ReturnType<typeof mapAwsApi>[] = [];

        for (const api of items) {
            if (!api.id) continue;

            let tags: Record<string, string> = {};

            try {
                const arn = `arn:aws:apigateway:${creds.region}::/restapis/${api.id}`;

                const { tags: rawTags } = await client.send(new GetTagsCommand({ resourceArn: arn }));

                tags = rawTags ?? {};
            } catch {
                console.warn(`Não foi possível obter tags da API ${api.name}.`);
            }

            const apiData = mapAwsApi(api, tags);

            mapped.push(apiData);

            const isPrivate = api.endpointConfiguration?.types?.includes('PRIVATE') ?? false;

            const vpcEndpointIds = api.endpointConfiguration?.vpcEndpointIds ?? null;

            const awsVpcId: string | null = null;

            const vpc = awsVpcId ? await this.vpcRepository.findOne({ where: { cloudAccountId, awsVpcId } }) : null;

            let dbApi = await this.apiRepository.findOne({ where: { awsApiId: api.id } });

            if (dbApi) {
                dbApi.name = apiData.name;

                dbApi.description = apiData.description;

                dbApi.endpointType = apiData.endpointType;

                dbApi.version = apiData.version;

                dbApi.vpcEndpointIds = vpcEndpointIds;

                dbApi.awsVpcId = awsVpcId;

                dbApi.vpcId = vpc?.id ?? null;

                dbApi.tags = tags;

                dbApi.lastSyncedAt = now;
            } else {
                dbApi = this.apiRepository.create({
                    cloudAccountId,

                    awsApiId: api.id,

                    name: apiData.name,

                    description: apiData.description,

                    endpointType: apiData.endpointType,

                    version: apiData.version,

                    createdAtAws: apiData.createdAtAws,

                    vpcEndpointIds,

                    awsVpcId,

                    vpcId: vpc?.id ?? null,

                    tags,

                    lastSyncedAt: now,
                });
            }

            await this.apiRepository.save(dbApi);
        }

        return mapped;
    }
}

function mapAwsApi(api: RestApi, tags: Record<string, string>) {
    const endpointTypes = api.endpointConfiguration?.types;

    return {
        awsApiId: api.id ?? '',

        name: api.name ?? '',

        description: api.description ?? null,

        endpointType: endpointTypes?.[0] ?? null,

        version: api.version ?? null,

        createdAtAws: api.createdDate ?? null,

        tags,
    };
}

function mapDbApi(api: AwsApiGatewayRestApi) {
    return {
        id: api.id,

        cloudAccountId: api.cloudAccountId,

        awsApiId: api.awsApiId,

        name: api.name,

        description: api.description,

        endpointType: api.endpointType,

        version: api.version,

        invokeUrl: api.invokeUrl,

        awsVpcId: api.awsVpcId,

        vpcId: api.vpcId,

        vpcEndpointIds: api.vpcEndpointIds ?? [],

        createdAtAws: api.createdAtAws,

        tags: api.tags ?? {},

        lastSyncedAt: api.lastSyncedAt,

        createdAt: api.createdAt,

        updatedAt: api.updatedAt,

        vpc: api.vpc ? { id: api.vpc.id, awsVpcId: api.vpc.awsVpcId, cidrBlock: api.vpc.cidrBlock, state: api.vpc.state } : null,
    };
}
