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
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        description: 'Token JWT de acesso para renovação',
    })
    token: string;
}

export class AuthResponseDto {
    @ApiProperty({
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        description: 'Token JWT de acesso',
    })
    accessToken: string;
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
