import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

    @ApiPropertyOptional({
        example: '12345678901',
        description: 'CPF do usuário (11 dígitos)',
        pattern: '^\\d{11}$',
        minLength: 11,
        maxLength: 11,
    })
    cpf?: string;

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
        example: 'r7eQ8m5E5P6GQx0i9R4d3j1sK8gL2nV7hT6yP1cQ4rW9uA3mB2',
        description: 'Refresh token opaco usado para renovar a sessão',
    })
    refreshToken: string;
}

export class GoogleExchangeRequestDto {
    @ApiProperty({
        example: 'qk1V5rS0nM2xZ8pL4dJ9fH6wC3bT7yN1uA5eR0iK8gP2sD6',
        description: 'Código temporário e de uso único emitido no callback do Google',
    })
    code: string;
}

export class AuthResponseDto {
    @ApiProperty({
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        description: 'Token JWT de acesso',
    })
    accessToken: string;

    @ApiProperty({
        example: 'r7eQ8m5E5P6GQx0i9R4d3j1sK8gL2nV7hT6yP1cQ4rW9uA3mB2',
        description: 'Refresh token opaco armazenado apenas em cookie HttpOnly no frontend',
    })
    refreshToken: string;
}

export class LogoutResponseDto {
    @ApiProperty({
        example: true,
        description: 'Indica se a operação foi bem-sucedida',
    })
    success: boolean;
}

export class AuthUserResponseDto {
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
        nullable: true,
    })
    cpf: string | null;

    @ApiProperty({
        example: true,
        description: 'Status de ativação do usuário',
    })
    isActive: boolean;
}
