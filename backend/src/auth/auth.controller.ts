import { Body, Controller, Get, Post, HttpCode, HttpStatus, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import type { JwtPayload } from './auth.service';
import { loginSchema, refreshTokenSchema, registerSchema, registerWithInviteSchema } from './dto';
import type { LoginDto, RefreshTokenDto, RegisterDto, RegisterWithInviteDto } from './dto';
import { CurrentUser, Public, AllowMissingOrganization } from './decorators';
import { TenantGuard } from '../tenant/tenant.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RegisterRequestDto, LoginRequestDto, RefreshTokenRequestDto, AuthResponseDto, AuthUserResponseDto, LogoutResponseDto } from './swagger.dto';
import type { GoogleProfile } from './google.strategy';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly configService: ConfigService
    ) {}

    @Public()
    @Post('register')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Registrar novo usuário' })
    @ApiBody({
        description: 'Dados para registrar novo usuário',
        type: RegisterRequestDto,
    })
    @ApiResponse({ status: 200, description: 'Usuário registrado com sucesso', type: AuthUserResponseDto })
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
    @Post('register-with-invite')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Registrar novo usuário com convite de organização' })
    @ApiBody({
        description: 'Dados para registrar novo usuário e aceitar convite de organização',
        schema: {
            type: 'object',
            properties: {
                name: { type: 'string', example: 'João Silva' },
                email: { type: 'string', example: 'joao@example.com' },
                cpf: { type: 'string', example: '12345678901' },
                password: { type: 'string', example: 'SecurePass@123' },
                inviteToken: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
            },
        },
    })
    @ApiResponse({
        status: 200,
        description: 'Usuário registrado e convite aceito com sucesso',
        schema: {
            example: {
                accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                user: {
                    id: '123e4567-e89b-12d3-a456-426614174000',
                    email: 'joao@example.com',
                    name: 'João Silva',
                    cpf: '12345678901',
                    isActive: true,
                },
            },
        },
    })
    @ApiResponse({
        status: 400,
        description: 'Erro de validação ou convite expirado',
    })
    @ApiResponse({
        status: 409,
        description: 'Email ou CPF já em uso',
    })
    registerWithInvite(
        @Body(new ZodValidationPipe(registerWithInviteSchema))
        body: RegisterWithInviteDto
    ) {
        return this.authService.registerWithInvite(body);
    }

    @Public()
    @Post('login')
    @ApiOperation({ summary: 'Fazer login' })
    @ApiBody({
        description: 'Credenciais para fazer login',
        type: LoginRequestDto,
    })
    @ApiResponse({ status: 200, description: 'Login bem-sucedido', type: AuthResponseDto })
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
        description: 'Token JWT de acesso para renovação',
        type: RefreshTokenRequestDto,
    })
    @ApiResponse({ status: 200, description: 'Token renovado com sucesso', type: AuthResponseDto })
    @ApiResponse({
        status: 401,
        description: 'Token inválido ou expirado',
        schema: {
            example: {
                statusCode: 401,
                error: 'Unauthorized',
                message: 'Invalid or expired token',
                path: '/api/auth/refresh',
                timestamp: '2026-02-25T10:00:00.000Z',
            },
        },
    })
    refresh(
        @Body(new ZodValidationPipe(refreshTokenSchema))
        body: RefreshTokenDto
    ) {
        return this.authService.refresh(body.token);
    }

    @Post('logout')
    @AllowMissingOrganization()
    @UseGuards(TenantGuard)
    @ApiBearerAuth('access-token')
    @ApiOperation({ summary: 'Fazer logout' })
    @ApiResponse({ status: 200, description: 'Logout bem-sucedido', type: LogoutResponseDto })
    logout(@CurrentUser() user: JwtPayload) {
        return this.authService.logout(user.sessionId);
    }

    @Get('me')
    @AllowMissingOrganization()
    @UseGuards(TenantGuard)
    @ApiBearerAuth('access-token')
    @ApiOperation({ summary: 'Obter dados do usuário autenticado' })
    @ApiResponse({ status: 200, description: 'Dados do usuário', type: AuthUserResponseDto })
    @ApiResponse({
        status: 401,
        description: 'Token inválido ou expirado',
    })
    getMe(@CurrentUser() user: JwtPayload) {
        return this.authService.getMe(user.sub);
    }

    @Public()
    @Get('google')
    @UseGuards(AuthGuard('google'))
    @ApiOperation({ summary: 'Iniciar autenticação com Google' })
    @ApiResponse({ status: 302, description: 'Redireciona para a página de autenticação do Google' })
    googleAuth() {
        // O guard do Passport redireciona para o Google automaticamente
    }

    @Public()
    @Get('google/callback')
    @UseGuards(AuthGuard('google'))
    @ApiOperation({ summary: 'Callback do Google OAuth' })
    @ApiResponse({ status: 302, description: 'Redireciona para o frontend com o token JWT' })
    async googleCallback(@CurrentUser() googleUser: GoogleProfile, @Res() res: Response) {
        const { accessToken } = await this.authService.googleAuthOrRegister(googleUser);
        const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
        res.redirect(`${frontendUrl}/auth/google/callback?token=${accessToken}`);
    }
}
