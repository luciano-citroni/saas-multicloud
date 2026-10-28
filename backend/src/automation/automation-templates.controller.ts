import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../tenant/tenant.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { OrgRole } from '../rbac/roles.enum';
import { CurrentOrganization } from '../tenant/tenant.decorators';
import { CurrentUser } from '../auth/decorators';
import { Tenant } from '../db/entites/tenant.entity';
import type { JwtPayload } from '../auth/auth.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { z } from 'zod';
import { AutomationTemplateService } from './automation-template.service';
import { AutomationAccessService } from './automation-access.service';
import { AutomationAuditService } from './automation-audit.service';
import { importTemplateSchema, type ImportTemplateDto } from './automations.dto';

const templateIdSchema = z.object({ id: z.string().uuid() });

@ApiTags('Automation Templates')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa', required: true })
@UseGuards(TenantGuard, RolesGuard)
@Controller('automation/templates')
export class AutomationTemplatesController {
    constructor(
        private readonly templates: AutomationTemplateService,
        private readonly access: AutomationAccessService,
        private readonly audit: AutomationAuditService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Listar templates da plataforma e da organização' })
    @ApiResponse({ status: 200 })
    async list(@CurrentOrganization() org: Tenant) {
        await this.access.assertAutomationModuleEnabled(org.id);
        return this.templates.list(org.id);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obter template e versões imutáveis' })
    async find(
        @CurrentOrganization() org: Tenant,
        @Param(new ZodValidationPipe(templateIdSchema)) params: { id: string },
    ) {
        await this.access.assertAutomationModuleEnabled(org.id);
        return this.templates.find(params.id, org.id);
    }

    @Post()
    @Roles(OrgRole.MEMBER, OrgRole.ADMIN, OrgRole.OWNER)
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Importar template CloudFormation validado' })
    @ApiBody({ schema: { type: 'object' } })
    async importTemplate(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: JwtPayload,
        @Body(new ZodValidationPipe(importTemplateSchema)) dto: ImportTemplateDto,
    ) {
        await this.access.assertAutomationModuleEnabled(org.id);
        const created = await this.templates.import(org.id, user.sub, dto);
        await this.audit.record({
            tenantId: org.id,
            actorId: user.sub,
            action: 'template.imported',
            entityType: 'automation_template',
            entityId: created.id,
            metadata: { name: dto.name },
        });
        return created;
    }
}
