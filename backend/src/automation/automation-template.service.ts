import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AutomationTemplate, AutomationTemplateOrigin, AutomationTemplateType } from '../db/entites/automation-template.entity';
import { AutomationTemplateVersion } from '../db/entites/automation-template-version.entity';
import { ErrorMessages } from '../common/messages/error-messages';
import { AUTOMATION_ACTION_TYPES } from './constants';
import { templateVisibleToTenant } from './bindings';
import { extractTemplateDocument } from './template-document';
import { ECS_PLATFORM_TEMPLATE_NAME, ECS_SERVICE_TEMPLATE } from './templates/ecs-service.template';
import type { EmbeddedWorkflowTemplate, WorkflowNodeSnapshot } from './workflow/workflow.types';

@Injectable()
export class AutomationTemplateService implements OnModuleInit {
    private readonly logger = new Logger(AutomationTemplateService.name);

    constructor(
        @InjectRepository(AutomationTemplate)
        private readonly templateRepository: Repository<AutomationTemplate>,
        @InjectRepository(AutomationTemplateVersion)
        private readonly versionRepository: Repository<AutomationTemplateVersion>,
    ) {}

    async onModuleInit(): Promise<void> {
        try {
            await this.ensurePlatformTemplate();
            this.logger.log('automation.template.seeded');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown';
            this.logger.error(`automation.template.seed_failed ${message}`);
        }
    }

    async list(tenantId: string) {
        const templates = await this.templateRepository.find({
            where: [{ tenantId }, { tenantId: IsNull() }],
            order: { updatedAt: 'DESC' },
        });
        const visible = templates.filter((template) => templateVisibleToTenant(template, tenantId));
        return Promise.all(visible.map(async (template) => ({ ...template, latestVersion: await this.latestSummary(template.id) })));
    }

    async find(id: string, tenantId: string) {
        const template = await this.templateRepository.findOne({ where: { id } });
        if (!template || !templateVisibleToTenant(template, tenantId)) {
            throw new NotFoundException(ErrorMessages.AUTOMATION.TEMPLATE_NOT_FOUND);
        }
        const versions = await this.versionRepository.find({ where: { templateId: id }, order: { version: 'DESC' } });
        return { ...template, versions: versions.map((version) => this.presentVersion(version)) };
    }

    async import(tenantId: string, userId: string, input: { name: string; description?: string | null; content: string }) {
        const extracted = extractTemplateDocument(input.content);
        const template = await this.templateRepository.save(
            this.templateRepository.create({
                tenantId,
                name: input.name,
                description: input.description ?? null,
                cloudProvider: 'AWS',
                templateType: AutomationTemplateType.CLOUDFORMATION,
                origin: AutomationTemplateOrigin.IMPORT,
                createdBy: userId,
            }),
        );
        const version = await this.saveVersion(template.id, 1, input.content.trim(), extracted, userId);
        return { ...template, versions: [this.presentVersion(version)] };
    }

    async embedForNodes(tenantId: string, nodes: WorkflowNodeSnapshot[]): Promise<Record<string, EmbeddedWorkflowTemplate>> {
        const embedded: Record<string, EmbeddedWorkflowTemplate> = {};
        for (const node of nodes) {
            if (node.type !== AUTOMATION_ACTION_TYPES.AWS_CLOUDFORMATION_STACK) continue;
            const templateId = String(node.config.templateId ?? '');
            const versionNumber = Number(node.config.templateVersion);
            if (!templateId || !versionNumber) {
                throw new BadRequestException(ErrorMessages.AUTOMATION.TEMPLATE_INVALID);
            }
            const key = `${templateId}:${versionNumber}`;
            if (embedded[key]) continue;
            embedded[key] = await this.embedVersion(templateId, versionNumber, tenantId);
        }
        return embedded;
    }

    async embedVersion(templateId: string, versionNumber: number, tenantId: string): Promise<EmbeddedWorkflowTemplate> {
        const template = await this.templateRepository.findOne({ where: { id: templateId } });
        if (!template || !templateVisibleToTenant(template, tenantId)) {
            throw new NotFoundException(ErrorMessages.AUTOMATION.TEMPLATE_NOT_FOUND);
        }
        const version = await this.versionRepository.findOne({ where: { templateId, version: versionNumber } });
        if (!version) throw new NotFoundException(ErrorMessages.AUTOMATION.TEMPLATE_NOT_FOUND);
        return {
            templateId,
            version: version.version,
            contentHash: version.contentHash,
            content: version.content,
            parameters: version.parameters as EmbeddedWorkflowTemplate['parameters'],
            outputs: version.outputs as EmbeddedWorkflowTemplate['outputs'],
            resources: version.resources as EmbeddedWorkflowTemplate['resources'],
            hasTransform: version.hasTransform,
            capabilities: (version.resources as Array<{ type?: string }>).some((resource) => String(resource.type).startsWith('AWS::IAM::'))
                ? ['CAPABILITY_NAMED_IAM', ...(version.hasTransform ? ['CAPABILITY_AUTO_EXPAND'] : [])]
                : version.hasTransform
                  ? ['CAPABILITY_AUTO_EXPAND']
                  : [],
        };
    }

    private async ensurePlatformTemplate(): Promise<void> {
        const extracted = extractTemplateDocument(ECS_SERVICE_TEMPLATE);
        let template = await this.templateRepository.findOne({ where: { tenantId: IsNull(), name: ECS_PLATFORM_TEMPLATE_NAME } });
        if (!template) {
            template = await this.templateRepository.save(
                this.templateRepository.create({
                    tenantId: null,
                    name: ECS_PLATFORM_TEMPLATE_NAME,
                    description: 'Provisions an ECS service and optional cluster, repository, roles and load balancer.',
                    cloudProvider: 'AWS',
                    templateType: AutomationTemplateType.CLOUDFORMATION,
                    origin: AutomationTemplateOrigin.PLATFORM,
                    createdBy: null,
                }),
            );
        }
        const latest = await this.versionRepository.findOne({ where: { templateId: template.id }, order: { version: 'DESC' } });
        if (!latest || latest.contentHash !== extracted.contentHash) {
            await this.saveVersion(template.id, (latest?.version ?? 0) + 1, ECS_SERVICE_TEMPLATE.trim(), extracted, null);
            return;
        }
        if (JSON.stringify(latest.resources) !== JSON.stringify(extracted.resources)) {
            latest.resources = extracted.resources as unknown as Record<string, unknown>[];
            await this.versionRepository.save(latest);
        }
    }

    private async latestSummary(templateId: string) {
        const latest = await this.versionRepository.findOne({ where: { templateId }, order: { version: 'DESC' } });
        if (!latest) return null;
        return { version: latest.version, contentHash: latest.contentHash, parameterCount: latest.parameters.length, outputCount: latest.outputs.length };
    }

    private presentVersion(version: AutomationTemplateVersion) {
        return {
            id: version.id,
            version: version.version,
            contentHash: version.contentHash,
            format: version.format,
            parameters: version.parameters,
            outputs: version.outputs,
            resources: version.resources,
            hasTransform: version.hasTransform,
            content: version.content,
            createdAt: version.createdAt,
        };
    }

    private async saveVersion(
        templateId: string,
        version: number,
        content: string,
        extracted: ReturnType<typeof extractTemplateDocument>,
        userId: string | null,
    ) {
        return this.versionRepository.save(
            this.versionRepository.create({
                templateId,
                version,
                content,
                contentHash: extracted.contentHash,
                format: extracted.format,
                parameters: extracted.parameters as unknown as Record<string, unknown>[],
                outputs: extracted.outputs as unknown as Record<string, unknown>[],
                resources: extracted.resources as unknown as Record<string, unknown>[],
                hasTransform: extracted.hasTransform,
                createdBy: userId,
            }),
        );
    }
}
