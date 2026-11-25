import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    ListWebACLsCommand,
    GetWebACLCommand,
    ListTagsForResourceCommand,
    ListResourcesForWebACLCommand,
    ListIPSetsCommand,
    GetIPSetCommand,
    ResourceType,
    type WebACLSummary,
    type IPSetSummary,
    type Rule,
    type Statement,
} from '@aws-sdk/client-wafv2';
import { AwsConnectorService } from '../aws-connector.service';
import { AwsWafWebAcl, AwsWafIpSet, type WafWebAclRuleSummary } from '../../db/entites';

const WAF_SCOPES: Array<'REGIONAL' | 'CLOUDFRONT'> = ['REGIONAL', 'CLOUDFRONT'];

const REGIONAL_RESOURCE_TYPES: ResourceType[] = [
    ResourceType.APPLICATION_LOAD_BALANCER,
    ResourceType.API_GATEWAY,
    ResourceType.APPSYNC,
    ResourceType.COGNITIO_USER_POOL,
    ResourceType.APP_RUNNER_SERVICE,
    ResourceType.VERIFIED_ACCESS_INSTANCE,
    ResourceType.AMPLIFY,
];

@Injectable()
export class AwsWafService {
    private readonly logger = new Logger(AwsWafService.name);

    constructor(
        private readonly connector: AwsConnectorService,
        @InjectRepository(AwsWafWebAcl)
        private readonly webAclRepository: Repository<AwsWafWebAcl>,
        @InjectRepository(AwsWafIpSet)
        private readonly ipSetRepository: Repository<AwsWafIpSet>,
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

    async listIpSetsFromDatabase(cloudAccountId: string) {
        return this.ipSetRepository.find({ where: { cloudAccountId }, order: { name: 'ASC' } });
    }

    async getIpSetById(ipSetId: string, cloudAccountId: string) {
        const ipSet = await this.ipSetRepository.findOne({ where: { id: ipSetId, cloudAccountId } });
        if (!ipSet) {
            throw new BadRequestException(`IP Set WAF com ID "${ipSetId}" não encontrado.`);
        }
        return ipSet;
    }

    async syncWebAclsFromAws(cloudAccountId: string, organizationId: string) {
        const regions = await this.connector.getConfiguredRegions(cloudAccountId, organizationId);
        const globalClient = await this.connector.getWafV2Client(cloudAccountId, organizationId, 'us-east-1');
        const now = new Date();
        const mapped: Record<string, unknown>[] = [];

        for (const scope of WAF_SCOPES) {
            const regionsForScope = scope === 'CLOUDFRONT' ? ['us-east-1'] : regions;

            for (const region of regionsForScope) {
                const client =
                    scope === 'CLOUDFRONT' ? globalClient : await this.connector.getWafV2Client(cloudAccountId, organizationId, region);

                let webAcls: WebACLSummary[] = [];
                try {
                    const { WebACLs } = await client.send(new ListWebACLsCommand({ Scope: scope }));
                    webAcls = WebACLs ?? [];
                } catch {
                    this.logger.debug(`Não foi possível listar Web ACLs com scope ${scope} na região ${region}.`);
                    continue;
                }

                for (const summary of webAcls) {
                    if (!summary.ARN || !summary.Id) continue;

                    let capacity: number | null = null;
                    let defaultAction: string | null = null;
                    let rulesCount: number | null = null;
                    let rules: WafWebAclRuleSummary[] | null = null;

                    try {
                        const { WebACL } = await client.send(
                            new GetWebACLCommand({ Name: summary.Name!, Id: summary.Id, Scope: scope }),
                        );
                        capacity = WebACL?.Capacity ?? null;
                        defaultAction = WebACL?.DefaultAction?.Allow
                            ? 'ALLOW'
                            : WebACL?.DefaultAction?.Block
                              ? 'BLOCK'
                              : null;
                        rulesCount = WebACL?.Rules?.length ?? null;
                        rules = (WebACL?.Rules ?? []).map((rule) => this.mapRuleSummary(rule));
                    } catch {
                        this.logger.debug(`Não foi possível descrever Web ACL ${summary.Name}.`);
                    }

                    let tags: Record<string, string> = {};
                    try {
                        const { TagInfoForResource } = await client.send(
                            new ListTagsForResourceCommand({ ResourceARN: summary.ARN }),
                        );
                        tags =
                            TagInfoForResource?.TagList?.reduce<Record<string, string>>((acc, t) => {
                                if (t.Key) acc[t.Key] = t.Value ?? '';
                                return acc;
                            }, {}) ?? {};
                    } catch {
                        this.logger.debug(`Não foi possível obter tags da Web ACL ${summary.Name}.`);
                    }

                    let associatedResources: string[] | null = null;
                    if (scope === 'REGIONAL') {
                        associatedResources = await this.listAssociatedResources(client, summary.ARN);
                    }

                    const webAclData = {
                        awsWebAclId: summary.Id,
                        webAclArn: summary.ARN,
                        name: summary.Name ?? '',
                        description: summary.Description ?? null,
                        scope,
                        region,
                        capacity,
                        defaultAction,
                        rulesCount,
                        rules,
                        associatedResources,
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
        }

        return mapped;
    }

    async syncIpSetsFromAws(cloudAccountId: string, organizationId: string) {
        const regions = await this.connector.getConfiguredRegions(cloudAccountId, organizationId);
        const globalClient = await this.connector.getWafV2Client(cloudAccountId, organizationId, 'us-east-1');
        const now = new Date();
        const mapped: Record<string, unknown>[] = [];

        for (const scope of WAF_SCOPES) {
            const regionsForScope = scope === 'CLOUDFRONT' ? ['us-east-1'] : regions;

            for (const region of regionsForScope) {
                const client =
                    scope === 'CLOUDFRONT' ? globalClient : await this.connector.getWafV2Client(cloudAccountId, organizationId, region);

                let ipSets: IPSetSummary[] = [];
                try {
                    const { IPSets } = await client.send(new ListIPSetsCommand({ Scope: scope }));
                    ipSets = IPSets ?? [];
                } catch {
                    this.logger.debug(`Não foi possível listar IP Sets com scope ${scope} na região ${region}.`);
                    continue;
                }

                for (const summary of ipSets) {
                    if (!summary.ARN || !summary.Id) continue;

                    let description: string | null = summary.Description ?? null;
                    let ipAddressVersion: string | null = null;
                    let addresses: string[] | null = null;

                    try {
                        const { IPSet } = await client.send(
                            new GetIPSetCommand({ Name: summary.Name!, Id: summary.Id, Scope: scope }),
                        );
                        description = IPSet?.Description ?? description;
                        ipAddressVersion = IPSet?.IPAddressVersion ?? null;
                        addresses = IPSet?.Addresses ?? [];
                    } catch {
                        this.logger.debug(`Não foi possível descrever IP Set ${summary.Name}.`);
                    }

                    let tags: Record<string, string> = {};
                    try {
                        const { TagInfoForResource } = await client.send(
                            new ListTagsForResourceCommand({ ResourceARN: summary.ARN }),
                        );
                        tags =
                            TagInfoForResource?.TagList?.reduce<Record<string, string>>((acc, t) => {
                                if (t.Key) acc[t.Key] = t.Value ?? '';
                                return acc;
                            }, {}) ?? {};
                    } catch {
                        this.logger.debug(`Não foi possível obter tags do IP Set ${summary.Name}.`);
                    }

                    const ipSetData = {
                        awsIpSetId: summary.Id,
                        ipSetArn: summary.ARN,
                        name: summary.Name ?? '',
                        description,
                        scope,
                        region,
                        ipAddressVersion,
                        addresses,
                    };

                    mapped.push(ipSetData);

                    let dbIpSet = await this.ipSetRepository.findOne({ where: { ipSetArn: summary.ARN } });
                    if (dbIpSet) {
                        Object.assign(dbIpSet, ipSetData, { tags, lastSyncedAt: now });
                    } else {
                        dbIpSet = this.ipSetRepository.create({ cloudAccountId, ...ipSetData, tags, lastSyncedAt: now });
                    }
                    await this.ipSetRepository.save(dbIpSet);
                }
            }
        }

        return mapped;
    }

    private async listAssociatedResources(
        client: Awaited<ReturnType<AwsConnectorService['getWafV2Client']>>,
        webAclArn: string,
    ): Promise<string[]> {
        const arns = new Set<string>();

        for (const resourceType of REGIONAL_RESOURCE_TYPES) {
            try {
                const { ResourceArns } = await client.send(
                    new ListResourcesForWebACLCommand({ WebACLArn: webAclArn, ResourceType: resourceType }),
                );
                for (const arn of ResourceArns ?? []) {
                    if (arn) arns.add(arn);
                }
            } catch {
                this.logger.debug(`Não foi possível listar recursos ${resourceType} associados à Web ACL ${webAclArn}.`);
            }
        }

        return [...arns];
    }

    private mapRuleSummary(rule: Rule): WafWebAclRuleSummary {
        return {
            name: rule.Name ?? '',
            priority: rule.Priority ?? 0,
            action: this.resolveRuleAction(rule),
            statementType: this.resolveStatementType(rule.Statement),
            statementSummary: this.summarizeStatement(rule.Statement),
        };
    }

    private resolveRuleAction(rule: Rule): string | null {
        if (rule.Action?.Allow) return 'ALLOW';
        if (rule.Action?.Block) return 'BLOCK';
        if (rule.Action?.Count) return 'COUNT';
        if (rule.Action?.Captcha) return 'CAPTCHA';
        if (rule.Action?.Challenge) return 'CHALLENGE';
        if (rule.OverrideAction?.Count) return 'OVERRIDE_COUNT';
        if (rule.OverrideAction?.None) return 'OVERRIDE_NONE';
        return null;
    }

    private resolveStatementType(statement?: Statement): string | null {
        if (!statement) return null;
        const key = Object.keys(statement).find((k) => (statement as Record<string, unknown>)[k] != null);
        return key ?? null;
    }

    private summarizeStatement(statement?: Statement): Record<string, unknown> | null {
        if (!statement) return null;

        if (statement.IPSetReferenceStatement) {
            return { arn: statement.IPSetReferenceStatement.ARN ?? null };
        }
        if (statement.ManagedRuleGroupStatement) {
            return {
                vendorName: statement.ManagedRuleGroupStatement.VendorName ?? null,
                name: statement.ManagedRuleGroupStatement.Name ?? null,
            };
        }
        if (statement.RuleGroupReferenceStatement) {
            return { arn: statement.RuleGroupReferenceStatement.ARN ?? null };
        }
        if (statement.ByteMatchStatement) {
            const searchString = statement.ByteMatchStatement.SearchString
                ? Buffer.from(statement.ByteMatchStatement.SearchString).toString('utf8').slice(0, 128)
                : null;
            return {
                searchString,
                positionalConstraint: statement.ByteMatchStatement.PositionalConstraint ?? null,
                fieldToMatch: Object.keys(statement.ByteMatchStatement.FieldToMatch ?? {})[0] ?? null,
            };
        }
        if (statement.GeoMatchStatement) {
            return { countryCodes: statement.GeoMatchStatement.CountryCodes ?? [] };
        }
        if (statement.RateBasedStatement) {
            return {
                limit: statement.RateBasedStatement.Limit ?? null,
                aggregateKeyType: statement.RateBasedStatement.AggregateKeyType ?? null,
                nestedStatementType: this.resolveStatementType(statement.RateBasedStatement.ScopeDownStatement),
            };
        }
        if (statement.AndStatement) {
            return {
                statements: (statement.AndStatement.Statements ?? []).map((s) => this.resolveStatementType(s)),
            };
        }
        if (statement.OrStatement) {
            return {
                statements: (statement.OrStatement.Statements ?? []).map((s) => this.resolveStatementType(s)),
            };
        }
        if (statement.NotStatement) {
            return { nestedStatementType: this.resolveStatementType(statement.NotStatement.Statement) };
        }
        if (statement.RegexPatternSetReferenceStatement) {
            return { arn: statement.RegexPatternSetReferenceStatement.ARN ?? null };
        }
        if (statement.SizeConstraintStatement) {
            return {
                comparisonOperator: statement.SizeConstraintStatement.ComparisonOperator ?? null,
                size: statement.SizeConstraintStatement.Size ?? null,
            };
        }
        if (statement.SqliMatchStatement || statement.XssMatchStatement) {
            return { fieldToMatch: Object.keys((statement.SqliMatchStatement ?? statement.XssMatchStatement)?.FieldToMatch ?? {})[0] ?? null };
        }

        const type = this.resolveStatementType(statement);
        return type ? { type } : null;
    }
}
