import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from './decorators';
import { UsersService } from '../users/users.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSession } from '../db/entites/user-session.entity';

@Injectable()
export class JwtGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly reflector: Reflector,
        private readonly configService: ConfigService,
        private readonly usersService: UsersService,
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

            // Validar se a sessão ainda existe
            const session = await this.sessionRepository.findOne({
                where: { id: payload.sessionId, userId: payload.sub },
                relations: ['user'],
            });

            // Sessão não encontrada = foi removida/revogada
            if (!session) {
                throw new UnauthorizedException('Session was revoked or does not exist. Please login again.');
            }

            // Sessão expirada
            if (session.expiresAt < new Date()) {
                await this.sessionRepository.remove(session);
                throw new UnauthorizedException('Session expired. Please login again.');
            }

            // Usuário desativado
            if (!session.user?.isActive) {
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
