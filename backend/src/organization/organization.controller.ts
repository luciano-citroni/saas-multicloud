import { Body, Controller, Delete, Get, Param, Patch, Post, HttpCode, HttpStatus } from '@nestjs/common';

import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../common/swagger/pagination-query.swagger';

import { OrganizationService } from './organization.service';

import { CurrentUser } from '../auth/decorators';

import type { JwtPayload } from '../auth/auth.service';

import { SkipTenant } from '../tenant/tenant.decorators';

import { createOrganizationSchema, organizationIdParamSchema, updateOrganizationSchema } from './dto';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import {
    CreateOrganizationRequestDto,
    UpdateOrganizationRequestDto,
    OrganizationResponseDto,
    DeleteOrganizationResponseDto,
    LeaveOrganizationResponseDto,
} from './swagger.dto';

@SkipTenant()
@ApiTags('Organizations')
@ApiBearerAuth('access-token')
@Controller('organization')
export class OrganizationController {
    constructor(private readonly organizationService: OrganizationService) {}

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Criar nova organização' })
    @ApiBody({
        description: 'Dados para criar nova organização',

        type: CreateOrganizationRequestDto,
    })
    @ApiResponse({ status: 200, description: 'Organização criada com sucesso', type: OrganizationResponseDto })
    @ApiResponse({
        status: 400,

        description: 'Erro de validação',
    })
    @ApiResponse({
        status: 409,

        description: 'CNPJ já em uso',

        schema: {
            example: {
                statusCode: 409,

                error: 'Conflict',

                message: 'This CNPJ is already in use',

                path: '/api/organization',

                timestamp: '2026-02-25T10:00:00.000Z',
            },
        },
    })
    create(
        @CurrentUser() user: JwtPayload,

        @Body(new ZodValidationPipe(createOrganizationSchema))
        body: {
            name: string;

            cnpj: string;
        }
    ) {
        return this.organizationService.create(body, user.sub);
    }

    @Get()
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar todas as organizações' })
    @ApiResponse({ status: 200, description: 'Lista de organizações', type: OrganizationResponseDto, isArray: true })
    @ApiResponse({
        status: 401,

        description: 'Token inválido ou expirado',
    })
    findAll(@CurrentUser() user: JwtPayload) {
        return this.organizationService.findAll(user.sub);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obter detalhes de uma organização' })
    @ApiResponse({ status: 200, description: 'Dados da organização', type: OrganizationResponseDto })
    @ApiResponse({
        status: 404,

        description: 'Organização não encontrada',

        schema: {
            example: {
                statusCode: 404,

                error: 'Not Found',

                message: 'Organization not found',

                path: '/api/organization/123e4567-e89b-12d3-a456-426614174000',

                timestamp: '2026-02-25T10:00:00.000Z',
            },
        },
    })
    findOne(
        @CurrentUser() user: JwtPayload,

        @Param(new ZodValidationPipe(organizationIdParamSchema))
        params: {
            id: string;
        }
    ) {
        return this.organizationService.findOne(params.id, user.sub);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Atualizar dados da organização' })
    @ApiBody({
        description: 'Campos a atualizar na organização',

        type: UpdateOrganizationRequestDto,
    })
    @ApiResponse({ status: 200, description: 'Organização atualizada com sucesso', type: OrganizationResponseDto })
    @ApiResponse({
        status: 403,

        description: 'Apenas admin ou owner podem editar a organização',
    })
    @ApiResponse({
        status: 404,

        description: 'Organização não encontrada',
    })
    @ApiResponse({
        status: 409,

        description: 'CNPJ já em uso',
    })
    update(
        @CurrentUser() user: JwtPayload,

        @Param(new ZodValidationPipe(organizationIdParamSchema))
        params: { id: string },

        @Body(new ZodValidationPipe(updateOrganizationSchema))
        body: { name?: string; cnpj?: string }
    ) {
        return this.organizationService.update(params.id, body, user.sub);
    }

    @Delete(':id/leave')
    @ApiOperation({ summary: 'Sair da organização' })
    @ApiResponse({ status: 200, description: 'Usuário saiu da organização com sucesso', type: LeaveOrganizationResponseDto })
    @ApiResponse({ status: 403, description: 'Owner não pode sair da organização sem transferir propriedade ou excluí-la' })
    @ApiResponse({ status: 404, description: 'Membro não encontrado na organização' })
    leave(
        @CurrentUser() user: JwtPayload,

        @Param(new ZodValidationPipe(organizationIdParamSchema))
        params: {
            id: string;
        }
    ) {
        return this.organizationService.leave(params.id, user.sub);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Deletar organização' })
    @ApiResponse({ status: 200, description: 'Organização deletada com sucesso', type: DeleteOrganizationResponseDto })
    @ApiResponse({
        status: 404,

        description: 'Organização não encontrada',
    })
    remove(
        @CurrentUser() user: JwtPayload,

        @Param(new ZodValidationPipe(organizationIdParamSchema))
        params: {
            id: string;
        }
    ) {
        return this.organizationService.remove(params.id, user.sub);
    }
}
