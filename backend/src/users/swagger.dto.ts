import { ApiProperty } from '@nestjs/swagger';

export class CreateUserRequestDto {
    @ApiProperty({
        example: 'John Doe',

        description: 'Nome completo do usuário',

        minLength: 2,

        maxLength: 255,
    })
    name: string;

    @ApiProperty({
        example: 'user@example.com',

        description: 'Email único do usuário',

        format: 'email',
    })
    email: string;

    @ApiProperty({
        example: 'MyPassword123!',

        description: 'Senha com pelo menos 8 caracteres',
    })
    password: string;
}

export class UpdateUserRequestDto {
    @ApiProperty({
        example: 'Jane Doe',

        description: 'Novo nome do usuário',

        required: false,

        minLength: 2,

        maxLength: 255,
    })
    name?: string;

    @ApiProperty({
        example: 'newemail@example.com',

        description: 'Novo email do usuário',

        required: false,

        format: 'email',
    })
    email?: string;

    @ApiProperty({
        example: true,

        description: 'Status de ativação do usuário',

        required: false,
    })
    isActive?: boolean;
}

export class UserResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',

        description: 'ID único do usuário (UUID)',
    })
    id: string;

    @ApiProperty({
        example: 'user@example.com',

        description: 'Email do usuário',
    })
    email: string;

    @ApiProperty({
        example: 'John Doe',

        description: 'Nome completo do usuário',
    })
    name: string;

    @ApiProperty({
        example: true,

        description: 'Status de ativação do usuário',
    })
    isActive: boolean;
}

export class DeleteUserResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',

        description: 'ID do usuário deletado',
    })
    id: string;

    @ApiProperty({
        example: true,

        description: 'Confirmação de deleção',
    })
    deleted: boolean;
}
