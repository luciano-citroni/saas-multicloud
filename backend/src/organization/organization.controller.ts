import { Body, Controller, Delete, Get, Param, Patch, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { SkipTenant } from '../tenant/tenant.decorators';
import { createOrganizationSchema, organizationIdParamSchema, updateOrganizationSchema } from './dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateOrganizationRequestDto, UpdateOrganizationRequestDto } from './swagger.dto';

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
    @ApiResponse({
        status: 200,
        description: 'Organização criada com sucesso',
        schema: {
            example: {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'ACME Corporation',
                cnpj: '12345678000190',
            },
        },
    })
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
        @Body(new ZodValidationPipe(createOrganizationSchema))
        body: {
            name: string;
            cnpj: string;
        }
    ) {
        return this.organizationService.create(body);
    }

    @Get()
    @ApiOperation({ summary: 'Listar todas as organizações' })
    @ApiResponse({
        status: 200,
        description: 'Lista de organizações',
        schema: {
            example: [
                {
                    id: '123e4567-e89b-12d3-a456-426614174000',
                    name: 'ACME Corporation',
                    cnpj: '12345678000190',
                },
            ],
        },
    })
    @ApiResponse({
        status: 401,
        description: 'Token inválido ou expirado',
    })
    findAll() {
        return this.organizationService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obter detalhes de uma organização' })
    @ApiResponse({
        status: 200,
        description: 'Dados da organização',
        schema: {
            example: {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'ACME Corporation',
                cnpj: '12345678000190',
            },
        },
    })
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
        @Param(new ZodValidationPipe(organizationIdParamSchema))
        params: {
            id: string;
        }
    ) {
        return this.organizationService.findOne(params.id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Atualizar dados da organização' })
    @ApiBody({
        description: 'Campos a atualizar na organização',
        type: UpdateOrganizationRequestDto,
    })
    @ApiResponse({
        status: 200,
        description: 'Organização atualizada com sucesso',
        schema: {
            example: {
                id: '123e4567-e89b-12d3-a456-426614174000',
                name: 'Updated ACME',
                cnpj: '12345678000190',
            },
        },
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
        @Param(new ZodValidationPipe(organizationIdParamSchema))
        params: { id: string },
        @Body(new ZodValidationPipe(updateOrganizationSchema))
        body: { name?: string; cnpj?: string }
    ) {
        return this.organizationService.update(params.id, body);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Deletar organização' })
    @ApiResponse({
        status: 200,
        description: 'Organização deletada com sucesso',
        schema: {
            example: {
                id: '123e4567-e89b-12d3-a456-426614174000',
                deleted: true,
            },
        },
    })
    @ApiResponse({
        status: 404,
        description: 'Organização não encontrada',
    })
    remove(
        @Param(new ZodValidationPipe(organizationIdParamSchema))
        params: {
            id: string;
        }
    ) {
        return this.organizationService.remove(params.id);
    }
}
