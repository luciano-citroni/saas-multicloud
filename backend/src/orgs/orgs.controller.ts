import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../tenant/tenant.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { Roles } from '../rbac/roles.decorator';
import { OrgRole } from '../rbac/roles.enum';
import { CurrentMembership, CurrentOrganization } from '../tenant/tenant.decorators';
import { Tenant } from '../db/entites/tenant.entity';
import { TenantMember } from '../db/entites/tenant-member.entity';
import { CurrentUser } from '../auth/decorators';
import type { JwtPayload } from '../auth/auth.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { createOrgSchema, updateOrgSchema, orgIdParamSchema } from './orgs.dto';
import type { CreateOrgDto, UpdateOrgDto, OrgIdParam } from './orgs.dto';
import { OrgsService } from './orgs.service';

@ApiTags('Organizations')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',
    description: 'Tenant UUID (active tenant context)',
    required: true,
})
@UseGuards(TenantGuard, RolesGuard)
@Controller('organizations')
export class OrgsController {
    constructor(private readonly orgsService: OrgsService) {}

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Roles(OrgRole.MEMBER)
    @ApiOperation({ summary: 'Criar organização dentro do tenant' })
    @ApiResponse({ status: 201, description: 'Organização criada com sucesso' })
    create(
        @CurrentOrganization() tenant: Tenant,
        @CurrentMembership() membership: TenantMember,
        @CurrentUser() user: JwtPayload,
        @Body(new ZodValidationPipe(createOrgSchema)) body: CreateOrgDto
    ) {
        return this.orgsService.create(tenant.id, user.sub, membership.role, body);
    }

    @Get()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Listar organizações do tenant' })
    @ApiResponse({ status: 200, description: 'Lista de organizações' })
    findAll(
        @CurrentOrganization() tenant: Tenant,
        @CurrentUser() user: JwtPayload,
        @Query('page') page?: string,
        @Query('limit') limit?: string
    ) {
        if (page != null || limit != null) {
            const parsedPage = page ? Number.parseInt(page, 10) : 1;
            const parsedLimit = limit ? Number.parseInt(limit, 10) : 25;
            return this.orgsService.findAllPaginated(
                tenant.id,
                user.sub,
                Number.isFinite(parsedPage) ? parsedPage : 1,
                Number.isFinite(parsedLimit) ? parsedLimit : 25
            );
        }

        return this.orgsService.findAll(tenant.id, user.sub);
    }

    @Get(':id')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Obter detalhes de uma organização' })
    @ApiResponse({ status: 200, description: 'Dados da organização' })
    @ApiResponse({ status: 404, description: 'Organização não encontrada' })
    findOne(@CurrentOrganization() tenant: Tenant, @CurrentUser() user: JwtPayload, @Param(new ZodValidationPipe(orgIdParamSchema)) params: OrgIdParam) {
        return this.orgsService.findOne(params.id, tenant.id, user.sub);
    }

    @Patch(':id')
    @HttpCode(HttpStatus.OK)
    @Roles(OrgRole.ADMIN)
    @ApiOperation({ summary: 'Atualizar organização' })
    @ApiResponse({ status: 200, description: 'Organização atualizada' })
    @ApiResponse({ status: 403, description: 'Acesso negado – apenas ADMIN ou OWNER' })
    @ApiResponse({ status: 404, description: 'Organização não encontrada' })
    update(
        @CurrentOrganization() tenant: Tenant,
        @CurrentUser() user: JwtPayload,
        @Param(new ZodValidationPipe(orgIdParamSchema)) params: OrgIdParam,
        @Body(new ZodValidationPipe(updateOrgSchema)) body: UpdateOrgDto
    ) {
        return this.orgsService.update(params.id, tenant.id, user.sub, body);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    @Roles(OrgRole.ADMIN)
    @ApiOperation({ summary: 'Deletar organização' })
    @ApiResponse({ status: 200, description: 'Organização deletada' })
    @ApiResponse({ status: 403, description: 'Acesso negado – apenas ADMIN ou OWNER' })
    @ApiResponse({ status: 404, description: 'Organização não encontrada' })
    remove(@CurrentOrganization() tenant: Tenant, @CurrentUser() user: JwtPayload, @Param(new ZodValidationPipe(orgIdParamSchema)) params: OrgIdParam) {
        return this.orgsService.remove(params.id, tenant.id, user.sub);
    }
}
