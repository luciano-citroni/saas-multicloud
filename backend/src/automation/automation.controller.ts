import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../tenant/tenant.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { OrgRole } from '../rbac/roles.enum';
import { CurrentOrganization } from '../tenant/tenant.decorators';
import { Organization } from '../db/entites/organization.entity';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { estimateCostBodySchema, runAutomationBodySchema } from './dto';
import type { EstimateCostBodyDto, RunAutomationBodyDto } from './dto';
import { AutomationService } from './automation.service';
import {
    AutomationExecutionResponseDto,
    CostEstimateResponseDto,
    EstimateRequestDto,
    RunAutomationRequestDto,
} from './swagger.dto';
import { ApiPaginationQuery } from '../common/swagger/pagination-query.swagger';

@ApiTags('Automation')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',
    description: 'UUID da organização ativa',
    required: true,
})
@UseGuards(TenantGuard, RolesGuard)
@Controller('automation')
export class AutomationController {
    constructor(private readonly automationService: AutomationService) {}

    @Post('estimate')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Estimar custo de um fluxo de automação (sem provisionar)' })
    @ApiBody({ type: EstimateRequestDto })
    @ApiResponse({ status: 200, type: CostEstimateResponseDto, description: 'Estimativa de custo com os 3 modelos de precificação' })
    @ApiResponse({ status: 400, description: 'Fluxo inválido' })
    estimate(@Body(new ZodValidationPipe(estimateCostBodySchema)) dto: EstimateCostBodyDto): CostEstimateResponseDto {
        return this.automationService.estimateCost(dto);
    }

    @Post('run')
    @Roles(OrgRole.ADMIN, OrgRole.OWNER)
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Executar fluxo de automação e provisionar recursos na AWS' })
    @ApiBody({ type: RunAutomationRequestDto })
    @ApiResponse({ status: 201, type: AutomationExecutionResponseDto, description: 'Execução criada e recursos provisionados' })
    @ApiResponse({ status: 400, description: 'Fluxo inválido' })
    @ApiResponse({ status: 403, description: 'Requer role ADMIN ou OWNER' })
    async run(
        @CurrentOrganization() org: Organization,
        @Body(new ZodValidationPipe(runAutomationBodySchema)) dto: RunAutomationBodyDto,
    ) {
        return this.automationService.runAutomation(dto, org.id);
    }

    @Get('executions')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar execuções de automação da organização' })
    @ApiResponse({ status: 200, type: [AutomationExecutionResponseDto] })
    async listExecutions(@CurrentOrganization() org: Organization) {
        return this.automationService.listExecutions(org.id);
    }

    @Get('executions/:id')
    @ApiOperation({ summary: 'Obter detalhes de uma execução de automação' })
    @ApiResponse({ status: 200, type: AutomationExecutionResponseDto })
    @ApiResponse({ status: 404, description: 'Execução não encontrada' })
    async getExecution(@CurrentOrganization() org: Organization, @Param('id') id: string) {
        return this.automationService.getExecution(id, org.id);
    }
}
