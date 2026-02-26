import { Body, Controller, Get, Post, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import type { JwtPayload } from './auth.service';
import { loginSchema, refreshTokenSchema, registerSchema } from './dto';
import type { LoginDto, RefreshTokenDto, RegisterDto } from './dto';
import { CurrentUser, Public } from './decorators';
import { TenantGuard } from '../tenant/tenant.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RegisterRequestDto, LoginRequestDto, RefreshTokenRequestDto, AuthResponseDto, UserResponseDto } from './swagger.dto';

@ApiTags('Auth')
@UseGuards(TenantGuard)
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Public()
    @Post('register')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Registrar novo usuário' })
    @ApiBody({
        description: 'Dados para registrar novo usuário',
        type: RegisterRequestDto,
    })
    @ApiResponse({
        status: 200,
        description: 'Usuário registrado com sucesso',
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
        status: 400,
        description: 'Erro de validação',
        schema: {
            example: {
                statusCode: 400,
                error: 'BadRequest',
                message: ['name must be at least 2 characters'],
                path: '/api/auth/register',
                timestamp: '2026-02-25T10:00:00.000Z',
            },
        },
    })
    @ApiResponse({
        status: 409,
        description: 'Email ou CPF já em uso',
        schema: {
            example: {
                statusCode: 409,
                error: 'Conflict',
                message: 'This email is already in use',
                path: '/api/auth/register',
                timestamp: '2026-02-25T10:00:00.000Z',
            },
        },
    })
    register(
        @Body(new ZodValidationPipe(registerSchema))
        body: RegisterDto
    ) {
        return this.authService.register(body);
    }

    @Public()
    @Post('login')
    @ApiOperation({ summary: 'Fazer login' })
    @ApiBody({
        description: 'Credenciais para fazer login',
        type: LoginRequestDto,
    })
    @ApiResponse({
        status: 200,
        description: 'Login bem-sucedido',
        schema: {
            example: {
                accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                refreshToken: '550e8400-e29b-41d4-a716-446655440000',
            },
        },
    })
    @ApiResponse({
        status: 401,
        description: 'Credenciais inválidas',
        schema: {
            example: {
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Invalid email or password',
                path: '/api/auth/login',
                timestamp: '2026-02-25T10:00:00.000Z',
            },
        },
    })
    login(
        @Body(new ZodValidationPipe(loginSchema))
        body: LoginDto
    ) {
        return this.authService.login(body);
    }

    @Public()
    @Post('refresh')
    @ApiOperation({ summary: 'Renovar token de acesso' })
    @ApiBody({
        description: 'Token de refresh para renovar o token de acesso',
        type: RefreshTokenRequestDto,
    })
    @ApiResponse({
        status: 200,
        description: 'Token renovado com sucesso',
        schema: {
            example: {
                accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                refreshToken: '550e8400-e29b-41d4-a716-446655440000',
            },
        },
    })
    @ApiResponse({
        status: 401,
        description: 'Token inválido ou expirado',
        schema: {
            example: {
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Invalid or expired refresh token',
                path: '/api/auth/refresh',
                timestamp: '2026-02-25T10:00:00.000Z',
            },
        },
    })
    refresh(
        @Body(new ZodValidationPipe(refreshTokenSchema))
        body: RefreshTokenDto
    ) {
        return this.authService.refresh(body.refreshToken);
    }

    @Post('logout')
    @ApiBearerAuth('access-token')
    @ApiOperation({ summary: 'Fazer logout' })
    @ApiResponse({
        status: 200,
        description: 'Logout bem-sucedido',
        schema: {
            example: {
                success: true,
            },
        },
    })
    logout(@CurrentUser() user: JwtPayload) {
        return this.authService.logout(user.sessionId);
    }

    @Get('me')
    @ApiBearerAuth('access-token')
    @ApiOperation({ summary: 'Obter dados do usuário autenticado' })
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
        status: 401,
        description: 'Token inválido ou expirado',
    })
    getMe(@CurrentUser() user: JwtPayload) {
        return this.authService.getMe(user.sub);
    }
}
