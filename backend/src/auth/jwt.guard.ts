import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from './decorators';

@Injectable()
export class JwtGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly reflector: Reflector,
        private readonly configService: ConfigService
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

            request['user'] = payload;
        } catch {
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
