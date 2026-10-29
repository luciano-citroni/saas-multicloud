import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { OrganizationService } from './organization.service';

import { TenantGuard } from '../tenant/tenant.guard';

import { RolesGuard } from '../rbac/roles.guard';

import { Roles } from '../rbac/roles.decorator';

import { OrgRole } from '../rbac/roles.enum';

import { CurrentMembership, CurrentOrganization } from '../tenant/tenant.decorators';

import { CurrentUser } from '../auth/decorators';

import type { JwtPayload } from '../auth/auth.service';

import { Tenant, TenantMember } from '../db/entites';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import {
    addToOrgSchema,
    inviteIdParamSchema,
    inviteMemberSchema,
    memberOrgAccessParamSchema,
    memberUserIdParamSchema,
    updateMemberRoleSchema,
} from './dto';

import type { AddToOrgDto, InviteIdParam, InviteMemberDto, MemberOrgAccessParam, MemberUserIdParam, UpdateMemberRoleDto } from './dto';

import {
    AddToOrgRequestDto,
    CancelInviteResponseDto,
    InviteMemberRequestDto,
    InviteListItemResponseDto,
    InviteResponseDto,
    MemberResponseDto,
    MemberWithUserResponseDto,
    OrgAccessItemResponseDto,
    RemoveMemberResponseDto,
    UpdateMemberRoleRequestDto,
} from './swagger.dto';

import { SkipTenant } from '../tenant/tenant.decorators';

/**


 * Gerenciamento de membros de uma organização.


 *


 * Todos os endpoints exigem:


 *   1. Token JWT válido


 *   2. Header `x-organization-id` com uma org à qual o usuário pertence


 *   3. Role mínima de ADMIN


 */

@ApiTags('Organization Members')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',

    description: 'UUID da organização ativa (contexto de tenant)',

    required: true,
})
@UseGuards(TenantGuard, RolesGuard)
@Controller('organization/members')
export class MembersController {
    constructor(private readonly organizationService: OrganizationService) {}

    @Get()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Listar membros da organização' })
    @ApiResponse({ status: 200, description: 'Lista de membros', type: [MemberWithUserResponseDto] })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    listMembers(
        @CurrentOrganization() organization: Tenant,
        @Query('page') page?: string,
        @Query('limit') limit?: string
    ) {
        if (page != null || limit != null) {
            const parsedPage = page ? Number.parseInt(page, 10) : 1;
            const parsedLimit = limit ? Number.parseInt(limit, 10) : 25;
            return this.organizationService.listMembersPaginated(
                organization.id,
                Number.isFinite(parsedPage) ? parsedPage : 1,
                Number.isFinite(parsedLimit) ? parsedLimit : 25
            );
        }

        return this.organizationService.listMembers(organization.id);
    }

    @Get('invites')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Listar convites pendentes da organização' })
    @ApiResponse({ status: 200, description: 'Lista de convites pendentes', type: [InviteListItemResponseDto] })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    listInvites(@CurrentOrganization() organization: Tenant) {
        return this.organizationService.listPendingInvites(organization.id);
    }

    @Post('invites/:inviteId/resend')
    @HttpCode(HttpStatus.OK)
    @Roles(OrgRole.ADMIN)
    @ApiOperation({ summary: 'Reenviar e-mail de convite pendente' })
    @ApiResponse({ status: 200, description: 'Convite reenviado com sucesso', type: InviteResponseDto })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Acesso negado - apenas ADMIN+' })
    @ApiResponse({ status: 404, description: 'Convite não encontrado' })
    resendInvite(
        @CurrentUser() user: JwtPayload,
        @CurrentOrganization() organization: Tenant,
        @Param(new ZodValidationPipe(inviteIdParamSchema)) params: InviteIdParam
    ) {
        return this.organizationService.resendInvite(params.inviteId, organization.id, user.sub);
    }

    @Delete('invites/:inviteId')
    @HttpCode(HttpStatus.OK)
    @Roles(OrgRole.ADMIN)
    @ApiOperation({ summary: 'Cancelar convite pendente' })
    @ApiResponse({ status: 200, description: 'Convite cancelado com sucesso', type: CancelInviteResponseDto })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Acesso negado - apenas ADMIN+' })
    @ApiResponse({ status: 404, description: 'Convite não encontrado' })
    cancelInvite(@CurrentOrganization() organization: Tenant, @Param(new ZodValidationPipe(inviteIdParamSchema)) params: InviteIdParam) {
        return this.organizationService.cancelInvite(params.inviteId, organization.id);
    }

    @Get(':userId/orgs')
    @SkipTenant()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Listar organizações acessíveis por um usuário (escopo cross-org)' })
    @ApiResponse({ status: 200, description: 'Lista de orgs que o solicitante gerencia + role do alvo em cada uma', type: [OrgAccessItemResponseDto] })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    getUserOrgAccess(@CurrentUser() user: JwtPayload, @Param(new ZodValidationPipe(memberUserIdParamSchema)) params: MemberUserIdParam) {
        return this.organizationService.getUserCrossOrgAccess(params.userId, user.sub);
    }

    @Post(':userId/add-to-org')
    @SkipTenant()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Adicionar usuário diretamente a uma organização (sem e-mail de convite)' })
    @ApiBody({ type: AddToOrgRequestDto })
    @ApiResponse({ status: 200, description: 'Usuário adicionado com sucesso', type: MemberResponseDto })
    @ApiResponse({ status: 400, description: 'Dados inválidos' })
    @ApiResponse({ status: 403, description: 'Sem permissão na organização de destino' })
    @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
    @ApiResponse({ status: 409, description: 'Usuário já é membro da organização' })
    addMemberToOrg(
        @CurrentUser() user: JwtPayload,
        @Param(new ZodValidationPipe(memberUserIdParamSchema)) params: MemberUserIdParam,
        @Body(new ZodValidationPipe(addToOrgSchema)) body: AddToOrgDto
    ) {
        return this.organizationService.addMemberToOrg(params.userId, body, user.sub);
    }

    @Delete(':userId/orgs/:organizationId')
    @SkipTenant()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Remover usuário de uma organização específica (escopo cross-org)' })
    @ApiResponse({ status: 200, description: 'Usuário removido da organização com sucesso', type: RemoveMemberResponseDto })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem permissão na organização de destino' })
    @ApiResponse({ status: 404, description: 'Membro não encontrado na organização' })
    removeMemberFromOrg(@CurrentUser() user: JwtPayload, @Param(new ZodValidationPipe(memberOrgAccessParamSchema)) params: MemberOrgAccessParam) {
        return this.organizationService.removeMemberFromOrg(params.userId, params.organizationId, user.sub);
    }

    /**


     * Convida um usuário para a organização via e-mail.


     * Um e-mail com link de aceite será enviado para o endereço informado.


     * Apenas ADMIN e OWNER podem enviar convites.


     */

    @Post('invite')
    @HttpCode(HttpStatus.OK)
    @Roles(OrgRole.ADMIN)
    @ApiOperation({ summary: 'Convidar usuário para a organização via e-mail' })
    @ApiBody({
        description: 'Dados do convite',

        type: InviteMemberRequestDto,
    })
    @ApiResponse({
        status: 200,

        description: 'Convite criado e e-mail enviado com sucesso',

        type: InviteResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Dados inválidos - e-mail ou cargo incorretos' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Acesso negado - apenas ADMIN+' })
    @ApiResponse({
        status: 409,

        description: 'Usuário já é membro da organização',

        schema: {
            example: {
                statusCode: 409,

                error: 'Conflict',

                message: 'This user is already a member of the organization.',

                path: '/api/organization/members/invite',

                timestamp: '2026-03-03T10:00:00.000Z',
            },
        },
    })
    invite(
        @CurrentUser() user: JwtPayload,

        @CurrentOrganization() organization: Tenant,

        @Body(new ZodValidationPipe(inviteMemberSchema)) body: InviteMemberDto
    ) {
        return this.organizationService.inviteMember(organization.id, user.sub, body);
    }

    /**


     * Remove um membro da organização.


     * Apenas ADMIN e OWNER podem remover membros.


     * O OWNER não pode ser removido, e só é possível remover membros com cargo inferior ao seu.


     */

    @Delete(':userId')
    @HttpCode(HttpStatus.OK)
    @Roles(OrgRole.ADMIN)
    @ApiOperation({ summary: 'Remover membro da organização' })
    @ApiResponse({
        status: 200,

        description: 'Membro removido com sucesso',

        type: RemoveMemberResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem permissão - apenas ADMIN+ com cargo superior ao alvo' })
    @ApiResponse({
        status: 404,

        description: 'Membro não encontrado na organização',

        schema: {
            example: {
                statusCode: 404,

                error: 'Not Found',

                message: 'Member not found in this organization.',

                path: '/api/organization/members/123e4567-e89b-12d3-a456-426614174000',

                timestamp: '2026-03-03T10:00:00.000Z',
            },
        },
    })
    removeMember(
        @CurrentOrganization() organization: Tenant,

        @CurrentMembership() membership: TenantMember,

        @Param(new ZodValidationPipe(memberUserIdParamSchema)) params: MemberUserIdParam
    ) {
        return this.organizationService.removeMember(organization.id, params.userId, membership);
    }

    /**


     * Atualiza o cargo de um membro na organização.


     * Apenas ADMIN e OWNER podem alterar cargos.


     * Não é possível promover para OWNER nem alterar o cargo de quem tem cargo igual ou superior ao seu.


     */

    @Patch(':userId/role')
    @HttpCode(HttpStatus.OK)
    @Roles(OrgRole.ADMIN)
    @ApiOperation({ summary: 'Alterar cargo de um membro na organização' })
    @ApiBody({
        description: 'Novo cargo do membro',

        type: UpdateMemberRoleRequestDto,
    })
    @ApiResponse({
        status: 200,

        description: 'Cargo atualizado com sucesso',

        type: MemberResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Cargo inválido' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({
        status: 403,

        description: 'Sem permissão - não é possível modificar membro com cargo igual ou superior ao seu',
    })
    @ApiResponse({
        status: 404,

        description: 'Membro não encontrado na organização',
    })
    updateMemberRole(
        @CurrentOrganization() organization: Tenant,

        @CurrentMembership() membership: TenantMember,

        @Param(new ZodValidationPipe(memberUserIdParamSchema)) params: MemberUserIdParam,

        @Body(new ZodValidationPipe(updateMemberRoleSchema)) body: UpdateMemberRoleDto
    ) {
        return this.organizationService.updateMemberRole(organization.id, params.userId, body, membership);
    }
}
