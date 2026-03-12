import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { AwsEcrService } from './aws-ecr.service';
import { EcrRepositoryResponseDto, EcrRepositorySyncResponseDto } from './swagger.dto';

@ApiTags('AWS ECR')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard)
@Controller('aws/ecr')
export class AwsEcrController {
    constructor(private readonly service: AwsEcrService) {}

    @Get('accounts/:cloudAccountId/repositories')
    @ApiOperation({ summary: 'Listar repositórios ECR do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [EcrRepositoryResponseDto] })
    listRepositories(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listRepositoriesFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/repositories/:repositoryId')
    @ApiOperation({ summary: 'Buscar repositório ECR por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'repositoryId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: EcrRepositoryResponseDto })
    @ApiResponse({ status: 400, description: 'Repositório não encontrado' })
    getRepository(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('repositoryId', ParseUUIDPipe) repositoryId: string,
        @CurrentOrganization() org: Organization
    ) {
        return this.service.getRepositoryById(repositoryId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/repositories/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar repositórios ECR da AWS' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [EcrRepositorySyncResponseDto] })
    syncRepositories(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncRepositoriesFromAws(cloudAccountId, org.id);
    }
}
