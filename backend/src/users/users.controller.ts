import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';

import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../common/swagger/pagination-query.swagger';

import { UsersService } from './users.service';

import { CurrentMembership, CurrentOrganization } from '../tenant/tenant.decorators';

import { TenantGuard } from '../tenant/tenant.guard';

import { createUserSchema, updateUserSchema, userIdParamSchema } from './dto';

import type { CreateUserDto, UpdateUserDto } from './dto';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { UpdateUserRequestDto, UserResponseDto, DeleteUserResponseDto } from './swagger.dto';

import { Roles } from '../rbac/roles.decorator';

import { OrgRole } from '../rbac/roles.enum';

import { Organization } from '../db/entites';

import { OrganizationMember } from '../db/entites/organization-member.entity';

import { CurrentUser } from '../auth/decorators';

import type { JwtPayload } from '../auth/auth.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(TenantGuard)
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get()
    @ApiPaginationQuery()
    @Roles(OrgRole.ADMIN)
    @ApiOperation({ summary: 'Listar todos os usuários da organização' })
    @ApiResponse({ status: 200, description: 'Lista de usuários', type: UserResponseDto, isArray: true })
    @ApiResponse({
        status: 401,

        description: 'Token inválido ou expirado',
    })
    findAll(@CurrentOrganization() organization: Organization) {
        return this.usersService.findAll(organization.id);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obter detalhes de um usuário' })
    @ApiResponse({ status: 200, description: 'Dados do usuário', type: UserResponseDto })
    @ApiResponse({
        status: 404,

        description: 'Usuário não encontrado',

        schema: {
            example: {
                statusCode: 404,

                error: 'Not Found',

                message: 'User not found',

                path: '/api/users/123e4567-e89b-12d3-a456-426614174000',

                timestamp: '2026-02-25T10:00:00.000Z',
            },
        },
    })
    @ApiResponse({
        status: 403,

        description: 'Sem permissão para acessar dados de outro usuário',
    })
    findOne(
        @CurrentUser() user: JwtPayload,

        @CurrentOrganization() organization: Organization,

        @CurrentMembership() membership: OrganizationMember,

        @Param(new ZodValidationPipe(userIdParamSchema))
        params: {
            id: string;
        }
    ) {
        return this.usersService.findByIdInScope(params.id, {
            requesterUserId: user.sub,

            requesterRole: membership.role,

            organizationId: organization.id,
        });
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Atualizar dados do usuário' })
    @ApiBody({
        description: 'Campos a atualizar no usuário',

        type: UpdateUserRequestDto,
    })
    @ApiResponse({ status: 200, description: 'Usuário atualizado com sucesso', type: UserResponseDto })
    @ApiResponse({
        status: 404,

        description: 'Usuário não encontrado',
    })
    @ApiResponse({
        status: 409,

        description: 'Email ou CPF já em uso',
    })
    @ApiResponse({
        status: 403,

        description: 'Sem permissão para alterar dados de outro usuário',
    })
    update(
        @CurrentUser() user: JwtPayload,

        @CurrentOrganization() organization: Organization,

        @CurrentMembership() membership: OrganizationMember,

        @Param(new ZodValidationPipe(userIdParamSchema))
        params: { id: string },

        @Body(new ZodValidationPipe(updateUserSchema))
        body: UpdateUserDto
    ) {
        return this.usersService.updateInScope(params.id, body, {
            requesterUserId: user.sub,

            requesterRole: membership.role,

            organizationId: organization.id,
        });
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Deletar usuário' })
    @ApiResponse({ status: 200, description: 'Usuário deletado com sucesso', type: DeleteUserResponseDto })
    @ApiResponse({
        status: 404,

        description: 'Usuário não encontrado',
    })
    @ApiResponse({
        status: 403,

        description: 'Sem permissão para deletar outro usuário',
    })
    remove(
        @CurrentUser() user: JwtPayload,

        @CurrentOrganization() organization: Organization,

        @CurrentMembership() membership: OrganizationMember,

        @Param(new ZodValidationPipe(userIdParamSchema))
        params: {
            id: string;
        }
    ) {
        return this.usersService.removeInScope(params.id, {
            requesterUserId: user.sub,

            requesterRole: membership.role,

            organizationId: organization.id,
        });
    }
}
