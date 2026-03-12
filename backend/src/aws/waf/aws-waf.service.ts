import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    ListWebACLsCommand,
    GetWebACLCommand,
    ListTagsForResourceCommand,
    type WebACLSummary,
} from '@aws-sdk/client-wafv2';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsWafWebAcl } from '../../db/entites';

const WAF_SCOPES: Array<'REGIONAL' | 'CLOUDFRONT'> = ['REGIONAL', 'CLOUDFRONT'];

@Injectable()
export class AwsWafService {
    private readonly logger = new Logger(AwsWafService.name);

    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsWafWebAcl)
        private readonly webAclRepository: Repository<AwsWafWebAcl>
    ) {}

    async listWebAclsFromDatabase(cloudAccountId: string) {
        return this.webAclRepository.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getWebAclById(webAclId: string, cloudAccountId: string) {
        const webAcl = await this.webAclRepository.findOne({ where: { id: webAclId, cloudAccountId } });
        if (!webAcl) {
            throw new BadRequestException(`Web ACL WAF com ID "${webAclId}" não encontrada.`);
        }
        return webAcl;
    }

    async syncWebAclsFromAws(cloudAccountId: string, organizationId: string) {
        // CLOUDFRONT scope requires us-east-1 — get a dedicated client for it
        const regionalClient = await this.connector.getWafV2Client(cloudAccountId, organizationId);
        const globalClient = await this.connector.getWafV2Client(cloudAccountId, organizationId, 'us-east-1');

        const now = new Date();
        const mapped: Record<string, any>[] = [];

        for (const scope of WAF_SCOPES) {
            const client = scope === 'CLOUDFRONT' ? globalClient : regionalClient;

            let webAcls: WebACLSummary[] = [];
            try {
                const { WebACLs } = await client.send(new ListWebACLsCommand({ Scope: scope }));
                webAcls = WebACLs ?? [];
            } catch {
                this.logger.debug(`Não foi possível listar Web ACLs com scope ${scope}.`);
                continue;
            }

            for (const summary of webAcls) {
                if (!summary.ARN || !summary.Id) continue;

                let capacity: number | null = null;
                let defaultAction: string | null = null;
                let rulesCount: number | null = null;
                try {
                    const { WebACL } = await client.send(new GetWebACLCommand({ Name: summary.Name!, Id: summary.Id, Scope: scope }));
                    capacity = WebACL?.Capacity ?? null;
                    defaultAction = WebACL?.DefaultAction?.Allow ? 'ALLOW' : WebACL?.DefaultAction?.Block ? 'BLOCK' : null;
                    rulesCount = WebACL?.Rules?.length ?? null;
                } catch {
                    this.logger.debug(`Não foi possível descrever Web ACL ${summary.Name}.`);
                }

                let tags: Record<string, string> = {};
                try {
                    const { TagInfoForResource } = await client.send(new ListTagsForResourceCommand({ ResourceARN: summary.ARN }));
                    tags = TagInfoForResource?.TagList?.reduce<Record<string, string>>((acc, t) => {
                        if (t.Key) acc[t.Key] = t.Value ?? '';
                        return acc;
                    }, {}) ?? {};
                } catch {
                    this.logger.debug(`Não foi possível obter tags da Web ACL ${summary.Name}.`);
                }

                const webAclData = {
                    awsWebAclId: summary.Id,
                    webAclArn: summary.ARN,
                    name: summary.Name ?? '',
                    description: summary.Description ?? null,
                    scope,
                    capacity,
                    defaultAction,
                    rulesCount,
                };

                mapped.push(webAclData);

                let dbWebAcl = await this.webAclRepository.findOne({ where: { webAclArn: summary.ARN } });

                if (dbWebAcl) {
                    Object.assign(dbWebAcl, webAclData, { tags, lastSyncedAt: now });
                } else {
                    dbWebAcl = this.webAclRepository.create({ cloudAccountId, ...webAclData, tags, lastSyncedAt: now });
                }

                await this.webAclRepository.save(dbWebAcl);
            }
        }

        return mapped;
    }
}
