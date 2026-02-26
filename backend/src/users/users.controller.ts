import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { SkipTenant } from '../tenant/tenant.decorators';
import { createUserSchema, updateUserSchema, userIdParamSchema } from './dto';
import type { CreateUserDto, UpdateUserDto } from './dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UpdateUserRequestDto } from './swagger.dto';

@SkipTenant()
@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get()
    @ApiOperation({ summary: 'Listar todos os usuários' })
    @ApiResponse({
        status: 200,
        description: 'Lista de usuários',
        schema: {
            example: [
                {
                    id: '123e4567-e89b-12d3-a456-426614174000',
                    email: 'user@example.com',
                    name: 'John Doe',
                    cpf: '12345678901',
                    isActive: true,
                },
            ],
        },
    })
    @ApiResponse({
        status: 401,
        description: 'Token inválido ou expirado',
    })
    findAll() {
        return this.usersService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Obter detalhes de um usuário' })
    @ApiResponse({
        status: 200,
        description: 'Dados do usuário',
        schema: {
            example: {
                id: '123e4567-e89b-12d3-a456-426614174000',
                email: 'user@example.com',
                name: 'John Doe',
                cpf: '12345678901',
                isActive: true,
            },
        },
    })
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
    findOne(
        @Param(new ZodValidationPipe(userIdParamSchema))
        params: {
            id: string;
        }
    ) {
        return this.usersService.findById(params.id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Atualizar dados do usuário' })
    @ApiBody({
        description: 'Campos a atualizar no usuário',
        type: UpdateUserRequestDto,
    })
    @ApiResponse({
        status: 200,
        description: 'Usuário atualizado com sucesso',
        schema: {
            example: {
                id: '123e4567-e89b-12d3-a456-426614174000',
                email: 'newemail@example.com',
                name: 'Jane Doe',
                cpf: '12345678901',
                isActive: true,
            },
        },
    })
    @ApiResponse({
        status: 404,
        description: 'Usuário não encontrado',
    })
    @ApiResponse({
        status: 409,
        description: 'Email ou CPF já em uso',
    })
    update(
        @Param(new ZodValidationPipe(userIdParamSchema))
        params: { id: string },
        @Body(new ZodValidationPipe(updateUserSchema))
        body: UpdateUserDto
    ) {
        return this.usersService.update(params.id, body);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Deletar usuário' })
    @ApiResponse({
        status: 200,
        description: 'Usuário deletado com sucesso',
        schema: {
            example: {
                id: '123e4567-e89b-12d3-a456-426614174000',
                deleted: true,
            },
        },
    })
    @ApiResponse({
        status: 404,
        description: 'Usuário não encontrado',
    })
    remove(
        @Param(new ZodValidationPipe(userIdParamSchema))
        params: {
            id: string;
        }
    ) {
        return this.usersService.remove(params.id);
    }
}
