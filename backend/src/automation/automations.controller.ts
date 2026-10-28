import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiHeader,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { TenantGuard } from '../tenant/tenant.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { OrgRole } from '../rbac/roles.enum';
import { CurrentOrganization } from '../tenant/tenant.decorators';
import { CurrentUser } from '../auth/decorators';
import { Tenant } from '../db/entites/tenant.entity';
import type { JwtPayload } from '../auth/auth.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ApiPaginationQuery } from '../common/swagger/pagination-query.swagger';
import { AutomationsCrudService } from './automations-crud.service';
import {
    automationExecutionParamSchema,
    automationIdParamSchema,
    createAutomationSchema,
    executeAutomationSchema,
    updateAutomationSchema,
    type CreateAutomationDto,
    type ExecuteAutomationDto,
    type UpdateAutomationDto,
} from './automations.dto';

@ApiTags('Automations')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',
    description: 'UUID da organização ativa',
    required: true,
})
@UseGuards(TenantGuard, RolesGuard)
@Controller('automations')
export class AutomationsController {
    constructor(private readonly automationsService: AutomationsCrudService) {}

    @Get()
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar automações da organização' })
    @ApiResponse({ status: 200, description: 'Lista de automações' })
    list(@CurrentOrganization() org: Tenant) {
        return this.automationsService.list(org.id);
    }

    @Post()
    @Roles(OrgRole.MEMBER, OrgRole.ADMIN, OrgRole.OWNER)
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Criar automação em rascunho' })
    @ApiBody({ schema: { type: 'object' } })
    @ApiResponse({ status: 201, description: 'Automação criada' })
    create(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: JwtPayload,
        @Body(new ZodValidationPipe(createAutomationSchema)) dto: CreateAutomationDto,
    ) {
        return this.automationsService.create(org.id, user.sub, dto);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obter automação com nodes e edges' })
    @ApiResponse({ status: 200, description: 'Detalhe da automação' })
    @ApiResponse({ status: 404, description: 'Automação não encontrada' })
    findOne(
        @CurrentOrganization() org: Tenant,
        @Param(new ZodValidationPipe(automationIdParamSchema)) params: { id: string },
    ) {
        return this.automationsService.findById(params.id, org.id);
    }

    @Put(':id')
    @Roles(OrgRole.MEMBER, OrgRole.ADMIN, OrgRole.OWNER)
    @ApiOperation({ summary: 'Atualizar automação (somente DRAFT)' })
    @ApiBody({ schema: { type: 'object' } })
    update(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: JwtPayload,
        @Param(new ZodValidationPipe(automationIdParamSchema)) params: { id: string },
        @Body(new ZodValidationPipe(updateAutomationSchema)) dto: UpdateAutomationDto,
    ) {
        return this.automationsService.update(params.id, org.id, user.sub, dto);
    }

    @Delete(':id')
    @Roles(OrgRole.ADMIN, OrgRole.OWNER)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Excluir automação' })
    @ApiResponse({ status: 204, description: 'Automação excluída' })
    async delete(
        @CurrentOrganization() org: Tenant,
        @Param(new ZodValidationPipe(automationIdParamSchema)) params: { id: string },
    ) {
        await this.automationsService.delete(params.id, org.id);
    }

    @Post(':id/publish')
    @Roles(OrgRole.ADMIN, OrgRole.OWNER)
    @ApiOperation({ summary: 'Publicar automação (cria nova versão)' })
    publish(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: JwtPayload,
        @Param(new ZodValidationPipe(automationIdParamSchema)) params: { id: string },
    ) {
        return this.automationsService.publish(params.id, org.id, user.sub);
    }

    @Post(':id/activate')
    @Roles(OrgRole.ADMIN, OrgRole.OWNER)
    @ApiOperation({ summary: 'Ativar automação publicada' })
    activate(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: JwtPayload,
        @Param(new ZodValidationPipe(automationIdParamSchema)) params: { id: string },
    ) {
        return this.automationsService.activate(params.id, org.id, user.sub);
    }

    @Post(':id/deactivate')
    @Roles(OrgRole.ADMIN, OrgRole.OWNER)
    @ApiOperation({ summary: 'Desativar automação' })
    deactivate(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: JwtPayload,
        @Param(new ZodValidationPipe(automationIdParamSchema)) params: { id: string },
    ) {
        return this.automationsService.deactivate(params.id, org.id, user.sub);
    }

    @Post(':id/duplicate')
    @Roles(OrgRole.MEMBER, OrgRole.ADMIN, OrgRole.OWNER)
    @ApiOperation({ summary: 'Duplicar automação' })
    duplicate(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: JwtPayload,
        @Param(new ZodValidationPipe(automationIdParamSchema)) params: { id: string },
    ) {
        return this.automationsService.duplicate(params.id, org.id, user.sub);
    }

    @Post(':id/execute')
    @Roles(OrgRole.ADMIN, OrgRole.OWNER)
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Executar automação publicada e ativa' })
    @ApiResponse({ status: 201, description: 'Execução enfileirada' })
    execute(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: JwtPayload,
        @Param(new ZodValidationPipe(automationIdParamSchema)) params: { id: string },
        @Body(new ZodValidationPipe(executeAutomationSchema)) dto: ExecuteAutomationDto,
    ) {
        return this.automationsService.execute(params.id, org.id, user.sub, dto);
    }

    @Post(':id/validate')
    @ApiOperation({ summary: 'Validar grafo, bindings e templates' })
    validate(
        @CurrentOrganization() org: Tenant,
        @Param(new ZodValidationPipe(automationIdParamSchema)) params: { id: string },
    ) {
        return this.automationsService.validate(params.id, org.id);
    }

    @Post(':id/plan')
    @Roles(OrgRole.ADMIN, OrgRole.OWNER)
    @ApiOperation({ summary: 'Gerar plano e change sets quando os parâmetros já estão resolvidos' })
    plan(
        @CurrentOrganization() org: Tenant,
        @Param(new ZodValidationPipe(automationIdParamSchema)) params: { id: string },
    ) {
        return this.automationsService.plan(params.id, org.id);
    }

    @Post(':id/plan/cancel')
    @Roles(OrgRole.ADMIN, OrgRole.OWNER)
    @ApiOperation({ summary: 'Descartar change set em REVIEW_IN_PROGRESS' })
    cancelPlan(
        @CurrentOrganization() org: Tenant,
        @Param(new ZodValidationPipe(automationIdParamSchema)) params: { id: string },
    ) {
        return this.automationsService.cancelPlan(params.id, org.id);
    }

    @Post(':id/revise')
    @Roles(OrgRole.ADMIN, OrgRole.OWNER)
    @ApiOperation({ summary: 'Reabrir uma versão publicada como rascunho' })
    revise(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: JwtPayload,
        @Param(new ZodValidationPipe(automationIdParamSchema)) params: { id: string },
    ) {
        return this.automationsService.revise(params.id, org.id, user.sub);
    }

    @Get(':id/executions')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar execuções de uma automação' })
    listExecutions(
        @CurrentOrganization() org: Tenant,
        @Param(new ZodValidationPipe(automationIdParamSchema)) params: { id: string },
    ) {
        return this.automationsService.listExecutions(params.id, org.id);
    }

    @Get(':id/executions/:executionId')
    @ApiOperation({ summary: 'Detalhe de execução com nodes' })
    getExecution(
        @CurrentOrganization() org: Tenant,
        @Param(new ZodValidationPipe(automationExecutionParamSchema)) params: { id: string; executionId: string },
    ) {
        return this.automationsService.getExecution(params.id, params.executionId, org.id);
    }

    @Post(':id/executions/:executionId/rollback')
    @Roles(OrgRole.ADMIN, OrgRole.OWNER)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Reverter recursos provisionados de uma execução finalizada com sucesso' })
    @ApiResponse({ status: 200, description: 'Rollback concluído' })
    @ApiResponse({ status: 400, description: 'Execução não elegível ou rollback parcial' })
    rollbackExecution(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: JwtPayload,
        @Param(new ZodValidationPipe(automationExecutionParamSchema)) params: { id: string; executionId: string },
    ) {
        return this.automationsService.rollbackExecution(params.id, params.executionId, org.id, user.sub);
    }
}
