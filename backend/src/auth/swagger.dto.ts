import { ApiProperty } from '@nestjs/swagger';

export class RegisterRequestDto {
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
        example: '12345678901',
        description: 'CPF do usuário (11 dígitos)',
        pattern: '^\\d{11}$',
        minLength: 11,
        maxLength: 11,
    })
    cpf: string;

    @ApiProperty({
        example: 'MyPassword123!',
        description: 'Senha com pelo menos 8 caracteres, contendo maiúscula, minúscula, número e caractere especial',
        minLength: 8,
    })
    password: string;
}

export class LoginRequestDto {
    @ApiProperty({
        example: 'user@example.com',
        description: 'Email do usuário',
        format: 'email',
    })
    email: string;

    @ApiProperty({
        example: 'MyPassword123!',
        description: 'Senha do usuário',
    })
    password: string;
}

export class RefreshTokenRequestDto {
    @ApiProperty({
        example: '550e8400-e29b-41d4-a716-446655440000',
        description: 'Token de refresh para renovar o token de acesso',
    })
    refreshToken: string;
}

export class AuthResponseDto {
    @ApiProperty({
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        description: 'Token JWT de acesso (válido por 15 minutos)',
    })
    accessToken: string;

    @ApiProperty({
        example: '550e8400-e29b-41d4-a716-446655440000',
        description: 'Token de refresh para renovar o accessToken (válido por 7 dias)',
    })
    refreshToken: string;
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
        example: '12345678901',
        description: 'CPF do usuário',
    })
    cpf: string;

    @ApiProperty({
        example: true,
        description: 'Status de ativação do usuário',
    })
    isActive: boolean;
}
