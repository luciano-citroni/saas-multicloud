import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IS_PUBLIC_KEY } from './decorators';
import { UserSession } from '../db/entites/user-session.entity';

@Injectable()
export class JwtGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly reflector: Reflector,
        private readonly configService: ConfigService,
        @InjectRepository(UserSession)
        private readonly sessionRepository: Repository<UserSession>
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);

        if (isPublic) return true;

        const request = context.switchToHttp().getRequest<Request>();
        const token = this.extractToken(request);

        if (!token) throw new UnauthorizedException('Missing access token');

        try {
            const payload = await this.jwtService.verifyAsync(token, this.buildVerifyOptions());

            if (!payload?.sub || !payload?.sessionId) {
                throw new UnauthorizedException('Invalid or expired access token');
            }

            // Verificar se a sessão existe no banco de dados
            const session = await this.sessionRepository.findOne({
                where: {
                    id: payload.sessionId,
                    userId: payload.sub,
                },
                relations: ['user'],
            });

            // Se a sessão não existe ou está expirada, o usuário não está autenticado
            if (!session) {
                throw new UnauthorizedException('Session not found');
            }

            if (session.expiresAt < new Date()) {
                // Remove sessão expirada
                await this.sessionRepository.remove(session);
                throw new UnauthorizedException('Session expired');
            }

            // Verificar se o usuário ainda está ativo
            if (!session.user || !session.user.isActive) {
                await this.sessionRepository.remove(session);
                throw new UnauthorizedException('User account is inactive');
            }

            request['user'] = payload;
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            throw new UnauthorizedException('Invalid or expired access token');
        }

        return true;
    }

    private extractToken(request: Request): string | null {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : null;
    }

    private buildVerifyOptions(): { issuer?: string; audience?: string } {
        const issuer = this.configService.get<string>('JWT_ISSUER');
        const audience = this.configService.get<string>('JWT_AUDIENCE');
        return {
            ...(issuer ? { issuer } : {}),
            ...(audience ? { audience } : {}),
        };
    }
}
